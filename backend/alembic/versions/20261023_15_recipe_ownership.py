"""Require creator ownership for recipe lineages, clearing unowned pre-production recipes."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261023_15"
down_revision: str | None = "20261017_14"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("recipe_lineage", sa.Column("owner_id", sa.Integer(), nullable=True))
    op.execute(sa.text("DELETE FROM recipe_lineage WHERE owner_id IS NULL"))
    op.alter_column("recipe_lineage", "owner_id", nullable=False)
    op.create_foreign_key(
        "fk_recipe_lineage_owner_id", "recipe_lineage", "custom_user", ["owner_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_recipe_lineage_owner_id", "recipe_lineage", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_recipe_lineage_owner_id", table_name="recipe_lineage")
    op.drop_constraint("fk_recipe_lineage_owner_id", "recipe_lineage", type_="foreignkey")
    op.drop_column("recipe_lineage", "owner_id")
