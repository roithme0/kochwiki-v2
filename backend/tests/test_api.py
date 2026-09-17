from uuid import UUID

from fastapi.testclient import TestClient

from app.models.enums import Unit


def create_foodstuff(client: TestClient, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Oats",
        "brand": "",
        "unit": "G",
        "kcal": 370,
        "carbs": 60,
        "protein": 13,
        "fat": 7,
    }
    payload.update(overrides)
    response = client.post("/foodstuffs", json=payload)
    assert response.status_code == 201
    return response.json()


def recipe_version_payload(name: str, foodstuff_id: object | None = None, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": name,
        "servings": 2,
        "preptime": 10,
        "originName": "Home",
        "originUrl": "https://example.com/recipe",
        "ingredients": [],
        "steps": [{"index": 1, "description": "Cook"}],
    }
    if foodstuff_id is not None:
        payload["ingredients"] = [{"index": 1, "amount": 100, "foodstuffId": foodstuff_id}]
    payload.update(overrides)
    return payload


def create_recipe(client: TestClient, name: str, foodstuff_id: object | None = None) -> dict[str, object]:
    response = client.post("/recipes", json=recipe_version_payload(name, foodstuff_id))
    assert response.status_code == 201
    return response.json()


def recipe_presentation_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "servings": 2,
        "preptime": 20,
        "ingredients": [],
        "steps": [{"index": 1, "description": "Cook"}],
    }
    payload.update(overrides)
    return payload


def test_recipe_presentation_resolver_returns_live_ordered_non_persisted_presentation(
    client: TestClient,
) -> None:
    oats = create_foodstuff(client)
    egg = create_foodstuff(
        client, name="Egg", brand="Farm", unit="PIECE", kcal=78, carbs=1, protein=6, fat=5
    )

    response = client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[
                {"index": 2, "amount": 2, "foodstuffId": egg["id"]},
                {"index": 1, "amount": 50, "foodstuffId": oats["id"]},
            ],
            steps=[{"index": 2, "description": "Serve"}, {"index": 1, "description": "Cook"}],
        ),
    )

    assert response.status_code == 200
    presentation = response.json()
    assert set(presentation) == {
        "servings", "preptime", "kcal", "carbs", "protein", "fat", "ingredients", "steps"
    }
    assert presentation["kcal"] == 170.5
    assert presentation["carbs"] == 16
    assert presentation["protein"] == 9.25
    assert presentation["fat"] == 6.75
    assert [ingredient["index"] for ingredient in presentation["ingredients"]] == [1, 2]
    assert [step["index"] for step in presentation["steps"]] == [1, 2]
    assert set(presentation["ingredients"][0]) == {"index", "amount", "foodstuff"}
    assert presentation["ingredients"][1]["foodstuff"] == {
        "id": egg["id"],
        "name": "Egg",
        "brand": "Farm",
        "unit": "PIECE",
        "unitVerbose": "Stk.",
        "kcal": 78,
        "carbs": 1,
        "protein": 6,
        "fat": 5,
    }
    assert client.get("/recipes").json() == []
    assert client.get("/ingredients").json() == []
    assert client.get("/steps").json() == []

    assert client.patch(f"/foodstuffs/{oats['id']}", json={"kcal": 400}).status_code == 200
    updated = client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[{"index": 1, "amount": 50, "foodstuffId": oats["id"]}]
        ),
    )
    assert updated.status_code == 200
    assert updated.json()["kcal"] == 100


def test_recipe_presentation_resolver_keeps_nutrient_nullability_independent(client: TestClient) -> None:
    foodstuff = create_foodstuff(client, kcal=None)

    response = client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[{"index": 1, "amount": 100, "foodstuffId": foodstuff["id"]}]
        ),
    )

    assert response.status_code == 200
    assert response.json()["kcal"] is None
    assert response.json()["carbs"] == 30
    assert response.json()["protein"] == 6.5
    assert response.json()["fat"] == 3.5


