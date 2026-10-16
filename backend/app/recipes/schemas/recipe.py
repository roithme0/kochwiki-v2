from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.recipes.models.enums import RecipeVersionState
from app.core.schemas.common import JsonDecimal, NonnegativeJsonDecimal, PositiveJsonDecimal
from app.foodstuffs.schemas.foodstuff import FoodstuffSummaryOut


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


class RecipeVersionFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    servings: int = Field(ge=1, le=99)
    preptime: int | None = Field(default=None, ge=1, le=999)


class RecipeVersionWrite(RecipeVersionFields):
    imageId: UUID | None = Field(
        default=None,
        description="Omit to keep or inherit the source image; null removes it; an ID selects a validated image.",
    )
    ingredients: list[IngredientWrite] = Field(default_factory=list)
    steps: list[StepWrite] = Field(default_factory=list)

    @field_validator("ingredients")
    @classmethod
    def validate_unique_ingredients(
        cls, value: list[IngredientWrite]
    ) -> list[IngredientWrite]:
        _validate_unique_indexes(
            [ingredient.index for ingredient in value], "ingredient"
        )
        if len({ingredient.foodstuffId for ingredient in value}) != len(value):
            raise ValueError("foodstuffs must be unique per recipe")
        return value

    @field_validator("steps")
    @classmethod
    def validate_unique_step_indexes(cls, value: list[StepWrite]) -> list[StepWrite]:
        _validate_unique_indexes([step.index for step in value], "step")
        return value


class IngredientOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    index: int
    amount: JsonDecimal
    foodstuff: FoodstuffSummaryOut
    recipeVersionId: UUID


class StepOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    index: int
    description: str
    recipeVersionId: UUID


class RecipeImageDimensionsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(gt=0)
    height: int = Field(gt=0)


class RecipeVersionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipeLineageId: UUID
    recipeVersionId: UUID
    imageId: UUID | None
    imageDimensions: RecipeImageDimensionsOut | None
    state: RecipeVersionState
    createdAt: datetime
    lastModified: datetime
    name: str
    servings: int
    preptime: int | None
    kcal: JsonDecimal | None
    carbs: JsonDecimal | None
    protein: JsonDecimal | None
    fat: JsonDecimal | None
    ingredients: list[IngredientOut]
    steps: list[StepOut]


class RecipeLineageOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipeLineageId: UUID
    versions: list[RecipeVersionOut]
