from pydantic import BaseModel, ConfigDict

from .common import JsonDecimal
from .enums import Unit


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