def test_recipe_presentation_resolver_rejects_unknown_and_duplicate_references(client: TestClient) -> None:
    foodstuff = create_foodstuff(client)
    unknown = client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[
                {"index": 1, "amount": 1, "foodstuffId": 999},
                {"index": 2, "amount": 1, "foodstuffId": 998},
            ]
        ),
    )
    assert unknown.status_code == 404
    assert unknown.json()["message"] == "Foodstuff with id 998 not found"

    duplicate_foodstuff = client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[
                {"index": 1, "amount": 1, "foodstuffId": foodstuff["id"]},
                {"index": 2, "amount": 1, "foodstuffId": foodstuff["id"]},
            ]
        ),
    )
    assert duplicate_foodstuff.status_code == 422
    assert client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[
                {"index": 1, "amount": 1, "foodstuffId": foodstuff["id"]},
                {"index": 1, "amount": 1, "foodstuffId": foodstuff["id"] + 1},
            ]
        ),
    ).status_code == 422
    assert client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            steps=[{"index": 1, "description": "A"}, {"index": 1, "description": "B"}]
        ),
    ).status_code == 422


def test_recipe_presentation_resolver_requires_all_fields_and_enforces_bounds(client: TestClient) -> None:
    for field in ("servings", "preptime", "ingredients", "steps"):
        payload = recipe_presentation_payload()
        del payload[field]
        assert client.post("/recipe-presentations/resolve", json=payload).status_code == 422

    assert client.post(
        "/recipe-presentations/resolve", json=recipe_presentation_payload(servings=0)
    ).status_code == 422
    assert client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(steps=[{"index": 1, "description": ""}]),
    ).status_code == 422
    assert client.post(
        "/recipe-presentations/resolve", json={**recipe_presentation_payload(), "name": "Not accepted"}
    ).status_code == 422
    assert client.post(
        "/recipe-presentations/resolve",
        json=recipe_presentation_payload(
            ingredients=[{"index": 1, "amount": 1, "foodstuffId": 1, "kcal": 100}]
        ),
    ).status_code == 422


def test_recipe_contract_creates_active_lineage_and_derives_nutrition(client: TestClient) -> None:
    oats = create_foodstuff(client)
    recipe_version = create_recipe(client, "Oat breakfast", oats["id"])

    assert recipe_version["state"] == "active"
    assert UUID(recipe_version["recipeLineageId"]).version == 4
    assert UUID(recipe_version["recipeVersionId"]).version == 4
    assert recipe_version["kcal"] == 185
    assert recipe_version["carbs"] == 30
    assert set(recipe_version) >= {"recipeLineageId", "recipeVersionId", "state", "createdAt", "lastModified"}
    assert recipe_version["ingredients"][0]["recipeVersionId"] == recipe_version["recipeVersionId"]
    assert client.get(f"/foodstuffs/{oats['id']}").json()["recipeVersionIds"] == [recipe_version["recipeVersionId"]]
    assert client.get(f"/recipes/{recipe_version['recipeLineageId']}").json() == recipe_version
    assert client.get(f"/recipes/{recipe_version['recipeLineageId']}/history").json() == []


def test_active_edits_create_history_and_drafts_are_separate(client: TestClient) -> None:
    active_version = create_recipe(client, "Original")
    lineage_id = active_version["recipeLineageId"]

    draft_response = client.post(
        f"/recipes/{lineage_id}/drafts", json=recipe_version_payload("Alternative draft")
    )
    assert draft_response.status_code == 201
    draft_version = draft_response.json()
    assert draft_version["state"] == "draft"
    assert client.get(f"/recipes/{lineage_id}").json()["recipeVersionId"] == active_version["recipeVersionId"]

    published_version_response = client.post(
        f"/recipes/{lineage_id}/publish", json=recipe_version_payload("Published revision")
    )
    assert published_version_response.status_code == 200
    assert published_version_response.json()["state"] == "active"
    assert published_version_response.json()["recipeVersionId"] != active_version["recipeVersionId"]
    history = client.get(f"/recipes/{lineage_id}/history")
    assert history.status_code == 200
    assert [version["recipeVersionId"] for version in history.json()] == [active_version["recipeVersionId"]]
    assert history.json()[0]["name"] == "Original"

    listed = client.get("/recipes").json()
    assert {version["recipeVersionId"] for version in listed} == {published_version_response.json()["recipeVersionId"], draft_version["recipeVersionId"]}
    assert client.get(f"/recipes/{lineage_id}/versions/{active_version['recipeVersionId']}").json()["state"] == "historical"


