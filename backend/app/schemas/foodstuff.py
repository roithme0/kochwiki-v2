from decimal import Decimal
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, RootModel, field_validator, model_validator

from app.models.enums import Unit
from app.schemas.common import JsonDecimal


class FoodstuffFields(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    brand: str | None = Field(default=None, max_length=100)
    unit: Unit
    kcal: Decimal | None = Field(default=None, ge=0)
    carbs: Decimal | None = Field(default=None, ge=0)
    protein: Decimal | None = Field(default=None, ge=0)
    fat: Decimal | None = Field(default=None, ge=0)

    @field_validator("brand", mode="before")
    @classmethod
    def empty_brand_is_none(cls, value: object) -> object:
        return None if value == "" else value


class FoodstuffCreate(FoodstuffFields):
    pass


class FoodstuffUpdate(FoodstuffFields):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    brand: str | None = Field(default=None, max_length=100)
    unit: Unit | None = None
    kcal: Decimal | None = Field(default=None, ge=0)
    carbs: Decimal | None = Field(default=None, ge=0)
    protein: Decimal | None = Field(default=None, ge=0)
    fat: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_required_fields(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        if "unit" in self.model_fields_set and self.unit is None:
            raise ValueError("unit cannot be null")
        return self


class FoodstuffSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    name: str
    brand: str | None
    unit: Unit
    unitVerbose: str
    kcal: JsonDecimal | None
    carbs: JsonDecimal | None
    protein: JsonDecimal | None
    fat: JsonDecimal | None


class FoodstuffOut(FoodstuffSummaryOut):
    recipeVersionIds: list[UUID]


class FoodstuffVerboseNames(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    brand: str
    unit: str
    unitVerbose: str
    kcal: str
    carbs: str
    protein: str
    fat: str


class FoodstuffUnitChoices(RootModel[dict[Unit, str]]):
    model_config = ConfigDict(json_schema_extra={
        "properties": {unit.value: {"type": "string"} for unit in Unit},
        "required": [unit.value for unit in Unit],
        "additionalProperties": False,
    })

    @model_validator(mode="after")
    def require_all_units(self) -> Self:
        if set(self.root) != set(Unit):
            raise ValueError("All supported units must have labels")
        return self
