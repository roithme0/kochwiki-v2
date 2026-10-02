from collections.abc import Callable
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.recipe import RecipeVersion
from app.schemas.recipe import IngredientWrite, RecipeVersionOut, RecipeVersionWrite
from app.schemas.recipe_proposal import ExistingProposalFoodstuff, ProposalRecipe
from app.services.exceptions import NotFoundError
from app.services.foodstuffs import create_foodstuff
from app.services.recipe_proposals import RecipeProposalStore
from app.services.recipes import create_recipe_draft, get_recipe_version_by_id, recipe_version_out


def save_recipe_proposal(
    session_factory: Callable[[], Session], store: RecipeProposalStore, proposal_id: UUID
) -> RecipeVersionOut:
    with store.saving(proposal_id), session_factory() as session:
        saved_version_id = store.saved_version_id(proposal_id)
        if saved_version_id is not None:
            return recipe_version_out(_get_version(session, saved_version_id))

        proposal = store.get(proposal_id)
        with session.begin():
            source = _get_version(session, proposal.sourceRecipeVersionId)
            payload = _materialize_recipe(session, proposal.recipe)
            draft = create_recipe_draft(session, source.lineage_id, payload)
            result = recipe_version_out(draft)
        store.record_saved_version(proposal_id, result.recipeVersionId)
        return result


def _get_version(session: Session, version_id: UUID) -> RecipeVersion:
    version = session.get(RecipeVersion, version_id)
    if version is None:
        raise NotFoundError(f"Recipe version with id {version_id} not found")
    return get_recipe_version_by_id(session, version.lineage_id, version_id)


def _materialize_recipe(session: Session, recipe: ProposalRecipe) -> RecipeVersionWrite:
    ingredients: list[IngredientWrite] = []
    for ingredient in recipe.ingredients:
        foodstuff = ingredient.foodstuff
        foodstuff_id = (
            foodstuff.foodstuffId
            if isinstance(foodstuff, ExistingProposalFoodstuff)
            else create_foodstuff(session, foodstuff.definition).id
        )
        ingredients.append(IngredientWrite(
            index=ingredient.index, amount=ingredient.amount, foodstuffId=foodstuff_id
        ))
    return RecipeVersionWrite(
        name=recipe.name,
        servings=recipe.servings,
        preptime=recipe.preptime,
        ingredients=ingredients,
        steps=recipe.steps,
    )
