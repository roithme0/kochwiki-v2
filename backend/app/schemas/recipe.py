from datetime import datetime
from uuid import UUID

from kochwiki_contract.common import JsonDecimal
from kochwiki_contract.recipe import (
    IngredientWrite,
    RecipePresentationIngredientOut,
    RecipePresentationIngredientResolve,
    RecipePresentationOut,
    RecipePresentationResolve,
    RecipePresentationStepOut,
    RecipePresentationStepResolve,
    StepWrite,
    _validate_unique_indexes,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RecipeVersionState
from app.schemas.foodstuff import FoodstuffSummaryOut


class RecipeVersionFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    servings: int = Field(ge=1, le=99)
    preptime: int | None = Field(default=None, ge=1, le=999)


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


class RecipeVersionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipeLineageId: UUID
    recipeVersionId: UUID
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
