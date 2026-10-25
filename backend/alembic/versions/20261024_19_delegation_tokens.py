"""Persist session-bound opaque delegation tokens."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_19"
down_revision: str | None = "20261024_18"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delegation_token",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("secret_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("audience", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"], ["application_session.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "expires_at > created_at", name="ck_delegation_token_lifetime"
        ),
        sa.CheckConstraint(
            "length(secret_hash) = 64", name="ck_delegation_token_secret_hash"
        ),
    )
    op.create_index(
        "ix_delegation_token_session_id", "delegation_token", ["session_id"]
    )
    op.create_index(
        "ix_delegation_token_expires_at", "delegation_token", ["expires_at"]
    )


def downgrade() -> None:
    op.drop_table("delegation_token")
