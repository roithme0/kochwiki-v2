from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer


def serialize_decimal(value: Decimal) -> float:
    return float(value)


JsonDecimal = Annotated[
    Decimal,
    PlainSerializer(serialize_decimal, return_type=float, when_used="json"),
]
