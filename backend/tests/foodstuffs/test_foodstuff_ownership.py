from collections.abc import Callable
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.exceptions import ForbiddenError
from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate
from app.foodstuffs.services.foodstuffs import create_foodstuff
from app.foodstuffs.services.search import FoodstuffSemanticSearch
from app.identity.schemas.user import UserOut
from app.images.models import ImageAsset, ImageKind
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.embeddings.embeddings import EmbeddingClient
from app.infrastructure.mcp.services import MCPServices
from app.recipes.models.recipe import RecipeVersion
from app.recipes.schemas.proposal import RecipeProposalCreate
from app.recipes.services.proposal_presentations import (
    resolve_recipe_proposal_presentation,
)
from app.recipes.services.proposal_saves import save_recipe_proposal
from app.recipes.services.proposal_store import RecipeProposalStore
from tests.foodstuffs.test_foodstuff_semantic import FakeProvider, service


def test_personal_catalogues_keep_foreign_recipes_readable(
    client: TestClient,
    recipe_session: UserOut,
    sign_in: Callable[[TestClient], UserOut],
) -> None:
    food = client.post(
        "/foodstuffs", json={"name": "Oats", "brand": "Mill", "unit": "G", "kcal": 100}
    ).json()
    recipe = client.post(
        "/recipes",
        json={
            "name": "Porridge",
            "servings": 1,
            "ingredients": [{"index": 1, "amount": 100, "foodstuffId": food["id"]}],
        },
    ).json()
    second = sign_in(client)
    assert second.id != recipe_session.id
    assert client.get("/foodstuffs").json() == []
    assert client.get(f"/foodstuffs/{food['id']}").status_code == 200
    readable = client.get(f"/recipes/{recipe['recipeLineageId']}").json()
    assert readable["ingredients"][0]["foodstuff"]["name"] == "Oats"
    assert readable["kcal"]["value"] == 100
    own = client.post(
        "/foodstuffs", json={"name": "Oats", "brand": "Mill", "unit": "G"}
    )
    assert own.status_code == 201 and own.json()["id"] != food["id"]
    assert [entry["id"] for entry in client.get("/foodstuffs").json()] == [
        own.json()["id"]
    ]
    assert (
        client.post(
            "/foodstuffs",
            json={"name": "Spoof", "unit": "G", "owner_id": recipe_session.id},
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "operation", ["create", "publish", "draft", "update-draft", "resolve"]
)
def test_every_submitted_recipe_path_rejects_foreign_foodstuffs(
    client: TestClient,
    recipe_session: UserOut,
    sign_in: Callable[[TestClient], UserOut],
    operation: str,
) -> None:
    foreign = client.post("/foodstuffs", json={"name": "Foreign", "unit": "G"}).json()[
        "id"
    ]
    sign_in(client)
    recipe = client.post("/recipes", json={"name": "Mine", "servings": 1}).json()
    base = f"/recipes/{recipe['recipeLineageId']}"
    draft = client.post(f"{base}/drafts", json={"name": "Draft", "servings": 1}).json()
    body = {
        "name": "Rejected",
        "servings": 1,
        "ingredients": [{"index": 1, "amount": 1, "foodstuffId": foreign}],
    }
    paths = {
        "create": "/recipes",
        "publish": f"{base}/publish",
        "draft": f"{base}/drafts",
        "update-draft": f"{base}/drafts/{draft['recipeVersionId']}",
        "resolve": "/recipe-presentations/resolve",
    }
    if operation == "resolve":
        body.pop("name")
        body.update({"preptime": None, "steps": []})
    result = client.request(
        "PUT" if operation == "update-draft" else "POST", paths[operation], json=body
    )
    assert result.status_code == 403
    assert client.get(base).json() == recipe
    assert client.get(f"{base}/versions/{draft['recipeVersionId']}").json() == draft
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(RecipeVersion)) == 2


