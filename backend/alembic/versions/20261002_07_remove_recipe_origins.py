"""Remove recipe source attribution fields.

The removed origin_name and origin_url values are discarded during upgrade.
Downgrade restores nullable columns only; the deleted values cannot be recovered.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261002_07"
down_revision: str | None = "20261001_06"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("recipe_version", "origin_url")
    op.drop_column("recipe_version", "origin_name")


def downgrade() -> None:
    op.add_column("recipe_version", sa.Column("origin_name", sa.String(length=200), nullable=True))
    op.add_column("recipe_version", sa.Column("origin_url", sa.String(length=200), nullable=True))
