from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from app.foodstuffs.models.unit import Unit
from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient
from app.foodstuffs.schemas.foodstuff import FoodstuffSummaryOut
from app.recipes.schemas.proposal import ResolvedProposalFoodstuffFields
from app.recipes.schemas.nutrition import (
    ExactNutrition,
    MinimumNutrition,
    NutrientResult,
    UnknownNutrition,
)

NutritionField = Literal["kcal", "carbs", "protein", "fat"]
NutritionFoodstuff = Foodstuff | FoodstuffSummaryOut | ResolvedProposalFoodstuffFields


@dataclass(frozen=True)
class ResolvedNutritionIngredient:
    amount: Decimal
    foodstuff: NutritionFoodstuff


def total_nutrition(
    ingredients: Sequence[Ingredient | ResolvedNutritionIngredient],
    attribute: NutritionField,
) -> NutrientResult:
    total = Decimal("0")
    known = 0
    for ingredient in ingredients:
        value = _nutrition_value(ingredient.foodstuff, attribute)
        if value is None:
            continue
        known += 1
        if ingredient.foodstuff.unit in (Unit.G, Unit.ML):
            total += ingredient.amount * value / Decimal("100")
        else:
            total += ingredient.amount * value
    if known == 0:
        return UnknownNutrition(status="unknown", value=None)
    if known < len(ingredients):
        return MinimumNutrition(status="minimum", value=total)
    return ExactNutrition(status="exact", value=total)


def per_serving(total: NutrientResult, servings: int) -> NutrientResult:
    if total.status == "unknown":
        return total
    value = total.value / Decimal(servings)
    if total.status == "minimum":
        return MinimumNutrition(status="minimum", value=value)
    return ExactNutrition(status="exact", value=value)


def _nutrition_value(
    foodstuff: NutritionFoodstuff, attribute: NutritionField
) -> Decimal | None:
    if attribute == "kcal":
        return foodstuff.kcal
    if attribute == "carbs":
        return foodstuff.carbs
    if attribute == "protein":
        return foodstuff.protein
    return foodstuff.fat
