"""enforce unique recipe ingredient and step positions

Revision ID: 20260831_02
Revises: 20260823_01
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260831_02"
down_revision: str | None = "20260823_01"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_ingredient_recipe_index", "ingredient", ["recipe_id", "index"]
    )
    op.create_unique_constraint("uq_step_recipe_index", "step", ["recipe_id", "index"])


def downgrade() -> None:
    op.drop_constraint("uq_step_recipe_index", "step", type_="unique")
    op.drop_constraint("uq_ingredient_recipe_index", "ingredient", type_="unique")
