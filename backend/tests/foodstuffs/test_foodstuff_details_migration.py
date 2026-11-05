from typing import Protocol, cast

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.database.session import engine


class DetailsMigration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


def test_details_migration_preserves_legacy_names_duplicates_and_references() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(
        "20261104_24"
    )
    assert revision is not None
    migration = cast(DetailsMigration, revision.module)
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(text("SET LOCAL search_path TO pg_temp, public"))
        connection.execute(
            text(
                "CREATE TEMP TABLE foodstuff (id integer PRIMARY KEY, owner_id integer, "
                "name text, brand text, CONSTRAINT uq_foodstuff_owner_name_brand "
                "UNIQUE (owner_id, name, brand)) ON COMMIT DROP"
            )
        )
        connection.execute(
            text(
                "CREATE TEMP TABLE ingredient (foodstuff_id integer REFERENCES foodstuff(id)) ON COMMIT DROP"
            )
        )
        connection.execute(
            text(
                "INSERT INTO foodstuff VALUES (7, 1, 'Kartoffeln, roh', NULL), (8, 1, 'Kartoffeln, roh', NULL), (9, 1, 'Potatoes', 'Farm')"
            )
        )
        connection.execute(text("INSERT INTO ingredient VALUES (7)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(
            text("SELECT id, name, brand, details FROM foodstuff ORDER BY id")
        ).all() == [
            (7, "Kartoffeln, roh", None, None),
            (8, "Kartoffeln, roh", None, None),
            (9, "Potatoes", "Farm", None),
        ]
        assert connection.scalar(text("SELECT foodstuff_id FROM ingredient")) == 7
        for details in (None, "raw", "cooked"):
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(
                    text(
                        "INSERT INTO foodstuff VALUES (10, 1, 'Potatoes', 'Farm', :details)"
                    ),
                    {"details": details},
                )
        connection.execute(text("UPDATE foodstuff SET details = 'raw' WHERE id = 9"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(
            text("SELECT id, name, brand FROM foodstuff ORDER BY id")
        ).all() == [
            (7, "Kartoffeln, roh", None),
            (8, "Kartoffeln, roh", None),
            (9, "Potatoes", "Farm"),
        ]
        assert connection.scalar(text("SELECT foodstuff_id FROM ingredient")) == 7
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text("INSERT INTO foodstuff VALUES (10, 1, 'Potatoes', 'Farm')")
            )
        transaction.rollback()
