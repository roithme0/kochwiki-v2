from decimal import Decimal
from uuid import uuid4

import pytest
from kochwiki_contract import Unit
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.foodstuff import Foodstuff
from app.models.recipe import Ingredient, RecipeVersion, Step
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.schemas.recipe import RecipeVersionWrite
from app.schemas.recipe_proposal import (
    RecipeProposalCreate,
    RecipeProposalPresentationOut,
    ResolvedExistingProposalFoodstuff,
    ResolvedTemporaryProposalFoodstuff,
)
from app.services.exceptions import NotFoundError
from app.services.foodstuffs import create_foodstuff, delete_foodstuff, update_foodstuff
from app.services.recipe_proposal_presentations import resolve_recipe_proposal_presentation
from app.services.recipe_proposals import RecipeProposalStore
from app.services.recipes import create_recipe, delete_recipe_lineage


@pytest.mark.parametrize("unit,amount,expected", [
    (Unit.G, 200, Decimal("250")),
    (Unit.ML, 200, Decimal("250")),
    (Unit.PIECE, 2, Decimal("250")),
])
def test_mixed_presentation_calculates_nutrition_without_writing(
    unit: Unit, amount: int, expected: Decimal
) -> None:
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Source", servings=1))
        existing = create_foodstuff(session, FoodstuffCreate(
            name="Milk", unit=Unit.ML, kcal=Decimal(100), carbs=Decimal(10),
            protein=Decimal(0), fat=Decimal(4),
        ))
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {
                "name": "Proposal", "servings": 2, "preptime": 10,
                "ingredients": [
                    {"index": 2, "amount": amount, "foodstuff": {"kind": "temporary", "definition": {
                        "name": "New ingredient", "brand": "Farm", "unit": unit,
                        "kcal": 200, "carbs": 20, "protein": 0, "fat": 8,
                    }}},
                    {"index": 1, "amount": 100, "foodstuff": {"kind": "existing", "foodstuffId": existing.id}},
                ],
                "steps": [{"index": 2, "description": "Serve"}, {"index": 1, "description": "Mix"}],
            },
        }))
    with SessionLocal.begin() as session:
        models = (Foodstuff, RecipeVersion, Ingredient, Step)
        before = [session.scalar(select(func.count()).select_from(model)) for model in models]
        pending = Foodstuff(name="Pending", unit=Unit.G)
        session.add(pending)
        presentation = resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
        assert pending.id is None and list(session.new) == [pending]
        assert not session.dirty and not session.deleted
        session.expunge(pending)
        assert [session.scalar(select(func.count()).select_from(model)) for model in models] == before
    assert presentation.name == "Proposal" and presentation.servings == 2 and presentation.preptime == 10
    assert presentation.kcal == expected and presentation.carbs == 25
    assert presentation.protein == 0 and presentation.fat == 10
    assert [ingredient.index for ingredient in presentation.ingredients] == [1, 2]
    assert [step.description for step in presentation.steps] == ["Mix", "Serve"]
    persisted = presentation.ingredients[0].foodstuff
    temporary = presentation.ingredients[1].foodstuff
    assert isinstance(persisted, ResolvedExistingProposalFoodstuff)
    assert persisted.id == existing.id and persisted.name == "Milk"
    assert isinstance(temporary, ResolvedTemporaryProposalFoodstuff)
    assert temporary.name == "New ingredient" and temporary.brand == "Farm"
    assert temporary.unitVerbose == unit.verbose_name
    assert set(persisted.model_dump()) == set(temporary.model_dump()) | {"id"}
    assert RecipeProposalPresentationOut.model_validate_json(presentation.model_dump_json()) == presentation
    temporary.name = "Changed presentation"
    presentation.steps.clear()
    assert store.get(proposal.proposalId) == proposal
    with SessionLocal() as session:
        again = resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
    assert again.ingredients[1].foodstuff != temporary and len(again.steps) == 2


@pytest.mark.parametrize("ingredients", [[], [{
    "index": 1, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {
        "name": "Unknown nutrition", "unit": "G", "kcal": 0,
    }},
}]])
def test_empty_and_partial_nutrition(ingredients: list[dict[str, object]]) -> None:
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Source", servings=1))
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {"name": "Proposal", "servings": 1, "ingredients": ingredients, "steps": []},
        }))
        result = resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
    assert result.kcal == (Decimal(0) if ingredients else None)
    assert result.carbs is None and result.protein is None and result.fat is None
    assert result.steps == []


def test_current_catalogue_values_and_deleted_dependencies() -> None:
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Source", servings=1))
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Milk", unit=Unit.ML, kcal=Decimal(100)))
        lineage_id, foodstuff_id = source.lineage_id, foodstuff.id
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {"name": "Proposal", "servings": 2, "steps": [], "ingredients": [{
                "index": 1, "amount": 200, "foodstuff": {"kind": "existing", "foodstuffId": foodstuff_id},
            }]},
        }))
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="Renamed", kcal=Decimal(250)))
        delete_recipe_lineage(session, lineage_id)
    with SessionLocal() as session:
        result = resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
    assert result.kcal == 250
    resolved = result.ingredients[0].foodstuff
    assert isinstance(resolved, ResolvedExistingProposalFoodstuff) and resolved.name == "Renamed"
    with SessionLocal.begin() as session:
        delete_foodstuff(session, foodstuff_id)
    with SessionLocal() as session:
        with pytest.raises(NotFoundError, match=f"Foodstuff with id {foodstuff_id} not found"):
            resolve_recipe_proposal_presentation(session, store, proposal.proposalId)
    assert store.get(proposal.proposalId) == proposal


def test_unknown_proposal() -> None:
    with SessionLocal() as session, pytest.raises(NotFoundError, match="Recipe proposal"):
        resolve_recipe_proposal_presentation(session, RecipeProposalStore(), uuid4())
