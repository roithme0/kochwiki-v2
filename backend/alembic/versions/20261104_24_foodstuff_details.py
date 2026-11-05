"""Separate descriptive foodstuff details from product names."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261104_24"
down_revision: str | None = "20261103_23"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foodstuff", sa.Column("details", sa.String(250), nullable=True))


def downgrade() -> None:
    op.drop_column("foodstuff", "details")
