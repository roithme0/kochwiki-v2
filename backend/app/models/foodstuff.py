from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import Unit

if TYPE_CHECKING:
    from app.models.recipe import Ingredient


class Foodstuff(Base):
    __tablename__ = "foodstuff"
    __table_args__ = (
        UniqueConstraint("name", "brand", name="uq_foodstuff_name_brand"),
        CheckConstraint("kcal IS NULL OR kcal >= 0", name="ck_foodstuff_kcal_nonnegative"),
        CheckConstraint("carbs IS NULL OR carbs >= 0", name="ck_foodstuff_carbs_nonnegative"),
        CheckConstraint("protein IS NULL OR protein >= 0", name="ck_foodstuff_protein_nonnegative"),
        CheckConstraint("fat IS NULL OR fat >= 0", name="ck_foodstuff_fat_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[Unit] = mapped_column(Enum(Unit, name="unit_enum"), nullable=False)
    kcal: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    carbs: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    protein: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    fat: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    ingredients: Mapped[list[Ingredient]] = relationship(back_populates="foodstuff")