def test_proposals_revalidate_ownership_and_rollback_temporary_foodstuffs(
    client: TestClient, recipe_session: UserOut, provider_user: Callable[[str], UserOut]
) -> None:
    food_id = client.post("/foodstuffs", json={"name": "Oats", "unit": "G"}).json()[
        "id"
    ]
    source = client.post("/recipes", json={"name": "Source", "servings": 1}).json()
    other = provider_user("Other")
    store = RecipeProposalStore()
    payload = RecipeProposalCreate.model_validate(
        {
            "sourceRecipeVersionId": source["recipeVersionId"],
            "recipe": {
                "name": "Proposal",
                "servings": 1,
                "steps": [],
                "ingredients": [
                    {
                        "index": 1,
                        "amount": 1,
                        "foodstuff": {
                            "kind": "temporary",
                            "definition": {"name": "Temporary", "unit": "G"},
                        },
                    },
                    {
                        "index": 2,
                        "amount": 1,
                        "foodstuff": {"kind": "existing", "foodstuffId": food_id},
                    },
                ],
            },
        }
    )
    with SessionLocal.begin() as session:
        proposal = store.create(session, payload, user_id=recipe_session.id)
        food = session.get(Foodstuff, food_id)
        assert food is not None
        food.owner_id = other.id
    with SessionLocal() as session:
        with pytest.raises(ForbiddenError):
            store.create(session, payload, user_id=recipe_session.id)
        with pytest.raises(ForbiddenError):
            resolve_recipe_proposal_presentation(
                session, store, proposal.proposalId, user_id=recipe_session.id
            )
    with pytest.raises(ForbiddenError):
        save_recipe_proposal(
            SessionLocal, store, proposal.proposalId, user_id=recipe_session.id
        )
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Foodstuff)) == 1
        assert session.scalar(select(func.count()).select_from(RecipeVersion)) == 1


def test_semantic_search_filters_before_limit_and_keeps_callers_isolated(
    provider_user: Callable[[str], UserOut],
) -> None:
    first, second = provider_user("First"), provider_user("Second")
    with SessionLocal.begin() as session:
        foods = [
            create_foodstuff(
                session,
                FoodstuffCreate(name=f"Food {index}", unit=Unit.G),
                owner_id=owner,
            ).id
            for index, owner in enumerate([first.id, second.id, second.id])
        ]
    provider = FakeProvider()
    refresh = service(provider)
    assert refresh.refresh_all().refreshed == 3
    services = MCPServices(RecipeProposalStore())
    services.bind_foodstuff_search(
        lambda owner_id: FoodstuffSemanticSearch(
            SessionLocal, EmbeddingClient(provider), owner_id=owner_id
        )
    )
    first_search = services.get_foodstuff_search(owner_id=first.id)
    second_search = services.get_foodstuff_search(owner_id=second.id)
    for search, expected in [
        (second_search, foods[1]),
        (first_search, foods[0]),
        (second_search, foods[1]),
    ]:
        assert [candidate.foodstuff.id for candidate in search.search("Food", 1)] == [
            expected
        ]


def test_migrated_image_can_be_retained_but_not_newly_attached(
    client: TestClient, recipe_session: UserOut, provider_user: Callable[[str], UserOut]
) -> None:
    other = provider_user("Other")
    from datetime import datetime, timezone

    image_id = uuid4()
    with SessionLocal.begin() as session:
        session.add(
            ImageAsset(
                id=image_id,
                kind=ImageKind.FOODSTUFF,
                uploader_id=None,
                object_key=f"foodstuff-images/{image_id}.png",
                content_type="image/png",
                size=100,
                width=100,
                height=100,
                sha256="a" * 64,
                created_at=datetime.now(timezone.utc),
            )
        )
        session.flush()
        first = Foodstuff(
            owner_id=recipe_session.id,
            name="Migrated",
            unit=Unit.G,
            image_id=image_id,
            kcal=Decimal(100),
        )
        second = Foodstuff(
            owner_id=other.id,
            name="Migrated",
            unit=Unit.G,
            image_id=image_id,
            kcal=Decimal(100),
        )
        session.add_all([first, second])
        session.flush()
        first_id, second_id = first.id, second.id
    path = f"/foodstuffs/{first_id}"
    assert (
        client.patch(
            path, json={"name": "Renamed", "imageId": str(image_id)}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/foodstuffs", json={"name": "New", "unit": "G", "imageId": str(image_id)}
        ).status_code
        == 403
    )
    assert client.patch(path, json={"imageId": None}).status_code == 200
    assert client.patch(path, json={"imageId": str(image_id)}).status_code == 403
    assert client.get(f"/foodstuffs/{second_id}").json()["imageId"] == str(image_id)
    with SessionLocal() as session:
        assert session.get(ImageAsset, image_id) is not None
