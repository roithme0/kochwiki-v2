"""add UUID recipe lineages, versions, and drafts

Revision ID: 20260910_03
Revises: 20260831_02
Create Date: 2026-09-10
"""

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID, uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260910_03"
down_revision: str | None = "20260831_02"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

recipe_version_state_enum = postgresql.ENUM(
    "active", "draft", "historical", name="recipe_version_state_enum", create_type=False
)
uuid_type = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    connection = op.get_bind()
    migration_time = datetime.now(timezone.utc)

    op.rename_table("recipe", "recipe_legacy")
    op.drop_constraint("uq_recipe_name", "recipe_legacy", type_="unique")
    recipe_version_state_enum.create(connection, checkfirst=True)
    op.create_table(
        "recipe_lineage",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "recipe_version",
        sa.Column("version_id", uuid_type, primary_key=True),
        sa.Column("lineage_id", uuid_type, nullable=False),
        sa.Column("state", recipe_version_state_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_modified", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("preptime", sa.Integer(), nullable=True),
        sa.Column("origin_name", sa.String(length=200), nullable=True),
        sa.Column("origin_url", sa.String(length=200), nullable=True),
        sa.CheckConstraint("servings >= 1", name="ck_recipe_version_servings_positive"),
        sa.ForeignKeyConstraint(
            ["lineage_id"], ["recipe_lineage.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "uq_recipe_version_active",
        "recipe_version",
        ["lineage_id"],
        unique=True,
        postgresql_where=sa.text("state = 'active'"),
    )

    legacy_recipes = connection.execute(
        sa.text(
            "SELECT id, name, servings, preptime, origin_name, origin_url FROM recipe_legacy ORDER BY id"
        )
    ).mappings()
    version_ids_by_legacy_id: dict[int, UUID] = {}
    for legacy_recipe in legacy_recipes:
        lineage_id = uuid4()
        version_id = uuid4()
        version_ids_by_legacy_id[legacy_recipe["id"]] = version_id
        connection.execute(
            sa.text(
                "INSERT INTO recipe_lineage (id, created_at) VALUES (:id, :created_at)"
            ),
            {"id": lineage_id, "created_at": migration_time},
        )
        connection.execute(
            sa.text(
                "INSERT INTO recipe_version "
                "(version_id, lineage_id, state, created_at, last_modified, name, servings, preptime, origin_name, origin_url) "
                "VALUES (:version_id, :lineage_id, 'active', :created_at, :last_modified, :name, :servings, :preptime, :origin_name, :origin_url)"
            ),
            {
                "version_id": version_id,
                "lineage_id": lineage_id,
                "created_at": migration_time,
                "last_modified": migration_time,
                "name": legacy_recipe["name"],
                "servings": legacy_recipe["servings"],
                "preptime": legacy_recipe["preptime"],
                "origin_name": legacy_recipe["origin_name"],
                "origin_url": legacy_recipe["origin_url"],
            },
        )

    op.add_column(
        "ingredient", sa.Column("recipe_version_uuid", uuid_type, nullable=True)
    )
    op.add_column("step", sa.Column("recipe_version_uuid", uuid_type, nullable=True))
    for legacy_recipe_id, version_id in version_ids_by_legacy_id.items():
        connection.execute(
            sa.text(
                "UPDATE ingredient SET recipe_version_uuid = :version_id WHERE recipe_id = :recipe_id"
            ),
            {"version_id": version_id, "recipe_id": legacy_recipe_id},
        )
        connection.execute(
            sa.text(
                "UPDATE step SET recipe_version_uuid = :version_id WHERE recipe_id = :recipe_id"
            ),
            {"version_id": version_id, "recipe_id": legacy_recipe_id},
        )

    op.drop_constraint("ingredient_recipe_id_fkey", "ingredient", type_="foreignkey")
    op.drop_constraint("step_recipe_id_fkey", "step", type_="foreignkey")
    op.drop_constraint("uq_ingredient_foodstuff_recipe", "ingredient", type_="unique")
    op.drop_constraint("uq_ingredient_recipe_index", "ingredient", type_="unique")
    op.drop_constraint("uq_step_recipe_index", "step", type_="unique")
    op.drop_column("ingredient", "recipe_id")
    op.drop_column("step", "recipe_id")
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
    op.drop_table("recipe_legacy")


def downgrade() -> None:
    raise NotImplementedError(
        "Recipe versioning cannot be downgraded without losing versions and drafts"
    )
