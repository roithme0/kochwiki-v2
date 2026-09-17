from datetime import datetime
from decimal import Decimal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RecipeVersionState
from app.schemas.common import JsonDecimal
from app.schemas.foodstuff import FoodstuffSummaryOut


class IngredientWrite(BaseModel):
    index: int = Field(ge=1, le=99)
    amount: Decimal = Field(gt=0, le=9999)
    foodstuffId: int = Field(gt=0)


class StepWrite(BaseModel):
    index: int = Field(ge=1, le=99)
    description: str = Field(min_length=1, max_length=200)


class RecipeVersionFields(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    servings: int = Field(ge=1, le=99)
    preptime: int | None = Field(default=None, ge=1, le=999)
    originName: str | None = Field(default=None, max_length=200)
    originUrl: str | None = Field(default=None, max_length=200)

    @field_validator("originUrl")
    @classmethod
    def validate_origin_url(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        parsed = urlparse(value)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("originUrl must be a valid absolute URL")
        return value


class RecipeVersionWrite(RecipeVersionFields):
    ingredients: list[IngredientWrite] = Field(default_factory=list)
    steps: list[StepWrite] = Field(default_factory=list)

    @field_validator("ingredients")
    @classmethod
    def validate_unique_ingredients(cls, value: list[IngredientWrite]) -> list[IngredientWrite]:
        _validate_unique_indexes([ingredient.index for ingredient in value], "ingredient")
        if len({ingredient.foodstuffId for ingredient in value}) != len(value):
            raise ValueError("foodstuffs must be unique per recipe")
        return value

    @field_validator("steps")
    @classmethod
    def validate_unique_step_indexes(cls, value: list[StepWrite]) -> list[StepWrite]:
        _validate_unique_indexes([step.index for step in value], "step")
        return value


class RecipePresentationIngredientResolve(IngredientWrite):
    model_config = ConfigDict(extra="forbid")


class RecipePresentationStepResolve(StepWrite):
    model_config = ConfigDict(extra="forbid")


class RecipePresentationResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class IngredientOut(BaseModel):
    id: int
    index: int
    amount: JsonDecimal
    foodstuff: FoodstuffSummaryOut
    recipeVersionId: UUID


class StepOut(BaseModel):
    id: int
    index: int
    description: str
    recipeVersionId: UUID


class RecipeVersionOut(BaseModel):
    recipeLineageId: UUID
    recipeVersionId: UUID
    state: RecipeVersionState
    createdAt: datetime
    lastModified: datetime
    name: str
    servings: int
    preptime: int | None
    originName: str | None
    originUrl: str | None
    kcal: JsonDecimal | None
    carbs: JsonDecimal | None
    protein: JsonDecimal | None
    fat: JsonDecimal | None
    ingredients: list[IngredientOut]
    steps: list[StepOut]


class RecipePresentationIngredientOut(BaseModel):
    index: int
    amount: JsonDecimal
    foodstuff: FoodstuffSummaryOut


class RecipePresentationStepOut(BaseModel):
    index: int
    description: str


class RecipePresentationOut(BaseModel):
    servings: int
    preptime: int | None
    kcal: JsonDecimal | None
    carbs: JsonDecimal | None
    protein: JsonDecimal | None
    fat: JsonDecimal | None
    ingredients: list[RecipePresentationIngredientOut]
    steps: list[RecipePresentationStepOut]


def _validate_unique_indexes(indexes: list[int], item_name: str) -> None:
    if len(indexes) != len(set(indexes)):
        raise ValueError(f"{item_name} indexes must be unique per recipe")
