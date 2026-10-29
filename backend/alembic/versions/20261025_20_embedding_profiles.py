"""Identify stored embeddings by service profile."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261025_20"
down_revision: str | None = "20261024_19"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TABLES = ("foodstuff_embedding", "recipe_embedding")
LEGACY_PREFIX = "legacy-model:"


def upgrade() -> None:
    for name in TABLES:
        op.alter_column(
            name,
            "model",
            new_column_name="profile",
            existing_type=sa.String(100),
            type_=sa.String(128),
        )
        table = sa.table(name, sa.column("profile", sa.String(128)))
        op.execute(
            table.update().values(
                profile=sa.case(
                    (table.c.profile == "text-embedding-3-large", "semantic-text-v1"),
                    else_=sa.literal(LEGACY_PREFIX) + table.c.profile,
                )
            )
        )


def downgrade() -> None:
    for name in TABLES:
        table = sa.table(name, sa.column("profile", sa.String(128)))
        op.execute(
            table.update().values(
                profile=sa.case(
                    (table.c.profile == "semantic-text-v1", "text-embedding-3-large"),
                    (
                        table.c.profile.startswith(LEGACY_PREFIX),
                        sa.func.substr(table.c.profile, len(LEGACY_PREFIX) + 1),
                    ),
                    else_=table.c.profile,
                )
            )
        )
        op.alter_column(
            name,
            "profile",
            new_column_name="model",
            existing_type=sa.String(128),
            type_=sa.String(100),
        )
