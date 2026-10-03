"""Store searchable recipe version name embeddings."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "20261001_06"
down_revision: str | None = "20261001_05"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe_embedding",
        sa.Column("recipe_version_id", sa.Uuid(), sa.ForeignKey("recipe_version.version_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("vector", Vector(3072), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("recipe_embedding")
