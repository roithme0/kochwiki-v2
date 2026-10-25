"""Share validated image metadata while preserving recipe references."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261017_13"
down_revision: str | None = "20261015_12"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.rename_table("recipe_image", "image_asset")
    op.add_column(
        "image_asset",
        sa.Column("kind", sa.String(9), nullable=False, server_default="recipe"),
    )
    op.alter_column("image_asset", "kind", server_default=None)
    op.create_check_constraint(
        "ck_image_asset_kind", "image_asset", "kind IN ('recipe', 'foodstuff')"
    )
    op.drop_constraint("recipe_image_object_key_key", "image_asset", type_="unique")
    op.create_unique_constraint(
        "uq_image_asset_kind_object_key", "image_asset", ["kind", "object_key"]
    )
    for suffix in ("size", "width", "height", "content_type", "sha256"):
        op.execute(
            sa.text(
                f"ALTER TABLE image_asset RENAME CONSTRAINT ck_recipe_image_{suffix} TO ck_image_asset_{suffix}"
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    if connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM image_asset WHERE kind <> 'recipe')")
    ):
        raise RuntimeError(
            "Cannot downgrade shared image metadata while non-recipe images exist"
        )
    for suffix in ("size", "width", "height", "content_type", "sha256"):
        op.execute(
            sa.text(
                f"ALTER TABLE image_asset RENAME CONSTRAINT ck_image_asset_{suffix} TO ck_recipe_image_{suffix}"
            )
        )
    op.drop_constraint("uq_image_asset_kind_object_key", "image_asset", type_="unique")
    op.create_unique_constraint(
        "recipe_image_object_key_key", "image_asset", ["object_key"]
    )
    op.drop_constraint("ck_image_asset_kind", "image_asset", type_="check")
    op.drop_column("image_asset", "kind")
    op.rename_table("image_asset", "recipe_image")