def test_drafts_update_in_place_and_publish_without_affecting_other_drafts(client: TestClient) -> None:
    active_version = create_recipe(client, "Active")
    lineage_id = active_version["recipeLineageId"]
    first_draft_version = client.post(f"/recipes/{lineage_id}/drafts", json=recipe_version_payload("First draft")).json()
    second_draft_version = client.post(f"/recipes/{lineage_id}/drafts", json=recipe_version_payload("Second draft")).json()

    updated_draft_version_response = client.put(
        f"/recipes/{lineage_id}/drafts/{first_draft_version['recipeVersionId']}",
        json=recipe_version_payload("First draft updated"),
    )
    assert updated_draft_version_response.status_code == 200
    assert updated_draft_version_response.json()["recipeVersionId"] == first_draft_version["recipeVersionId"]
    assert updated_draft_version_response.json()["state"] == "draft"
    assert updated_draft_version_response.json()["lastModified"] >= first_draft_version["lastModified"]

    publication = client.post(f"/recipes/{lineage_id}/drafts/{first_draft_version['recipeVersionId']}/publish")
    assert publication.status_code == 200
    assert publication.json()["recipeVersionId"] == first_draft_version["recipeVersionId"]
    assert publication.json()["state"] == "active"
    assert client.get(f"/recipes/{lineage_id}/versions/{second_draft_version['recipeVersionId']}").json()["state"] == "draft"
    assert client.get(f"/recipes/{lineage_id}/history").json()[0]["recipeVersionId"] == active_version["recipeVersionId"]

    assert client.put(
        f"/recipes/{lineage_id}/drafts/{active_version['recipeVersionId']}", json=recipe_version_payload("Invalid")
    ).status_code == 409
    assert client.delete(f"/recipes/{lineage_id}/drafts/{active_version['recipeVersionId']}").status_code == 409


def test_duplicate_names_and_foodstuff_references_across_history_and_drafts(client: TestClient) -> None:
    foodstuff = create_foodstuff(client)
    first_recipe_version = create_recipe(client, "Same name", foodstuff["id"])
    second_recipe_version = create_recipe(client, "Same name", foodstuff["id"])
    assert first_recipe_version["recipeLineageId"] != second_recipe_version["recipeLineageId"]

    direct_publish = client.post(
        f"/recipes/{first_recipe_version['recipeLineageId']}/publish", json=recipe_version_payload("Same name", foodstuff["id"])
    )
    assert direct_publish.status_code == 200
    draft_version_response = client.post(
        f"/recipes/{first_recipe_version['recipeLineageId']}/drafts", json=recipe_version_payload("Same name", foodstuff["id"])
    )
    assert draft_version_response.status_code == 201
    assert client.delete(f"/foodstuffs/{foodstuff['id']}").status_code == 409

    assert client.delete(f"/recipes/{first_recipe_version['recipeLineageId']}/drafts/{draft_version_response.json()['recipeVersionId']}").status_code == 204
    assert client.delete(f"/recipes/{first_recipe_version['recipeLineageId']}").status_code == 204
    assert client.delete(f"/recipes/{second_recipe_version['recipeLineageId']}").status_code == 204
    assert client.delete(f"/foodstuffs/{foodstuff['id']}").status_code == 204


def test_foodstuff_lists_all_referencing_recipe_versions(client: TestClient) -> None:
    foodstuff = create_foodstuff(client)
    initial_recipe_version = create_recipe(client, "Initial", foodstuff["id"])
    draft_recipe_version = client.post(
        f"/recipes/{initial_recipe_version['recipeLineageId']}/drafts", json=recipe_version_payload("Draft", foodstuff["id"])
    ).json()
    active_recipe_version = client.post(
        f"/recipes/{initial_recipe_version['recipeLineageId']}/publish", json=recipe_version_payload("Published", foodstuff["id"])
    ).json()

    response = client.get(f"/foodstuffs/{foodstuff['id']}")

    assert response.status_code == 200
    assert response.json()["recipeVersionIds"] == sorted(
        [initial_recipe_version["recipeVersionId"], draft_recipe_version["recipeVersionId"], active_recipe_version["recipeVersionId"]]
    )


def test_validation_and_metadata_contracts(client: TestClient) -> None:
    invalid = client.post("/foodstuffs", json={"name": "Missing required values"})
    assert invalid.status_code == 422
    assert invalid.json()["statusCode"] == 422
    assert client.post("/recipes", json={"name": "Incomplete"}).status_code == 422
    assert client.post("/recipes", json=recipe_version_payload("Bad index", steps=[{"index": 1, "description": "A"}, {"index": 1, "description": "B"}])).status_code == 422
    assert client.patch("/foodstuffs/1", json={"name": None}).status_code == 422
    assert client.patch("/foodstuffs/1", json={"unit": None}).status_code == 422
    assert client.post("/recipes", json=recipe_version_payload("Invalid origin", originUrl="not a valid URL")).status_code == 422
    recipe_paths = client.get("/openapi.json").json()["paths"]
    assert "/recipes/{lineage_id}" in recipe_paths
    assert "/recipes/{lineage_id}/versions/{version_id}" in recipe_paths
    assert "/recipes/{recipe_id}" not in recipe_paths
    assert client.get("/foodstuffs-meta-data/unit-choices").json() == {unit.value: unit.verbose_name for unit in Unit}
    assert client.get("/meta/version").headers["content-type"].startswith("text/plain")


