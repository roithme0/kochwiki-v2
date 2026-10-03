from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import RecipeVersionState

if TYPE_CHECKING:
    from app.models.foodstuff import Foodstuff


class RecipeLineage(Base):
    __tablename__ = "recipe_lineage"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    versions: Mapped[list[RecipeVersion]] = relationship(
        back_populates="lineage", cascade="all, delete-orphan"
    )


class RecipeVersion(Base):
    __tablename__ = "recipe_version"
    __table_args__ = (
        CheckConstraint("servings >= 1", name="ck_recipe_version_servings_positive"),
        Index(
            "uq_recipe_version_active",
            "lineage_id",
            unique=True,
            postgresql_where=text("state = 'active'"),
        ),
    )

    version_id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    lineage_id: Mapped[UUID] = mapped_column(ForeignKey("recipe_lineage.id", ondelete="CASCADE"), nullable=False)
    state: Mapped[RecipeVersionState] = mapped_column(
        Enum(RecipeVersionState, name="recipe_version_state_enum", values_callable=lambda states: [state.value for state in states]),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_modified: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    servings: Mapped[int] = mapped_column(nullable=False)
    preptime: Mapped[int | None] = mapped_column(nullable=True)
    ingredients: Mapped[list[Ingredient]] = relationship(
        back_populates="recipe_version", cascade="all, delete-orphan", order_by="Ingredient.index"
    )
    steps: Mapped[list[Step]] = relationship(
        back_populates="recipe_version", cascade="all, delete-orphan", order_by="Step.index"
    )
    lineage: Mapped[RecipeLineage] = relationship(back_populates="versions")


class Ingredient(Base):
    __tablename__ = "ingredient"
    __table_args__ = (
        UniqueConstraint("foodstuff_id", "recipe_version_id", name="uq_ingredient_foodstuff_recipe"),
        UniqueConstraint("recipe_version_id", "index", name="uq_ingredient_recipe_index"),
        CheckConstraint('"index" >= 1', name="ck_ingredient_index_positive"),
        CheckConstraint("amount > 0", name="ck_ingredient_amount_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    index: Mapped[int] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    foodstuff_id: Mapped[int] = mapped_column(ForeignKey("foodstuff.id", ondelete="RESTRICT"), nullable=False)
    recipe_version_id: Mapped[UUID] = mapped_column(ForeignKey("recipe_version.version_id", ondelete="CASCADE"), nullable=False)
    foodstuff: Mapped[Foodstuff] = relationship(back_populates="ingredients")
    recipe_version: Mapped[RecipeVersion] = relationship(back_populates="ingredients")


class Step(Base):
    __tablename__ = "step"
    __table_args__ = (
        UniqueConstraint("recipe_version_id", "index", name="uq_step_recipe_index"),
        CheckConstraint('"index" >= 1', name="ck_step_index_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    index: Mapped[int] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    recipe_version_id: Mapped[UUID] = mapped_column(ForeignKey("recipe_version.version_id", ondelete="CASCADE"), nullable=False)
    recipe_version: Mapped[RecipeVersion] = relationship(back_populates="steps")
