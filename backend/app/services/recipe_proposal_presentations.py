from collections.abc import Mapping
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.foodstuff import Foodstuff
from app.schemas.recipe import RecipePresentationStepOut
from app.schemas.recipe_proposal import (
    ExistingProposalFoodstuff,
    ProposalFoodstuff,
    ProposalPresentationIngredientOut,
    RecipeProposalPresentationOut,
    ResolvedExistingProposalFoodstuff,
    ResolvedTemporaryProposalFoodstuff,
)
from app.services.exceptions import NotFoundError
from app.services.foodstuffs import foodstuff_summary_out
from app.services.recipe_nutrition import ResolvedNutritionIngredient, per_serving, total_nutrition
from app.services.recipe_proposals import RecipeProposalStore


def resolve_recipe_proposal_presentation(
    session: Session, store: RecipeProposalStore, proposal_id: UUID
) -> RecipeProposalPresentationOut:
    recipe = store.get(proposal_id).recipe
    foodstuff_ids = {
        ingredient.foodstuff.foodstuffId
        for ingredient in recipe.ingredients
        if isinstance(ingredient.foodstuff, ExistingProposalFoodstuff)
    }
    with session.no_autoflush:
        foodstuffs: dict[int, Foodstuff] = {}
        if foodstuff_ids:
            foodstuffs = {
                foodstuff.id: foodstuff
                for foodstuff in session.scalars(select(Foodstuff).where(Foodstuff.id.in_(foodstuff_ids)))
            }
        missing_ids = sorted(foodstuff_ids - foodstuffs.keys())
        if missing_ids:
            raise NotFoundError(f"Foodstuff with id {missing_ids[0]} not found")

        ingredients: list[ProposalPresentationIngredientOut] = []
        nutrition_ingredients: list[ResolvedNutritionIngredient] = []
        for ingredient in sorted(recipe.ingredients, key=lambda item: item.index):
            resolved = _resolve_proposal_foodstuff(ingredient.foodstuff, foodstuffs)
            ingredients.append(
                ProposalPresentationIngredientOut(index=ingredient.index, amount=ingredient.amount, foodstuff=resolved)
            )
            nutrition_ingredients.append(ResolvedNutritionIngredient(ingredient.amount, resolved))

    return RecipeProposalPresentationOut(
        name=recipe.name,
        servings=recipe.servings,
        preptime=recipe.preptime,
        kcal=per_serving(total_nutrition(nutrition_ingredients, "kcal"), recipe.servings),
        carbs=per_serving(total_nutrition(nutrition_ingredients, "carbs"), recipe.servings),
        protein=per_serving(total_nutrition(nutrition_ingredients, "protein"), recipe.servings),
        fat=per_serving(total_nutrition(nutrition_ingredients, "fat"), recipe.servings),
        ingredients=ingredients,
        steps=[
            RecipePresentationStepOut(index=step.index, description=step.description)
            for step in sorted(recipe.steps, key=lambda item: item.index)
        ],
    )


def _resolve_proposal_foodstuff(
    foodstuff: ProposalFoodstuff, foodstuffs: Mapping[int, Foodstuff]
) -> ResolvedExistingProposalFoodstuff | ResolvedTemporaryProposalFoodstuff:
    if isinstance(foodstuff, ExistingProposalFoodstuff):
        summary = foodstuff_summary_out(foodstuffs[foodstuff.foodstuffId])
        return ResolvedExistingProposalFoodstuff.model_validate({
            **summary.model_dump(), "kind": "existing",
        })
    definition = foodstuff.definition
    return ResolvedTemporaryProposalFoodstuff.model_validate({
        **definition.model_dump(), "kind": "temporary", "unitVerbose": definition.unit.verbose_name,
    })
