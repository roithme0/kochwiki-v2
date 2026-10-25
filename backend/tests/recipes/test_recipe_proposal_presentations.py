from decimal import Decimal
from uuid import uuid4

import pytest
from app.foodstuffs.models.unit import Unit
from sqlalchemy import func, select

from app.infrastructure.database.session import SessionLocal
from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient, RecipeVersion, Step
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.recipes.schemas.recipe import RecipeVersionWrite
from app.recipes.schemas.proposal import (
    RecipeProposalCreate,
    RecipeProposalPresentationOut,
    ResolvedExistingProposalFoodstuff,
    ResolvedTemporaryProposalFoodstuff,
)
from app.core.exceptions import NotFoundError
from app.foodstuffs.services.foodstuffs import create_foodstuff, delete_foodstuff, update_foodstuff
from app.recipes.services.proposal_presentations import resolve_recipe_proposal_presentation
from app.recipes.services.proposal_store import RecipeProposalStore
from app.recipes.services.recipes import delete_recipe_lineage
from tests.recipes.helpers import create_owned_recipe as create_recipe, recipe_owner_id


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
        }), user_id=recipe_owner_id(session))
    with SessionLocal.begin() as session:
        models = (Foodstuff, RecipeVersion, Ingredient, Step)
        before = [session.scalar(select(func.count()).select_from(model)) for model in models]
        pending = Foodstuff(name="Pending", unit=Unit.G)
        session.add(pending)
        presentation = resolve_recipe_proposal_presentation(session, store, proposal.proposalId, user_id=recipe_owner_id(session))
        assert pending.id is None and list(session.new) == [pending]
        assert not session.dirty and not session.deleted
        session.expunge(pending)
        assert [session.scalar(select(func.count()).select_from(model)) for model in models] == before
    assert presentation.name == "Proposal" and presentation.servings == 2 and presentation.preptime == 10
    assert presentation.kcal.value == expected and presentation.carbs.value == 25
    assert presentation.protein.value == 0 and presentation.fat.value == 10
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
    assert store.get(proposal.proposalId, user_id=recipe_owner_id()) == proposal
    with SessionLocal() as session:
        again = resolve_recipe_proposal_presentation(session, store, proposal.proposalId, user_id=recipe_owner_id(session))
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
        }), user_id=recipe_owner_id(session))
        result = resolve_recipe_proposal_presentation(session, store, proposal.proposalId, user_id=recipe_owner_id(session))
    assert result.kcal.value == (Decimal(0) if ingredients else None)
    assert all(value.status == "unknown" and value.value is None for value in (result.carbs, result.protein, result.fat))
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
        }), user_id=recipe_owner_id(session))
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="Renamed", kcal=Decimal(250)))
        delete_recipe_lineage(session, lineage_id)
    with SessionLocal() as session:
        result = resolve_recipe_proposal_presentation(session, store, proposal.proposalId, user_id=recipe_owner_id(session))
    assert result.kcal.value == 250
    resolved = result.ingredients[0].foodstuff
    assert isinstance(resolved, ResolvedExistingProposalFoodstuff) and resolved.name == "Renamed"
    with SessionLocal.begin() as session:
        delete_foodstuff(session, foodstuff_id)
    with SessionLocal() as session:
        with pytest.raises(NotFoundError, match=f"Foodstuff with id {foodstuff_id} not found"):
            resolve_recipe_proposal_presentation(session, store, proposal.proposalId, user_id=recipe_owner_id(session))
    assert store.get(proposal.proposalId, user_id=recipe_owner_id()) == proposal


def test_unknown_proposal() -> None:
    with SessionLocal() as session, pytest.raises(NotFoundError, match="Recipe proposal"):
        resolve_recipe_proposal_presentation(session, RecipeProposalStore(), uuid4(), user_id=999999)
