from collections.abc import Iterator
from typing import Protocol, cast
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.database.session import engine


class OwnershipMigration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


@pytest.fixture
def migration() -> OwnershipMigration:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(
        "20261103_21"
    )
    assert revision is not None
    return cast(OwnershipMigration, revision.module)


@pytest.fixture
def legacy_database() -> Iterator[Connection]:
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(
                text('CREATE TEMP TABLE "user" (id integer PRIMARY KEY) ON COMMIT DROP')
            )
            connection.execute(text("SET LOCAL search_path TO pg_temp, public"))
            connection.execute(text("""
                CREATE TEMP TABLE foodstuff (
                    id serial PRIMARY KEY, name text NOT NULL, brand text, unit text NOT NULL,
                    kcal numeric, carbs numeric, protein numeric, fat numeric, image_id uuid,
                    CONSTRAINT uq_foodstuff_name_brand UNIQUE(name, brand)
                ) ON COMMIT DROP
            """))
            connection.execute(text("""
                CREATE TEMP TABLE foodstuff_embedding (
                    foodstuff_id integer PRIMARY KEY REFERENCES foodstuff(id),
                    profile text NOT NULL, source_text text NOT NULL, vector vector(1024) NOT NULL
                ) ON COMMIT DROP
            """))
            connection.execute(
                text(
                    'CREATE TEMP TABLE recipe_lineage (id uuid PRIMARY KEY, owner_id integer REFERENCES "user"(id)) ON COMMIT DROP'
                )
            )
            connection.execute(
                text(
                    "CREATE TEMP TABLE recipe_version (version_id uuid PRIMARY KEY, lineage_id uuid REFERENCES recipe_lineage(id), state text) ON COMMIT DROP"
                )
            )
            connection.execute(text("""
                CREATE TEMP TABLE ingredient (
                    id serial PRIMARY KEY, recipe_version_id uuid REFERENCES recipe_version(version_id),
                    foodstuff_id integer REFERENCES foodstuff(id), amount numeric, "index" integer,
                    UNIQUE (recipe_version_id, foodstuff_id)
                ) ON COMMIT DROP
            """))
            yield connection
        finally:
            transaction.rollback()


def test_catalogue_copies_remap_all_versions_and_preserve_images_embeddings(
    migration: OwnershipMigration, legacy_database: Connection
) -> None:
    connection = legacy_database
    image_id = uuid4()
    connection.execute(text('INSERT INTO "user" VALUES (3), (8), (12)'))
    connection.execute(
        text("""
        INSERT INTO foodstuff (name, brand, unit, kcal, carbs, protein, fat, image_id)
        VALUES ('Oats', 'Mill', 'G', 100, 20, 5, 0, :image),
               ('Unused', NULL, 'PIECE', NULL, NULL, NULL, NULL, NULL)
    """),
        {"image": image_id},
    )
    vector = "[1," + ",".join(["0"] * 1023) + "]"
    connection.execute(
        text(
            "INSERT INTO foodstuff_embedding VALUES (1, 'semantic-text-v1', 'Oats\nBrand: Mill', CAST(:vector AS vector))"
        ),
        {"vector": vector},
    )
    for owner in [3, 8]:
        lineage = uuid4()
        connection.execute(
            text("INSERT INTO recipe_lineage VALUES (:id, :owner)"),
            {"id": lineage, "owner": owner},
        )
        for state in ["active", "draft", "historical"]:
            version = uuid4()
            connection.execute(
                text("INSERT INTO recipe_version VALUES (:id, :lineage, :state)"),
                {"id": version, "lineage": lineage, "state": state},
            )
            connection.execute(
                text(
                    'INSERT INTO ingredient (recipe_version_id, foodstuff_id, amount, "index") VALUES (:version, 1, 125, 1)'
                ),
                {"version": version},
            )
    before = connection.execute(
        text(
            'SELECT id, recipe_version_id, amount, "index" FROM ingredient ORDER BY id'
        )
    ).all()
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    assert (
        connection.execute(
            text(
                'SELECT id, recipe_version_id, amount, "index" FROM ingredient ORDER BY id'
            )
        ).all()
        == before
    )
    assert connection.execute(
        text(
            "SELECT owner_id, count(*) FROM foodstuff GROUP BY owner_id ORDER BY owner_id"
        )
    ).all() == [(3, 2), (8, 2), (12, 2)]
    assert connection.scalar(text("""
        SELECT count(*) FROM ingredient i
        JOIN recipe_version v ON v.version_id = i.recipe_version_id
        JOIN recipe_lineage l ON l.id = v.lineage_id
        JOIN foodstuff f ON f.id = i.foodstuff_id
        WHERE l.owner_id != f.owner_id
    """)) == 0
    assert (
        connection.scalar(text("SELECT count(DISTINCT foodstuff_id) FROM ingredient"))
        == 2
    )
    assert (
        connection.scalar(
            text(
                "SELECT count(*) FROM foodstuff WHERE name = 'Oats' AND image_id = :image AND kcal = 100 AND fat = 0"
            ),
            {"image": image_id},
        )
        == 3
    )
    assert (
        connection.scalar(
            text(
                "SELECT count(*) FROM foodstuff_embedding WHERE profile = 'semantic-text-v1' AND source_text = 'Oats\nBrand: Mill'"
            )
        )
        == 3
    )
    connection.execute(
        text(
            "UPDATE foodstuff SET kcal = 250, image_id = NULL WHERE owner_id = 8 AND name = 'Oats'"
        )
    )
    assert (
        connection.scalar(
            text(
                "SELECT count(*) FROM foodstuff WHERE name = 'Oats' AND kcal = 100 AND image_id = :image"
            ),
            {"image": image_id},
        )
        == 2
    )
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(
            text(
                "INSERT INTO foodstuff (owner_id, name, brand, unit) VALUES (8, 'Oats', 'Mill', 'G')"
            )
        )
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(
            text("INSERT INTO foodstuff (name, unit) VALUES ('Unowned', 'G')")
        )
    new_id = connection.scalar(
        text(
            "INSERT INTO foodstuff (owner_id, name, unit) VALUES (12, 'Next', 'G') RETURNING id"
        )
    )
    assert isinstance(new_id, int) and new_id > 6
    with (
        Operations.context(MigrationContext.configure(connection)),
        pytest.raises(RuntimeError, match="restore a database backup"),
    ):
        migration.downgrade()


def test_empty_database_migrates(
    migration: OwnershipMigration, legacy_database: Connection
) -> None:
    with Operations.context(MigrationContext.configure(legacy_database)):
        migration.upgrade()
    assert legacy_database.scalar(text("SELECT count(*) FROM foodstuff")) == 0


def test_catalogue_without_users_aborts_without_changes(
    migration: OwnershipMigration, legacy_database: Connection
) -> None:
    connection = legacy_database
    connection.execute(text("INSERT INTO foodstuff (name, unit) VALUES ('Keep', 'G')"))
    with (
        Operations.context(MigrationContext.configure(connection)),
        pytest.raises(RuntimeError, match="without an existing user"),
    ):
        migration.upgrade()
    assert connection.scalar(text("SELECT name FROM foodstuff")) == "Keep"
    assert (
        connection.scalar(
            text(
                "SELECT count(*) FROM pg_attribute WHERE attrelid = 'pg_temp.foodstuff'::regclass AND attname = 'owner_id'"
            )
        )
        == 0
    )