def test_put_draft_preflight_allows_browser_update(client: TestClient) -> None:
    response = client.options(
        "/recipes/1/drafts/00000000-0000-0000-0000-000000000001",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]


def test_recipe_orders_ingredients_and_steps(client: TestClient) -> None:
    oats = create_foodstuff(client)
    egg = create_foodstuff(client, name="Egg", unit="PIECE", kcal=78, carbs=1, protein=6, fat=5)
    response = client.post(
        "/recipes",
        json=recipe_version_payload(
            "Ordered recipe",
            ingredients=[
                {"index": 2, "amount": 2, "foodstuffId": egg["id"]},
                {"index": 1, "amount": 50, "foodstuffId": oats["id"]},
            ],
            steps=[{"index": 2, "description": "Serve"}, {"index": 1, "description": "Cook"}],
        ),
    )

    assert response.status_code == 201
    recipe_version = response.json()
    assert recipe_version["kcal"] == 170.5
    assert recipe_version["carbs"] == 16
    assert recipe_version["protein"] == 9.25
    assert recipe_version["fat"] == 6.75
    assert [ingredient["foodstuff"]["name"] for ingredient in recipe_version["ingredients"]] == ["Oats", "Egg"]
    assert [step["description"] for step in recipe_version["steps"]] == ["Cook", "Serve"]
    assert set(recipe_version["ingredients"][0]) == {"id", "index", "amount", "foodstuff", "recipeVersionId"}
    assert "recipeVersionIds" not in recipe_version["ingredients"][0]["foodstuff"]
    assert client.get("/ingredients").json()[0]["recipeVersionId"] == recipe_version["recipeVersionId"]
    assert client.get("/steps").json()[0]["recipeVersionId"] == recipe_version["recipeVersionId"]


def test_missing_nutrition_and_live_foodstuff_updates_affect_versions(client: TestClient) -> None:
    foodstuff = create_foodstuff(client, kcal=None)
    recipe_version = create_recipe(client, "Unknown calories", foodstuff["id"])
    assert recipe_version["kcal"] is None
    assert recipe_version["carbs"] == 30

    updated_foodstuff = client.patch(f"/foodstuffs/{foodstuff['id']}", json={"kcal": 400, "brand": ""})
    assert updated_foodstuff.status_code == 200
    assert updated_foodstuff.json()["brand"] is None
    assert client.get(f"/recipes/{recipe_version['recipeLineageId']}").json()["kcal"] == 200


def test_duplicate_foodstuff_membership_and_positions_are_rejected(client: TestClient) -> None:
    oats = create_foodstuff(client)
    egg = create_foodstuff(client, name="Egg")
    duplicate_foodstuff = client.post(
        "/recipes",
        json=recipe_version_payload(
            "Duplicate foodstuff",
            ingredients=[
                {"index": 1, "amount": 50, "foodstuffId": oats["id"]},
                {"index": 2, "amount": 50, "foodstuffId": oats["id"]},
            ],
        ),
    )
    assert duplicate_foodstuff.status_code == 422
    assert duplicate_foodstuff.json()["details"][0]["loc"] == ["body", "ingredients"]
    assert "foodstuffs must be unique per recipe" in duplicate_foodstuff.json()["details"][0]["msg"]
    duplicate_ingredient_position = client.post(
        "/recipes",
        json=recipe_version_payload(
            "Duplicate ingredient position",
            ingredients=[
                {"index": 1, "amount": 50, "foodstuffId": oats["id"]},
                {"index": 1, "amount": 50, "foodstuffId": egg["id"]},
            ],
        ),
    )
    assert duplicate_ingredient_position.status_code == 422
    duplicate_step_position = client.post(
        "/recipes",
        json=recipe_version_payload(
            "Duplicate step position",
            steps=[{"index": 1, "description": "Cook"}, {"index": 1, "description": "Serve"}],
        ),
    )
    assert duplicate_step_position.status_code == 422


