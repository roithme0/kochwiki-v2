"""repair recipe versioning schema after the pre-lineage migration

Revision 03 briefly used integer recipe and version identities before it was
rewritten. This upgrades databases stamped with that shape and is a no-op for
databases created through the final revision 03.

Revision ID: 20260910_04
Revises: 20260910_03
Create Date: 2026-09-10
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260910_04"
down_revision: str | None = "20260910_03"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

recipe_version_state_enum = postgresql.ENUM(
    "active", "draft", "historical", name="recipe_version_state_enum", create_type=False
)
uuid_type = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    connection = op.get_bind()
    recipe_version_columns = {
        column["name"]
        for column in sa.inspect(connection).get_columns("recipe_version")
    }
    if "lineage_id" in recipe_version_columns:
        return

    recipe_version_state_enum.create(connection, checkfirst=True)
    op.create_table(
        "recipe_lineage",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column("recipe_version", sa.Column("lineage_id", uuid_type, nullable=True))

    legacy_lineages = connection.execute(
        sa.text("SELECT id, created_at FROM recipe ORDER BY id")
    ).mappings()
    for legacy_lineage in legacy_lineages:
        lineage_id = uuid4()
        connection.execute(
            sa.text(
                "INSERT INTO recipe_lineage (id, created_at) "
                "VALUES (:lineage_id, :created_at)"
            ),
            {"lineage_id": lineage_id, "created_at": legacy_lineage["created_at"]},
        )
        connection.execute(
            sa.text(
                "UPDATE recipe_version SET lineage_id = :lineage_id "
                "WHERE recipe_id = :legacy_lineage_id"
            ),
            {
                "lineage_id": lineage_id,
                "legacy_lineage_id": legacy_lineage["id"],
            },
        )

    op.alter_column("recipe_version", "lineage_id", nullable=False)
    op.create_foreign_key(
        "recipe_version_lineage_id_fkey",
        "recipe_version",
        "recipe_lineage",
        ["lineage_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column(
        "ingredient", sa.Column("recipe_version_uuid", uuid_type, nullable=True)
    )
    op.add_column("step", sa.Column("recipe_version_uuid", uuid_type, nullable=True))
    connection.execute(
        sa.text(
            "UPDATE ingredient SET recipe_version_uuid = recipe_version.version_id "
            "FROM recipe_version "
            "WHERE ingredient.recipe_version_id = recipe_version.id"
        )
    )
    connection.execute(
        sa.text(
            "UPDATE step SET recipe_version_uuid = recipe_version.version_id "
            "FROM recipe_version "
            "WHERE step.recipe_version_id = recipe_version.id"
        )
    )

    op.drop_constraint(
        "ingredient_recipe_version_id_fkey", "ingredient", type_="foreignkey"
    )
    op.drop_constraint("step_recipe_version_id_fkey", "step", type_="foreignkey")
    op.drop_constraint("uq_ingredient_foodstuff_recipe", "ingredient", type_="unique")
    op.drop_constraint("uq_ingredient_recipe_index", "ingredient", type_="unique")
    op.drop_constraint("uq_step_recipe_index", "step", type_="unique")
    op.drop_column("ingredient", "recipe_version_id")
    op.drop_column("step", "recipe_version_id")
    op.alter_column(
        "ingredient",
        "recipe_version_uuid",
        new_column_name="recipe_version_id",
        nullable=False,
    )
    op.alter_column(
        "step",
        "recipe_version_uuid",
        new_column_name="recipe_version_id",
        nullable=False,
    )

    op.drop_index("uq_recipe_version_active", table_name="recipe_version")
    op.drop_constraint("fk_recipe_version_recipe", "recipe_version", type_="foreignkey")
    op.drop_constraint("recipe_pkey", "recipe_version", type_="primary")
    op.drop_constraint("uq_recipe_version_version_id", "recipe_version", type_="unique")
    op.drop_constraint("ck_recipe_servings_positive", "recipe_version", type_="check")
    op.drop_column("recipe_version", "id")
    op.drop_column("recipe_version", "recipe_id")
    op.create_primary_key("recipe_version_pkey", "recipe_version", ["version_id"])

    op.execute(
        "ALTER TABLE recipe_version ALTER COLUMN state "
        "TYPE recipe_version_state_enum "
        "USING state::text::recipe_version_state_enum"
    )
    op.create_index(
        "uq_recipe_version_active",
        "recipe_version",
        ["lineage_id"],
        unique=True,
        postgresql_where=sa.text("state = 'active'"),
    )

    op.create_foreign_key(
        "ingredient_recipe_version_id_fkey",
        "ingredient",
        "recipe_version",
        ["recipe_version_id"],
        ["version_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "step_recipe_version_id_fkey",
        "step",
        "recipe_version",
        ["recipe_version_id"],
        ["version_id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_ingredient_foodstuff_recipe",
        "ingredient",
        ["foodstuff_id", "recipe_version_id"],
    )
    op.create_unique_constraint(
        "uq_ingredient_recipe_index", "ingredient", ["recipe_version_id", "index"]
    )
    op.create_unique_constraint(
        "uq_step_recipe_index", "step", ["recipe_version_id", "index"]
    )

    op.drop_table("recipe")
    postgresql.ENUM(name="recipe_state_enum").drop(connection, checkfirst=True)


def downgrade() -> None:
    raise NotImplementedError(
        "The recipe versioning repair cannot be downgraded without losing lineage data"
    )
