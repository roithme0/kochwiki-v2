from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from kochwiki_contract import Unit

from app.models.foodstuff import Foodstuff
from app.models.recipe import Ingredient
from app.schemas.foodstuff import FoodstuffSummaryOut
from app.schemas.recipe_proposal import ResolvedProposalFoodstuffFields

NutritionField = Literal["kcal", "carbs", "protein", "fat"]
NutritionFoodstuff = Foodstuff | FoodstuffSummaryOut | ResolvedProposalFoodstuffFields


@dataclass(frozen=True)
class ResolvedNutritionIngredient:
    amount: Decimal
    foodstuff: NutritionFoodstuff


def total_nutrition(
    ingredients: Sequence[Ingredient | ResolvedNutritionIngredient], attribute: NutritionField
) -> Decimal | None:
    if not ingredients:
        return None
    total = Decimal("0")
    for ingredient in ingredients:
        value = _nutrition_value(ingredient.foodstuff, attribute)
        if value is None:
            return None
        if ingredient.foodstuff.unit in (Unit.G, Unit.ML):
            total += ingredient.amount * value / Decimal("100")
        else:
            total += ingredient.amount * value
    return total


def per_serving(total: Decimal | None, servings: int) -> Decimal | None:
    return None if total is None else total / Decimal(servings)


def _nutrition_value(foodstuff: NutritionFoodstuff, attribute: NutritionField) -> Decimal | None:
    if attribute == "kcal":
        return foodstuff.kcal
    if attribute == "carbs":
        return foodstuff.carbs
    if attribute == "protein":
        return foodstuff.protein
    return foodstuff.fat
