"""Store hash-only local application sessions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261012_10"
down_revision: str | None = "20261012_09"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "application_session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("secret_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("custom_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_provider_check_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_application_session_user_id", "application_session", ["user_id"]
    )
    op.create_index(
        "ix_application_session_last_activity_at",
        "application_session",
        ["last_activity_at"],
    )


def downgrade() -> None:
    op.drop_table("application_session")
