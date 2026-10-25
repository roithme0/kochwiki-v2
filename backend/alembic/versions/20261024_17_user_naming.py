"""Use the plain user name for local identities."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_17"
down_revision: str | None = "20261024_16"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.rename_table("custom_user", "user")
    op.execute(sa.text('ALTER TABLE "user" RENAME CONSTRAINT custom_user_pkey TO user_pkey'))
    op.execute(sa.text('ALTER TABLE "user" RENAME CONSTRAINT uq_custom_user_identity TO uq_user_identity'))
    op.execute(sa.text("ALTER SEQUENCE custom_user_id_seq RENAME TO user_id_seq"))


def downgrade() -> None:
    op.execute(sa.text("ALTER SEQUENCE user_id_seq RENAME TO custom_user_id_seq"))
    op.execute(sa.text('ALTER TABLE "user" RENAME CONSTRAINT uq_user_identity TO uq_custom_user_identity'))
    op.execute(sa.text('ALTER TABLE "user" RENAME CONSTRAINT user_pkey TO custom_user_pkey'))
    op.rename_table("user", "custom_user")
