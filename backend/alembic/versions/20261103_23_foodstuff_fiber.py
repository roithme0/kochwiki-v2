"""Add dietary fiber to foodstuff nutrition."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261103_23"
down_revision: str | None = "20261103_22"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("foodstuff", sa.Column("fiber", sa.Numeric(12, 4), nullable=True))
    op.create_check_constraint(
        "ck_foodstuff_fiber_nonnegative", "foodstuff", "fiber IS NULL OR fiber >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_foodstuff_fiber_nonnegative", "foodstuff", type_="check")
    op.drop_column("foodstuff", "fiber")
