from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas.common import NonnegativeJsonDecimal


class ExactNutrition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["exact"]
    value: NonnegativeJsonDecimal


class MinimumNutrition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["minimum"]
    value: NonnegativeJsonDecimal


class UnknownNutrition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["unknown"]
    value: None


NutrientResult = Annotated[
    ExactNutrition | MinimumNutrition | UnknownNutrition,
    Field(discriminator="status"),
]
