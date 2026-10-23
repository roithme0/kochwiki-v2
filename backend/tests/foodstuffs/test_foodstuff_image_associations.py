import asyncio
from datetime import datetime, timezone
from uuid import UUID, uuid4

import httpx2
import pytest
from fastapi.testclient import TestClient
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.schemas.foodstuff import FoodstuffUpdate
from app.foodstuffs.services import foodstuffs
from app.foodstuffs.services.embeddings import foodstuff_refresh
from app.images.models import ImageAsset, ImageKind
from app.infrastructure.database.session import SessionLocal
from app.main import create_app
from app.recipes.schemas.proposal import RecipeProposalCreate
from app.recipes.services.proposal_presentations import resolve_recipe_proposal_presentation
from app.recipes.services.proposal_store import RecipeProposalStore
from tests.foodstuffs.test_foodstuff_semantic import FakeProvider, search_service, service


@pytest.fixture
def images() -> tuple[UUID, UUID, UUID]:
    ids = uuid4(), uuid4(), uuid4()
    with SessionLocal.begin() as session:
        for image_id, kind in zip(ids, (ImageKind.FOODSTUFF, ImageKind.FOODSTUFF, ImageKind.RECIPE), strict=True):
            session.add(ImageAsset(
                id=image_id, kind=kind, object_key=f"{kind.value}-images/{image_id}.png",
                content_type="image/png", size=100, width=100, height=100,
                sha256="a" * 64, created_at=datetime.now(timezone.utc),
            ))
    return ids


@pytest.mark.parametrize("choice", ["omit", "null", "image"])
def test_create_and_read_image(client: TestClient, images: tuple[UUID, UUID, UUID], choice: str) -> None:
    payload: dict[str, object] = {"name": "Carrot", "unit": "G"}
    expected = str(images[0]) if choice == "image" else None
    if choice != "omit":
        payload["imageId"] = expected
    response = client.post("/foodstuffs", json=payload)
    assert response.status_code == 201
    saved = response.json()
    assert saved["imageId"] == expected
    assert client.get(f"/foodstuffs/{saved['id']}").json() == saved
    assert client.get("/foodstuffs").json() == [saved]


def test_update_preserves_replaces_removes_and_retains_metadata(
    client: TestClient, images: tuple[UUID, UUID, UUID],
) -> None:
    saved = client.post("/foodstuffs", json={"name": "Carrot", "unit": "G", "imageId": str(images[0])}).json()
    path = f"/foodstuffs/{saved['id']}"
    refreshed: list[int] = []
    subscriber = refreshed.append
    foodstuff_refresh.subscribe(subscriber)
    try:
        for changes, expected in [
            ({"kcal": 20}, str(images[0])),
            ({"imageId": str(images[1])}, str(images[1])),
            ({}, str(images[1])),
            ({"imageId": None}, None),
            ({"imageId": str(images[0])}, str(images[0])),
        ]:
            response = client.patch(path, json=changes)
            assert response.status_code == 200
            assert response.json()["imageId"] == expected
            assert client.get(path).json()["imageId"] == expected
        assert refreshed == []
        assert client.delete(path).status_code == 204
        with SessionLocal() as session:
            assert set(session.scalars(select(ImageAsset.id))) == set(images)
    finally:
        foodstuff_refresh.unsubscribe(subscriber)


@pytest.mark.parametrize("invalid", ["missing", "recipe", "malformed"])
def test_invalid_image_rejects_entire_create_and_update(
    client: TestClient, images: tuple[UUID, UUID, UUID], invalid: str,
) -> None:
    image_id = "invalid" if invalid == "malformed" else str(images[2] if invalid == "recipe" else uuid4())
    expected_status = 422 if invalid == "malformed" else 404
    original = client.post("/foodstuffs", json={"name": "Original", "unit": "G", "imageId": str(images[0])}).json()
    changes = {"name": "Changed", "imageId": image_id}
    assert client.post("/foodstuffs", json={**changes, "unit": "G"}).status_code == expected_status
    path = f"/foodstuffs/{original['id']}"
    assert client.patch(path, json=changes).status_code == expected_status
    assert client.get(path).json() == original
    assert client.get("/foodstuffs").json() == [original]


