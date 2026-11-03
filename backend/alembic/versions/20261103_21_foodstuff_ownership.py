"""Give each existing user an independent foodstuff catalogue."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261103_21"
down_revision: str | None = "20261025_20"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    users = list(connection.scalars(sa.text('SELECT id FROM "user" ORDER BY id')))
    if not users and connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM foodstuff)")
    ):
        raise RuntimeError("Cannot assign existing foodstuffs without an existing user")

    op.add_column("foodstuff", sa.Column("owner_id", sa.Integer(), nullable=True))
    op.drop_constraint("uq_foodstuff_name_brand", "foodstuff", type_="unique")
    op.create_unique_constraint(
        "uq_foodstuff_owner_name_brand", "foodstuff", ["owner_id", "name", "brand"]
    )
    if users:
        connection.execute(
            sa.text("UPDATE foodstuff SET owner_id = :owner"), {"owner": users[0]}
        )
        connection.execute(sa.text("""
            CREATE TEMPORARY TABLE foodstuff_owner_copy (
                source_id integer NOT NULL,
                owner_id integer NOT NULL,
                foodstuff_id integer NOT NULL,
                PRIMARY KEY (source_id, owner_id)
            ) ON COMMIT DROP
        """))
        connection.execute(sa.text("""
            INSERT INTO foodstuff_owner_copy
            SELECT id, owner_id, id FROM foodstuff
        """))
        for owner in users[1:]:
            connection.execute(
                sa.text("""
                INSERT INTO foodstuff_owner_copy
                SELECT id, :owner, nextval(pg_get_serial_sequence('foodstuff', 'id'))
                FROM foodstuff WHERE owner_id = :source_owner
            """),
                {"owner": owner, "source_owner": users[0]},
            )
            connection.execute(
                sa.text("""
                INSERT INTO foodstuff (id, owner_id, name, brand, unit, kcal, carbs, protein, fat, image_id)
                SELECT mapping.foodstuff_id, mapping.owner_id, source.name, source.brand,
                    source.unit, source.kcal, source.carbs, source.protein, source.fat, source.image_id
                FROM foodstuff_owner_copy mapping
                JOIN foodstuff source ON source.id = mapping.source_id
                WHERE mapping.owner_id = :owner
            """),
                {"owner": owner},
            )
            connection.execute(
                sa.text("""
                INSERT INTO foodstuff_embedding (foodstuff_id, profile, source_text, vector)
                SELECT mapping.foodstuff_id, embedding.profile, embedding.source_text,
                    embedding.vector
                FROM foodstuff_owner_copy mapping
                JOIN foodstuff_embedding embedding ON embedding.foodstuff_id = mapping.source_id
                WHERE mapping.owner_id = :owner
            """),
                {"owner": owner},
            )
        connection.execute(sa.text("""
            UPDATE ingredient SET foodstuff_id = mapping.foodstuff_id
            FROM recipe_version version, recipe_lineage lineage, foodstuff_owner_copy mapping
            WHERE ingredient.recipe_version_id = version.version_id
                AND version.lineage_id = lineage.id
                AND mapping.source_id = ingredient.foodstuff_id
                AND mapping.owner_id = lineage.owner_id
        """))
    op.alter_column("foodstuff", "owner_id", nullable=False)
    op.create_foreign_key(
        "fk_foodstuff_owner_id",
        "foodstuff",
        "user",
        ["owner_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_foodstuff_owner_id", "foodstuff", ["owner_id"])
    op.create_table(
        "foodstuff_image_upload",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("uploader_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["uploader_id"], ["user.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_foodstuff_image_upload_uploader_id",
        "foodstuff_image_upload",
        ["uploader_id"],
    )


def downgrade() -> None:
    raise RuntimeError(
        "Independent foodstuff catalogues cannot be merged; restore a database backup instead"
    )
