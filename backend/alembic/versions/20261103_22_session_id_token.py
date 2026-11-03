"""Retain validated ID tokens for browser provider logout."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261103_22"
down_revision: str | None = "20261103_21"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "application_session", sa.Column("id_token", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("application_session", "id_token")
