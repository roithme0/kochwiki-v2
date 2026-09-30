from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator, Field, PlainSerializer


def validate_numeric_decimal(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("must be a number")
    return value if isinstance(value, Decimal) else Decimal(str(value))


def numeric_decimal_schema(schema: dict[str, object]) -> None:
    branches = schema.pop("anyOf", None)
    if isinstance(branches, list):
        for branch in branches:
            if isinstance(branch, dict) and branch.get("type") == "number":
                schema.update(branch)
                break
    schema["type"] = "number"


def serialize_decimal(value: Decimal) -> float:
    return float(value)


JsonDecimal = Annotated[
    Decimal,
    Field(allow_inf_nan=False, json_schema_extra=numeric_decimal_schema),
    BeforeValidator(validate_numeric_decimal),
    PlainSerializer(serialize_decimal, return_type=float, when_used="json"),
]
