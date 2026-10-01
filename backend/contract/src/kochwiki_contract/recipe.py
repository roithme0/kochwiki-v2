from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import JsonDecimal, NonnegativeJsonDecimal, PositiveJsonDecimal
from .foodstuff import FoodstuffSummaryOut


class IngredientWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1, le=99)
    amount: JsonDecimal = Field(gt=0, le=9999)
    foodstuffId: int = Field(gt=0)


class StepWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1, le=99)
    description: str = Field(min_length=1, max_length=200)


class RecipePresentationIngredientResolve(IngredientWrite):
    model_config = ConfigDict(extra="forbid", strict=True)


class RecipePresentationStepResolve(StepWrite):
    model_config = ConfigDict(extra="forbid", strict=True)


class RecipePresentationResolve(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    servings: int = Field(ge=1, le=99)
    preptime: int | None = Field(ge=1, le=999)
    ingredients: list[RecipePresentationIngredientResolve]
    steps: list[RecipePresentationStepResolve]

    @field_validator("ingredients")
    @classmethod
    def validate_unique_ingredients(
        cls, value: list[RecipePresentationIngredientResolve]
    ) -> list[RecipePresentationIngredientResolve]:
        _validate_unique_indexes([ingredient.index for ingredient in value], "ingredient")
        if len({ingredient.foodstuffId for ingredient in value}) != len(value):
            raise ValueError("foodstuffs must be unique per recipe")
        return value

    @field_validator("steps")
    @classmethod
    def validate_unique_step_indexes(
        cls, value: list[RecipePresentationStepResolve]
    ) -> list[RecipePresentationStepResolve]:
        _validate_unique_indexes([step.index for step in value], "step")
        return value


class RecipePresentationIngredientOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1)
    amount: PositiveJsonDecimal
    foodstuff: FoodstuffSummaryOut


class RecipePresentationStepOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1)
    description: str = Field(min_length=1, max_length=200)


class RecipePresentationOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    servings: int = Field(ge=1)
    preptime: int | None = Field(ge=1)
    kcal: NonnegativeJsonDecimal | None
    carbs: NonnegativeJsonDecimal | None
    protein: NonnegativeJsonDecimal | None
    fat: NonnegativeJsonDecimal | None
    ingredients: list[RecipePresentationIngredientOut]
    steps: list[RecipePresentationStepOut]


def _validate_unique_indexes(indexes: list[int], item_name: str) -> None:
    if len(indexes) != len(set(indexes)):
        raise ValueError(f"{item_name} indexes must be unique per recipe")
