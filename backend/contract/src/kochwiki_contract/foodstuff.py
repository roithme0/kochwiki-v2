from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import JsonDecimal
from .enums import Unit


class FoodstuffSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid", strict=True)

    id: int
    name: str
    brand: str | None
    unit: Unit = Field(strict=False)
    unitVerbose: str
    kcal: JsonDecimal | None
    carbs: JsonDecimal | None
    protein: JsonDecimal | None
    fat: JsonDecimal | None

    @field_validator("unit", mode="before")
    @classmethod
    def validate_unit_string(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("unit must be a string")
        return value


