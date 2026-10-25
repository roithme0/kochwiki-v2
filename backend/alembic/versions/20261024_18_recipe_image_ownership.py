"""Remove recipe images without an uploader."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_18"
down_revision: str | None = "20261024_17"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("""
        UPDATE recipe_version SET image_id = NULL
        WHERE image_id IN (
            SELECT id FROM image_asset WHERE kind = 'recipe' AND uploader_id IS NULL
        )
    """))
    op.execute(
        sa.text("DELETE FROM image_asset WHERE kind = 'recipe' AND uploader_id IS NULL")
    )


def downgrade() -> None:
    pass
