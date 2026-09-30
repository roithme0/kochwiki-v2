from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import NonnegativeJsonDecimal
from .enums import Unit


class FoodstuffSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid", strict=True)

    id: int = Field(gt=0)
    name: str
    brand: str | None
    unit: Unit = Field(strict=False)
    unitVerbose: str
    kcal: NonnegativeJsonDecimal | None
    carbs: NonnegativeJsonDecimal | None
    protein: NonnegativeJsonDecimal | None
    fat: NonnegativeJsonDecimal | None

    @field_validator("unit", mode="before")
    @classmethod
    def validate_unit_string(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("unit must be a string")
        return value


