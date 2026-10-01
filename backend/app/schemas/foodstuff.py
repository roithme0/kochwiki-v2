from decimal import Decimal
from typing import Self
from uuid import UUID

from kochwiki_contract import FoodstuffSummaryOut, Unit
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FoodstuffFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class FoodstuffOut(FoodstuffSummaryOut):
    recipeVersionIds: list[UUID]
