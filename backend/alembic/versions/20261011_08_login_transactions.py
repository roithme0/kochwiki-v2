"""Store single-use, browser-bound OIDC login transactions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261011_08"
down_revision: str | None = "20261002_07"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_transaction",
        sa.Column("state_hash", sa.String(64), primary_key=True),
        sa.Column("browser_hash", sa.String(64), nullable=False),
        sa.Column("nonce", sa.String(128), nullable=False),
        sa.Column("verifier", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_login_transaction_expires_at", "login_transaction", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_login_transaction_expires_at", table_name="login_transaction")
    op.drop_table("login_transaction")
