"""Associate recipe versions with validated images."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261015_12"
down_revision: str | None = "20261015_11"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("recipe_version", sa.Column("image_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_recipe_version_image_id",
        "recipe_version",
        "recipe_image",
        ["image_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_recipe_version_image_id", "recipe_version", ["image_id"])


def downgrade() -> None:
    op.drop_index("ix_recipe_version_image_id", table_name="recipe_version")
    op.drop_constraint(
        "fk_recipe_version_image_id", "recipe_version", type_="foreignkey"
    )
    op.drop_column("recipe_version", "image_id")