def test_failure_after_flush_rolls_back_image_and_other_fields(
    client: TestClient, images: tuple[UUID, UUID, UUID], monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = client.post("/foodstuffs", json={"name": "Original", "unit": "G", "imageId": str(images[0])}).json()
    update = foodstuffs.update_foodstuff

    def fail(session: Session, foodstuff_id: int, payload: FoodstuffUpdate) -> Foodstuff:
        update(session, foodstuff_id, payload)
        raise SQLAlchemyError("database failure")

    monkeypatch.setattr(foodstuffs, "update_foodstuff", fail)
    with pytest.raises(SQLAlchemyError):
        client.patch(f"/foodstuffs/{original['id']}", json={"name": "Changed", "imageId": str(images[1])})
    assert client.get(f"/foodstuffs/{original['id']}").json() == original


@pytest.mark.usefixtures("recipe_session")
def test_replacement_updates_historical_ingredients_and_search_without_embedding_refresh(
    client: TestClient, images: tuple[UUID, UUID, UUID],
) -> None:
    saved = client.post("/foodstuffs", json={"name": "Carrot", "unit": "G", "imageId": str(images[0])}).json()
    recipe = client.post("/recipes", json={
        "name": "Original", "servings": 1,
        "ingredients": [{"index": 1, "foodstuffId": saved['id'], "amount": 100}],
    }).json()
    path = f"/recipes/{recipe['recipeLineageId']}"
    assert client.post(f"{path}/publish", json={"name": "Next", "servings": 1}).status_code == 200
    provider = FakeProvider()
    embeddings = service(provider)
    assert embeddings.refresh_one(saved['id']) == "refreshed"
    assert client.patch(f"/foodstuffs/{saved['id']}", json={"imageId": str(images[1])}).status_code == 200
    assert embeddings.refresh_one(saved['id']) == "skipped"
    assert len(provider.calls) == 1
    for body in (
        client.get(f"{path}/versions/{recipe['recipeVersionId']}").json(),
        client.get(f"{path}/history").json()[0],
    ):
        assert body['ingredients'][0]['foodstuff']['imageId'] == str(images[1])
        assert body['imageId'] is None
    assert search_service(provider).search("Carrot", 5)[0].foodstuff.imageId == images[1]


@pytest.mark.usefixtures("recipe_session")
def test_proposal_presentation_relays_catalogue_images_and_null_for_temporary_foodstuffs(
    client: TestClient, images: tuple[UUID, UUID, UUID],
) -> None:
    saved = client.post("/foodstuffs", json={"name": "Carrot", "unit": "G", "imageId": str(images[0])}).json()
    recipe = client.post("/recipes", json={"name": "Original", "servings": 1}).json()
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": recipe['recipeVersionId'],
            "recipe": {"name": "Proposal", "servings": 1, "steps": [], "ingredients": [
                {"index": 1, "amount": 100, "foodstuff": {"kind": "existing", "foodstuffId": saved['id']}},
                {"index": 2, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {"name": "New", "unit": "G"}}},
            ]},
        }))
        presentation = resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
        assert presentation.ingredients[0].foodstuff.imageId == images[0]
        assert presentation.ingredients[1].foodstuff.imageId is None
        body = presentation.model_dump(mode="json")
        assert [ingredient["foodstuff"]["imageId"] for ingredient in body["ingredients"]] == [str(images[0]), None]
        definitions = RecipeProposalCreate.model_json_schema()['$defs']
        assert 'imageId' not in definitions['FoodstuffFields']['properties']


def test_foreign_key_protects_referenced_metadata(client: TestClient, images: tuple[UUID, UUID, UUID]) -> None:
    client.post("/foodstuffs", json={"name": "Carrot", "unit": "G", "imageId": str(images[0])})
    with SessionLocal.begin() as session:
        image = session.get(ImageAsset, images[0])
        assert image is not None
        with pytest.raises(IntegrityError), session.begin_nested():
            session.delete(image)
            session.flush()


def test_mcp_image_association_rules(images: tuple[UUID, UUID, UUID]) -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://localhost") as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    result = await client.call_tool("create_foodstuff", {"foodstuff": {
                        "name": "Carrot", "unit": "G", "imageId": str(images[0]),
                    }})
                    assert not result.is_error
                    saved = result.structured_content
                    assert saved is not None and saved["imageId"] == str(images[0])
                    for changes, expected in [
                        ({"kcal": 20}, str(images[0])),
                        ({"imageId": str(images[1])}, str(images[1])),
                        ({"imageId": None}, None),
                    ]:
                        result = await client.call_tool("update_foodstuff", {"foodstuff_id": saved['id'], "changes": changes})
                        assert not result.is_error
                        assert result.structured_content is not None
                        assert result.structured_content['imageId'] == expected
                    for invalid in (images[2], uuid4()):
                        changes = {"name": "Changed", "imageId": str(invalid)}
                        assert (await client.call_tool("create_foodstuff", {"foodstuff": {**changes, "unit": "G"}})).is_error
                        assert (await client.call_tool("update_foodstuff", {"foodstuff_id": saved['id'], "changes": changes})).is_error
                    with SessionLocal() as session:
                        persisted = foodstuffs.get_foodstuff(session, saved['id'])
                        assert persisted.image_id is None and persisted.name == "Carrot"
                        assert len(foodstuffs.list_foodstuffs(session)) == 1

    asyncio.run(exercise())
