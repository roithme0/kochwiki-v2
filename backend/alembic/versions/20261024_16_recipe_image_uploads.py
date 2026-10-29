"""Record recipe image upload ownership."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_16"
down_revision: str | None = "20261023_15"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("image_asset", sa.Column("uploader_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_image_asset_uploader_id",
        "image_asset",
        "custom_user",
        ["uploader_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_image_asset_uploader_id", "image_asset", ["uploader_id"])
    op.create_table(
        "recipe_image_upload",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("uploader_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["uploader_id"], ["custom_user.id"], ondelete="RESTRICT"
        ),
    )
    op.create_index(
        "ix_recipe_image_upload_uploader_id", "recipe_image_upload", ["uploader_id"]
    )


def downgrade() -> None:
    op.drop_table("recipe_image_upload")
    op.drop_index("ix_image_asset_uploader_id", table_name="image_asset")
    op.drop_constraint("fk_image_asset_uploader_id", "image_asset", type_="foreignkey")
    op.drop_column("image_asset", "uploader_id")
