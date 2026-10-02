"""Store current foodstuff name/brand embeddings."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "20261001_05"
down_revision: str | None = "20260910_04"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "foodstuff_embedding",
        sa.Column("foodstuff_id", sa.Integer(), sa.ForeignKey("foodstuff.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("vector", Vector(3072), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("foodstuff_embedding")
