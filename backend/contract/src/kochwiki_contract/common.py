from decimal import Decimal
from math import isfinite
from typing import Annotated

from pydantic import BeforeValidator, Field, PlainSerializer, WithJsonSchema


def validate_numeric_decimal(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("must be a number")
    decimal = value if isinstance(value, Decimal) else Decimal(str(value))
    serialize_decimal(decimal)
    return decimal


def numeric_decimal_schema(schema: dict[str, object]) -> None:
    branches = schema.pop("anyOf", None)
    if isinstance(branches, list):
        for branch in branches:
            if isinstance(branch, dict) and branch.get("type") == "number":
                schema.update(branch)
                break
    schema["type"] = "number"


def serialize_decimal(value: Decimal) -> float:
    number = float(value)
    if not isfinite(number):
        raise ValueError("must serialize as a finite JSON number")
    if number == 0 and value != 0:
        raise ValueError("must not underflow to zero during JSON serialization")
    return number


JsonDecimal = Annotated[
    Decimal,
    Field(allow_inf_nan=False, json_schema_extra=numeric_decimal_schema),
    BeforeValidator(validate_numeric_decimal),
    PlainSerializer(serialize_decimal, return_type=float, when_used="json"),
]

PositiveJsonDecimal = Annotated[
    JsonDecimal,
    Field(gt=0),
    WithJsonSchema({"type": "number", "exclusiveMinimum": 0}),
]

NonnegativeJsonDecimal = Annotated[
    JsonDecimal,
    Field(ge=0),
    WithJsonSchema({"type": "number", "minimum": 0}),
]
