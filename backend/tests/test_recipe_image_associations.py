from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.recipes.models.recipe import RecipeVersion
from app.recipes.models.recipe_image import RecipeImage
from app.recipes.schemas.recipe import RecipeVersionOut, RecipeVersionWrite
from app.recipes.schemas.recipe_proposal import RecipeProposalCreate
from app.recipes.services.recipe_proposal_saves import save_recipe_proposal
from app.recipes.services.recipe_proposals import RecipeProposalStore
from app.recipes.services.recipes import (
    create_recipe, create_recipe_draft, publish_active_recipe_edit, update_recipe_draft,
)


@pytest.fixture
def images() -> tuple[UUID, UUID]:
    ids = (uuid4(), uuid4())
    with SessionLocal.begin() as session:
        for index, image_id in enumerate(ids):
            session.add(RecipeImage(
                id=image_id, object_key=f"recipe-images/{image_id}.png", content_type="image/png",
                size=100, width=800 + index * 200, height=600, sha256="a" * 64, created_at=datetime.now(timezone.utc),
            ))
    return ids


def create(client: TestClient, image_id: UUID | None) -> RecipeVersionOut:
    response = client.post("/recipes", json={"name": "Original", "servings": 2, "imageId": str(image_id) if image_id else None})
    assert response.status_code == 201
    return RecipeVersionOut.model_validate(response.json())


def test_new_recipe_without_image(client: TestClient) -> None:
    response = client.post("/recipes", json={"name": "No image", "servings": 2})
    assert response.status_code == 201
    recipe = RecipeVersionOut.model_validate(response.json())
    assert recipe.imageId is None
    assert recipe.imageDimensions is None
    assert client.get(f"/recipes/{recipe.recipeLineageId}").json()["imageId"] is None


def test_dimensions_follow_version_image_and_refresh_after_replacement(images: tuple[UUID, UUID]) -> None:
    from app.recipes.services.recipes import recipe_version_out

    with SessionLocal.begin() as session:
        active = create_recipe(session, RecipeVersionWrite(name="Original", servings=2, imageId=images[0]))
        original = recipe_version_out(active)
        assert original.imageDimensions is not None
        assert original.imageDimensions.model_dump() == {"width": 800, "height": 600}
        draft = create_recipe_draft(session, active.lineage_id, RecipeVersionWrite(name="Draft", servings=2))
        assert recipe_version_out(draft).imageDimensions == original.imageDimensions
        replaced = update_recipe_draft(session, active.lineage_id, draft.version_id,
            RecipeVersionWrite(name="Replaced", servings=2, imageId=images[1]))
        dimensions = recipe_version_out(replaced).imageDimensions
        assert dimensions is not None
        assert dimensions.model_dump() == {"width": 1000, "height": 600}
        assert recipe_version_out(active).imageDimensions == original.imageDimensions
        removed = update_recipe_draft(session, active.lineage_id, draft.version_id,
            RecipeVersionWrite(name="Removed", servings=2, imageId=None))
        assert recipe_version_out(removed).imageDimensions is None


def test_draft_replacement_removal_and_publication_are_independent(client: TestClient, images: tuple[UUID, UUID]) -> None:
    original = create(client, images[0])
    path = f"/recipes/{original.recipeLineageId}"
    draft = client.post(f"{path}/drafts", json={"name": "Draft", "servings": 2}).json()
    draft_path = f"{path}/drafts/{draft['recipeVersionId']}"
    assert draft["imageId"] == str(images[0])
    assert draft["imageDimensions"] == {"width": 800, "height": 600}
    replacement = client.put(draft_path, json={"name": "Replaced", "servings": 2, "imageId": str(images[1])})
    assert replacement.status_code == 200
    assert replacement.json()["imageId"] == str(images[1])
    assert replacement.json()["imageDimensions"] == {"width": 1000, "height": 600}
    kept = client.put(draft_path, json={"name": "Kept", "servings": 2})
    assert kept.json()["imageId"] == str(images[1])
    assert client.get(path).json()["imageId"] == str(images[0])
    published = client.post(f"{draft_path}/publish")
    assert published.status_code == 200
    assert published.json()["imageId"] == str(images[1])
    assert client.get(f"{path}/history").json()[0]["imageId"] == str(images[0])
    assert client.get(f"{path}/history").json()[0]["imageDimensions"] == {"width": 800, "height": 600}
    removed = client.post(f"{path}/drafts", json={"name": "Removed", "servings": 2, "imageId": None}).json()
    assert removed["imageId"] is None
    assert client.get(path).json()["imageId"] == str(images[1])
    restored = client.put(
        f"{path}/drafts/{removed['recipeVersionId']}",
        json={"name": "Restored", "servings": 2, "imageId": str(images[0])},
    )
    assert restored.json()["imageId"] == str(images[0])
    cleared = client.put(
        f"{path}/drafts/{removed['recipeVersionId']}", json={"name": "Cleared", "servings": 2, "imageId": None},
    )
    assert cleared.json()["imageId"] is None
    assert cleared.json()["imageDimensions"] is None
    assert client.get(f"{path}/versions/{original.recipeVersionId}").json()["imageId"] == str(images[0])
    listed = {item["recipeVersionId"]: item["imageId"] for item in client.get("/recipes").json()}
    assert listed == {draft["recipeVersionId"]: str(images[1]), removed["recipeVersionId"]: None}
    listed_dimensions = {item["recipeVersionId"]: item["imageDimensions"] for item in client.get("/recipes").json()}
    assert listed_dimensions == {draft["recipeVersionId"]: {"width": 1000, "height": 600}, removed["recipeVersionId"]: None}


