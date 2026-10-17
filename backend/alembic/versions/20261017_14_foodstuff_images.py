"""Associate foodstuffs with validated images."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261017_14"
down_revision: str | None = "20261017_13"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foodstuff", sa.Column("image_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_foodstuff_image_id", "foodstuff", "image_asset", ["image_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_foodstuff_image_id", "foodstuff", ["image_id"])


def downgrade() -> None:
    op.drop_index("ix_foodstuff_image_id", table_name="foodstuff")
    op.drop_constraint("fk_foodstuff_image_id", "foodstuff", type_="foreignkey")
    op.drop_column("foodstuff", "image_id")
