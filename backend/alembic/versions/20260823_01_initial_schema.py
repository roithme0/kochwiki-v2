"""create FastAPI core schema

Revision ID: 20260823_01
Revises:
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260823_01"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

unit_enum = postgresql.ENUM("G", "ML", "PIECE", name="unit_enum", create_type=False)


def upgrade() -> None:
    unit_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "foodstuff",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("unit", unit_enum, nullable=False),
        sa.Column("kcal", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("carbs", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("protein", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("fat", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.CheckConstraint(
            "kcal IS NULL OR kcal >= 0", name="ck_foodstuff_kcal_nonnegative"
        ),
        sa.CheckConstraint(
            "carbs IS NULL OR carbs >= 0", name="ck_foodstuff_carbs_nonnegative"
        ),
        sa.CheckConstraint(
            "protein IS NULL OR protein >= 0", name="ck_foodstuff_protein_nonnegative"
        ),
        sa.CheckConstraint(
            "fat IS NULL OR fat >= 0", name="ck_foodstuff_fat_nonnegative"
        ),
        sa.UniqueConstraint("name", "brand", name="uq_foodstuff_name_brand"),
    )
    op.create_table(
        "recipe",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("preptime", sa.Integer(), nullable=True),
        sa.Column("origin_name", sa.String(length=200), nullable=True),
        sa.Column("origin_url", sa.String(length=200), nullable=True),
        sa.CheckConstraint("servings >= 1", name="ck_recipe_servings_positive"),
        sa.UniqueConstraint("name", name="uq_recipe_name"),
    )
    op.create_table(
        "custom_user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "ingredient",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("foodstuff_id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.CheckConstraint('"index" >= 1', name="ck_ingredient_index_positive"),
        sa.CheckConstraint("amount > 0", name="ck_ingredient_amount_positive"),
        sa.ForeignKeyConstraint(
            ["foodstuff_id"], ["foodstuff.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipe.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "foodstuff_id", "recipe_id", name="uq_ingredient_foodstuff_recipe"
        ),
    )
    op.create_table(
        "step",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.CheckConstraint('"index" >= 1', name="ck_step_index_positive"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipe.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("step")
    op.drop_table("ingredient")
    op.drop_table("custom_user")
    op.drop_table("recipe")
    op.drop_table("foodstuff")
    unit_enum.drop(op.get_bind(), checkfirst=True)