@pytest.mark.parametrize("choice", ["omit", "replace", "remove"])
@pytest.mark.parametrize("operation", ["publish", "drafts"])
def test_new_version_image_choices(
    client: TestClient, images: tuple[UUID, UUID], choice: str, operation: str,
) -> None:
    original = create(client, images[0])
    path = f"/recipes/{original.recipeLineageId}"
    payload: dict[str, object] = {"name": "Changed", "servings": 3}
    expected = images[0]
    if choice == "replace":
        payload["imageId"] = str(images[1])
        expected = images[1]
    elif choice == "remove":
        payload["imageId"] = None
    response = client.post(f"{path}/{operation}", json=payload)
    assert response.status_code == (201 if operation == "drafts" else 200)
    assert response.json()["imageId"] == (None if choice == "remove" else str(expected))
    assert client.get(f"{path}/versions/{original.recipeVersionId}").json()["imageId"] == str(images[0])


@pytest.mark.parametrize("operation", ["create", "publish", "draft", "update"])
def test_unknown_image_rejects_entire_save(
    client: TestClient, images: tuple[UUID, UUID], operation: str,
) -> None:
    original = create(client, images[0])
    path = f"/recipes/{original.recipeLineageId}"
    draft = client.post(f"{path}/drafts", json={"name": "Draft", "servings": 2}).json()
    before = client.get("/recipes").json()
    unknown = uuid4()
    payload = {"name": "Must not be saved", "servings": 3, "imageId": str(unknown)}
    if operation == "update":
        response = client.put(f"{path}/drafts/{draft['recipeVersionId']}", json=payload)
    else:
        endpoint = {"create": "/recipes", "publish": f"{path}/publish", "draft": f"{path}/drafts"}[operation]
        response = client.post(endpoint, json=payload)
    assert response.status_code == 404
    assert response.json() == {"detail": f"Recipe image with id {unknown} not found"}
    assert client.get("/recipes").json() == before
    assert client.get(f"{path}/history").json() == []
    assert client.post("/recipes", json={**payload, "imageId": "invalid"}).status_code == 422


@pytest.mark.parametrize("operation", ["update", "publish"])
def test_failed_commit_preserves_image_reference(images: tuple[UUID, UUID], operation: str) -> None:
    with SessionLocal.begin() as session:
        active = create_recipe(session, RecipeVersionWrite(name="Original", servings=2, imageId=images[0]))
        draft = create_recipe_draft(session, active.lineage_id, RecipeVersionWrite(name="Draft", servings=2))
        lineage_id, active_id, draft_id = active.lineage_id, active.version_id, draft.version_id

    def fail_commit(session: Session) -> None:
        raise SQLAlchemyError("Commit failed")

    with pytest.raises(SQLAlchemyError, match="Commit failed"), SessionLocal() as session:
        event.listen(session, "before_commit", fail_commit)
        with session.begin():
            payload = RecipeVersionWrite(name="Changed", servings=2, imageId=images[1])
            if operation == "update":
                update_recipe_draft(session, lineage_id, draft_id, payload)
            else:
                publish_active_recipe_edit(session, lineage_id, payload)
    with SessionLocal() as session:
        saved = session.get(RecipeVersion, draft_id)
        assert saved is not None
        assert saved.image_id == images[0] and saved.name == "Draft"
        active = session.get(RecipeVersion, active_id)
        assert active is not None and active.state.value == "active" and active.image_id == images[0]
        assert set(session.scalars(select(RecipeVersion.version_id))) == {active_id, draft_id}
        assert set(session.scalars(select(RecipeImage.id))) == set(images)


def test_references_protect_metadata_and_recipe_deletion_keeps_images(client: TestClient, images: tuple[UUID, UUID]) -> None:
    original = create(client, images[0])
    path = f"/recipes/{original.recipeLineageId}"
    draft = client.post(f"{path}/drafts", json={"name": "Shared", "servings": 2}).json()
    with pytest.raises(IntegrityError), SessionLocal.begin() as session:
        image = session.get(RecipeImage, images[0])
        assert image is not None
        session.delete(image)
        session.flush()
    assert client.delete(f"{path}/drafts/{draft['recipeVersionId']}").status_code == 204
    assert client.get(path).json()["imageId"] == str(images[0])
    assert client.delete(path).status_code == 204
    with SessionLocal() as session:
        assert set(session.scalars(select(RecipeImage.id))) == set(images)


@pytest.mark.parametrize("source_state", ["active", "draft", "historical"])
@pytest.mark.parametrize("has_image", [True, False])
def test_ai_draft_inherits_specific_source_image(
    images: tuple[UUID, UUID], source_state: str, has_image: bool,
) -> None:
    store = RecipeProposalStore()
    source_image = images[0] if has_image else None
    with SessionLocal.begin() as session:
        active = create_recipe(session, RecipeVersionWrite(name="Original", servings=2, imageId=images[1]))
        if source_state == "draft":
            source = create_recipe_draft(session, active.lineage_id, RecipeVersionWrite(name="Source", servings=2, imageId=source_image))
        else:
            active.image_id = source_image
            source = active
            if source_state == "historical":
                publish_active_recipe_edit(session, active.lineage_id, RecipeVersionWrite(name="New active", servings=2, imageId=images[1]))
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {"name": "Improved", "servings": 2, "ingredients": [], "steps": []},
        }))
    result = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    assert result.imageId == source_image
    assert save_recipe_proposal(SessionLocal, store, proposal.proposalId).imageId == source_image
    assert "imageId" not in store.get(proposal.proposalId).recipe.model_dump()
