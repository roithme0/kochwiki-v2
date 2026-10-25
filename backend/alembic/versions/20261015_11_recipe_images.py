"""Persist validated recipe image metadata."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261015_11"
down_revision: str | None = "20261012_10"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe_image",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("object_key", sa.String(1024), nullable=False, unique=True),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("size BETWEEN 1 AND 10485760", name="ck_recipe_image_size"),
        sa.CheckConstraint("width BETWEEN 1 AND 4096", name="ck_recipe_image_width"),
        sa.CheckConstraint("height BETWEEN 1 AND 4096", name="ck_recipe_image_height"),
        sa.CheckConstraint(
            "content_type = 'image/png'", name="ck_recipe_image_content_type"
        ),
        sa.CheckConstraint("length(sha256) = 64", name="ck_recipe_image_sha256"),
    )


def downgrade() -> None:
    op.drop_table("recipe_image")
