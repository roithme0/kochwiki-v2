import unittest
from decimal import Decimal

from pydantic import TypeAdapter, ValidationError

from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffSummaryOut
from app.recipes.schemas.nutrition import NutrientResult
from app.recipes.services.nutrition import (
    NutritionField,
    ResolvedNutritionIngredient,
    per_serving,
    total_nutrition,
)


def ingredient(
    unit: Unit, amount: int, value: int | None
) -> ResolvedNutritionIngredient:
    foodstuff = FoodstuffSummaryOut(
        id=1,
        imageId=None,
        name="Ingredient",
        brand=None,
        unit=unit,
        unitVerbose=unit.verbose_name,
        kcal=value,
        carbs=value,
        protein=value,
        fat=value,
    )
    return ResolvedNutritionIngredient(amount=Decimal(amount), foodstuff=foodstuff)


class NutritionTests(unittest.TestCase):
    def test_known_contributions_survive_missing_values_in_any_order(self) -> None:
        for unit, amount in ((Unit.G, 200), (Unit.ML, 200), (Unit.PIECE, 2)):
            with self.subTest(unit=unit):
                known = ingredient(unit, amount, 25)
                missing = ingredient(unit, 100, None)
                for ingredients in ([known, missing], [missing, known]):
                    result = per_serving(total_nutrition(ingredients, "carbs"), 2)
                    self.assertEqual(result.status, "minimum")
                    self.assertEqual(result.value, Decimal(25))
                exact = per_serving(total_nutrition([known], "carbs"), 2)
                self.assertEqual(exact.status, "exact")
                self.assertEqual(exact.value, Decimal(25))

    def test_zero_and_unknown_are_distinct(self) -> None:
        zero = ingredient(Unit.G, 100, 0)
        missing = ingredient(Unit.G, 100, None)
        for ingredients, status, value in (
            ([], "unknown", None),
            ([missing], "unknown", None),
            ([zero], "exact", Decimal(0)),
            ([zero, missing], "minimum", Decimal(0)),
        ):
            with self.subTest(status=status, ingredients=ingredients):
                result = per_serving(total_nutrition(ingredients, "fat"), 2)
                self.assertEqual((result.status, result.value), (status, value))

    def test_completeness_is_independent_per_nutrient(self) -> None:
        first = ingredient(Unit.G, 100, 20)
        second = ingredient(Unit.G, 100, 10)
        second.foodstuff.protein = None
        fields: tuple[NutritionField, ...] = ("kcal", "carbs", "protein", "fat")
        for field in fields:
            result = per_serving(total_nutrition([first, second], field), 2)
            self.assertEqual(
                result.status, "minimum" if field == "protein" else "exact"
            )
            self.assertEqual(result.value, Decimal(10 if field == "protein" else 15))

    def test_contract_rejects_inconsistent_or_legacy_results(self) -> None:
        adapter = TypeAdapter(NutrientResult)
        for payload in (
            None,
            12,
            {"status": "exact", "value": None},
            {"status": "minimum", "value": -1},
            {"status": "unknown", "value": 0},
            {"status": "exact", "value": True},
            {"status": "exact", "value": "12"},
            {"status": "exact"},
            {"value": 12},
            {"status": "exact", "value": 12, "extra": True},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                adapter.validate_python(payload)
