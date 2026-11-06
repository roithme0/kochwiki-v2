from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffOut

FoodstuffNutrient = Literal["kcal", "carbs", "protein", "fat", "fiber"]
NutrientFillValue = Annotated[
    Decimal, Field(ge=0, max_digits=12, decimal_places=4, allow_inf_nan=False)
]


def nutrition_fill_schema(schema: dict[str, object]) -> None:
    schema["minProperties"] = 1
    properties = schema.get("properties")
    if isinstance(properties, dict):
        for field in properties.values():
            if isinstance(field, dict):
                field.pop("default", None)


class FoodstuffIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=50)
    brand: str | None = Field(max_length=100)
    details: str | None = Field(max_length=250)
    unit: Unit


class NutritionFill(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, json_schema_extra=nutrition_fill_schema
    )

    kcal: NutrientFillValue | SkipJsonSchema[None] = None
    carbs: NutrientFillValue | SkipJsonSchema[None] = None
    protein: NutrientFillValue | SkipJsonSchema[None] = None
    fat: NutrientFillValue | SkipJsonSchema[None] = None
    fiber: NutrientFillValue | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def require_values(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Supply at least one nutritional value")
        if any(value is None for value in self.model_dump(exclude_unset=True).values()):
            raise ValueError("Nutritional values cannot be null")
        return self

    def supplied_values(self) -> list[tuple[FoodstuffNutrient, Decimal]]:
        values: tuple[tuple[FoodstuffNutrient, Decimal | None], ...] = (
            ("kcal", self.kcal),
            ("carbs", self.carbs),
            ("protein", self.protein),
            ("fat", self.fat),
            ("fiber", self.fiber),
        )
        return [(name, value) for name, value in values if value is not None]


class NutritionFillResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    foodstuff: FoodstuffOut
    applied: list[FoodstuffNutrient]
    retained: list[FoodstuffNutrient]
