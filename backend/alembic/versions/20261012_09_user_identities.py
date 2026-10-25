"""Map validated provider identities to local users."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261012_09"
down_revision: str | None = "20261011_08"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    existing_users = op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM custom_user)")
    )
    if existing_users:
        raise RuntimeError(
            "The KochWiki user table must be empty before identity mapping is installed. "
            "Perform the agreed operator-controlled KochWiki database reset before upgrading; "
            "Keycloak accounts must remain intact. No users were deleted, linked or backfilled."
        )
    op.drop_constraint("custom_user_username_key", "custom_user", type_="unique")
    op.alter_column("custom_user", "username", new_column_name="display_name")
    op.add_column("custom_user", sa.Column("email", sa.Text(), nullable=False))
    op.add_column("custom_user", sa.Column("issuer", sa.Text(), nullable=False))
    op.add_column("custom_user", sa.Column("subject", sa.Text(), nullable=False))
    op.create_unique_constraint(
        "uq_custom_user_identity", "custom_user", ["issuer", "subject"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_custom_user_identity", "custom_user", type_="unique")
    op.drop_column("custom_user", "subject")
    op.drop_column("custom_user", "issuer")
    op.drop_column("custom_user", "email")
    op.alter_column("custom_user", "display_name", new_column_name="username")
    op.create_unique_constraint("custom_user_username_key", "custom_user", ["username"])
