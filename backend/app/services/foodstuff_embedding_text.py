from sqlalchemy import case, literal
from sqlalchemy.sql.elements import ColumnElement

from app.models.foodstuff import Foodstuff


def source_text(name: str, brand: str | None) -> str:
    return name + ("\nBrand: " + brand if brand else "")


def current_source_text() -> ColumnElement[str]:
    return Foodstuff.name + case(
        ((Foodstuff.brand.is_not(None)) & (Foodstuff.brand != ""), literal("\nBrand: ") + Foodstuff.brand),
        else_=literal(""),
    )