def test_user_contract_has_no_shopping_list_side_effect(client: TestClient) -> None:
    created = client.post("/users", json={"username": "Roi"})

    assert created.status_code == 201
    assert created.json() == {"id": 1, "username": "Roi"}
    assert client.get("/users/1").json() == {"id": 1, "username": "Roi"}
    assert client.get("/users/999").status_code == 404
    assert client.get("/shoppingLists/1").status_code == 404


def test_draft_can_publish_after_a_newer_active_version(client: TestClient) -> None:
    initial_recipe_version = create_recipe(client, "Initial")
    lineage_id = initial_recipe_version["recipeLineageId"]
    draft_recipe_version = client.post(f"/recipes/{lineage_id}/drafts", json=recipe_version_payload("Older alternative")).json()
    newer_active_version_response = client.post(f"/recipes/{lineage_id}/publish", json=recipe_version_payload("Newer active"))
    assert newer_active_version_response.status_code == 200

    published_draft_version_response = client.post(f"/recipes/{lineage_id}/drafts/{draft_recipe_version['recipeVersionId']}/publish")

    assert published_draft_version_response.status_code == 200
    assert published_draft_version_response.json()["recipeVersionId"] == draft_recipe_version["recipeVersionId"]
    assert client.get(f"/recipes/{lineage_id}").json()["name"] == "Older alternative"
    assert {version["name"] for version in client.get(f"/recipes/{lineage_id}/history").json()} == {
        "Initial",
        "Newer active",
    }


def test_failed_direct_publication_preserves_active_version(client: TestClient) -> None:
    active_recipe_version = create_recipe(client, "Original")

    failed_publication = client.post(
        f"/recipes/{active_recipe_version['recipeLineageId']}/publish",
        json=recipe_version_payload("Broken", ingredients=[{"index": 1, "amount": 1, "foodstuffId": 999}]),
    )

    assert failed_publication.status_code == 404
    assert client.get(f"/recipes/{active_recipe_version['recipeLineageId']}").json()["recipeVersionId"] == active_recipe_version["recipeVersionId"]
    assert client.get(f"/recipes/{active_recipe_version['recipeLineageId']}/history").json() == []


def test_historical_versions_reject_draft_mutation_endpoints(client: TestClient) -> None:
    initial_recipe_version = create_recipe(client, "Initial")
    lineage_id = initial_recipe_version["recipeLineageId"]
    assert client.post(f"/recipes/{lineage_id}/publish", json=recipe_version_payload("Current")).status_code == 200

    assert client.put(
        f"/recipes/{lineage_id}/drafts/{initial_recipe_version['recipeVersionId']}", json=recipe_version_payload("Mutated history")
    ).status_code == 409
    assert client.delete(f"/recipes/{lineage_id}/drafts/{initial_recipe_version['recipeVersionId']}").status_code == 409
    assert client.get(f"/recipes/{lineage_id}/versions/{initial_recipe_version['recipeVersionId']}").json()["name"] == "Initial"


def test_foodstuff_deletion_is_blocked_by_historical_or_draft_only_references(client: TestClient) -> None:
    historical_foodstuff = create_foodstuff(client, name="Historical")
    replacement_foodstuff = create_foodstuff(client, name="Replacement")
    historical_recipe_version = create_recipe(client, "Historical reference", historical_foodstuff["id"])
    assert client.post(
        f"/recipes/{historical_recipe_version['recipeLineageId']}/publish",
        json=recipe_version_payload("Replacement reference", replacement_foodstuff["id"]),
    ).status_code == 200
    assert client.delete(f"/foodstuffs/{historical_foodstuff['id']}").status_code == 409

    draft_foodstuff = create_foodstuff(client, name="Draft only")
    draft_recipe_version = create_recipe(client, "Draft reference")
    draft_version = client.post(
        f"/recipes/{draft_recipe_version['recipeLineageId']}/drafts", json=recipe_version_payload("Draft reference", draft_foodstuff["id"])
    ).json()
    assert client.delete(f"/foodstuffs/{draft_foodstuff['id']}").status_code == 409
    assert client.delete(f"/recipes/{draft_recipe_version['recipeLineageId']}/drafts/{draft_version['recipeVersionId']}").status_code == 204
    assert client.delete(f"/foodstuffs/{draft_foodstuff['id']}").status_code == 204
