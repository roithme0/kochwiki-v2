from typing import cast
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models.recipe import RecipeVersion
from app.schemas.recipe import RecipeVersionOut, RecipeVersionWrite
from app.schemas.recipe_proposal import RecipeProposalCreate, RecipeProposalOut
from app.services.recipe_proposals import RecipeProposalStore
from app.services.recipes import create_recipe, discard_recipe_draft
from app.services.foodstuffs import list_foodstuffs


def prepare(client: TestClient) -> RecipeProposalOut:
    store = cast(RecipeProposalStore, client.app.state.recipe_proposals)
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=1))
        return store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {"name": "Improved", "servings": 2, "ingredients": [
                {"index": 1, "amount": 100, "foodstuff": {"kind": "temporary",
                    "definition": {"name": "Beans", "unit": "G", "protein": 10}}},
            ], "steps": [{"index": 1, "description": "Cook"}]},
        }))


def test_save_creates_ingredients_and_repeated_save_returns_same_draft(client: TestClient) -> None:
    proposal = prepare(client)
    url = f"/recipe-proposals/{proposal.proposalId}/save"
    response = client.post(url)
    assert response.status_code == 200
    draft = RecipeVersionOut.model_validate(response.json())
    assert draft.state == "draft" and draft.name == "Improved"
    assert draft.ingredients[0].foodstuff.name == "Beans"
    assert client.post(url).json() == response.json()
    with SessionLocal() as session:
        assert len(list_foodstuffs(session)) == 1
    with SessionLocal.begin() as session:
        discard_recipe_draft(session, draft.recipeLineageId, draft.recipeVersionId)
    assert client.post(url).status_code == 404


def test_unknown_proposal_does_not_create_data(client: TestClient) -> None:
    assert client.post(f"/recipe-proposals/{uuid4()}/save").status_code == 404
    assert client.post("/recipe-proposals/not-a-uuid/save").status_code == 422


def test_missing_source_fails_without_creating_temporary_foodstuffs(client: TestClient) -> None:
    proposal = prepare(client)
    with SessionLocal() as session:
        source = session.get(RecipeVersion, proposal.sourceRecipeVersionId)
        assert source is not None
        lineage_id = source.lineage_id
    assert client.delete(f"/recipes/{lineage_id}").status_code == 204
    assert client.post(f"/recipe-proposals/{proposal.proposalId}/save").status_code == 404
    with SessionLocal() as session:
        assert list_foodstuffs(session) == []
