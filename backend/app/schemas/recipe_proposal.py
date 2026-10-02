from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from kochwiki_contract import Unit
from kochwiki_contract.common import JsonDecimal, NonnegativeJsonDecimal
from kochwiki_contract.recipe import RecipePresentationStepOut, StepWrite, _validate_unique_indexes
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.foodstuff import FoodstuffCreate
from app.schemas.recipe import RecipeVersionFields


class ExistingProposalFoodstuff(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["existing"]
    foodstuffId: int = Field(gt=0)


class TemporaryProposalFoodstuff(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["temporary"]
    definition: FoodstuffCreate


ProposalFoodstuff = Annotated[
    ExistingProposalFoodstuff | TemporaryProposalFoodstuff, Field(discriminator="kind")
]


class ProposalIngredient(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1, le=99)
    amount: JsonDecimal = Field(gt=0, le=9999)
    foodstuff: ProposalFoodstuff


class ProposalRecipe(RecipeVersionFields):
    ingredients: list[ProposalIngredient]
    steps: list[StepWrite]

    @field_validator("ingredients")
    @classmethod
    def validate_unique_ingredients(cls, value: list[ProposalIngredient]) -> list[ProposalIngredient]:
        _validate_unique_indexes([ingredient.index for ingredient in value], "ingredient")
        existing_ids: set[int] = set()
        temporary_names: set[tuple[str, str | None]] = set()
        for ingredient in value:
            foodstuff = ingredient.foodstuff
            if isinstance(foodstuff, ExistingProposalFoodstuff):
                if foodstuff.foodstuffId in existing_ids:
                    raise ValueError("foodstuffs must be unique per recipe")
                existing_ids.add(foodstuff.foodstuffId)
            else:
                identity = (foodstuff.definition.name, foodstuff.definition.brand)
                if identity in temporary_names:
                    raise ValueError("temporary foodstuff names and brands must be unique per recipe")
                temporary_names.add(identity)
        return value

    @field_validator("steps")
    @classmethod
    def validate_unique_step_indexes(cls, value: list[StepWrite]) -> list[StepWrite]:
        _validate_unique_indexes([step.index for step in value], "step")
        return value


class RecipeProposalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceRecipeVersionId: UUID
    baseProposalId: UUID | None = None
    recipe: ProposalRecipe


class RecipeProposalOut(RecipeProposalCreate):
    proposalId: UUID
    createdAt: datetime


class ResolvedProposalFoodstuffFields(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: str
    brand: str | None
    unit: Unit = Field(strict=False)
    unitVerbose: str
    kcal: NonnegativeJsonDecimal | None
    carbs: NonnegativeJsonDecimal | None
    protein: NonnegativeJsonDecimal | None
    fat: NonnegativeJsonDecimal | None


class ResolvedExistingProposalFoodstuff(ResolvedProposalFoodstuffFields):
    kind: Literal["existing"]
    id: int = Field(gt=0)


class ResolvedTemporaryProposalFoodstuff(ResolvedProposalFoodstuffFields):
    kind: Literal["temporary"]


class ProposalPresentationIngredientOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    index: int = Field(ge=1, le=99)
    amount: JsonDecimal = Field(gt=0, le=9999)
    foodstuff: Annotated[
        ResolvedExistingProposalFoodstuff | ResolvedTemporaryProposalFoodstuff,
        Field(discriminator="kind"),
    ]


class RecipeProposalPresentationOut(RecipeVersionFields):
    kcal: NonnegativeJsonDecimal | None
    carbs: NonnegativeJsonDecimal | None
    protein: NonnegativeJsonDecimal | None
    fat: NonnegativeJsonDecimal | None
    ingredients: list[ProposalPresentationIngredientOut]
    steps: list[RecipePresentationStepOut]


class RecipeProposalDetailsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proposal: RecipeProposalOut
    presentation: RecipeProposalPresentationOut
