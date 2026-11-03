from decimal import Decimal
from typing import Protocol, cast

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.database.session import engine


class FiberMigration(Protocol):
    def upgrade(self) -> None: ...


def test_fiber_migration_preserves_existing_rows_and_references() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(
        "20261103_23"
    )
    assert revision is not None
    migration = cast(FiberMigration, revision.module)
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(text("SET LOCAL search_path TO pg_temp, public"))
        connection.execute(
            text(
                "CREATE TEMP TABLE foodstuff (id integer PRIMARY KEY, name text, kcal numeric(12, 4)) ON COMMIT DROP"
            )
        )
        connection.execute(
            text(
                "CREATE TEMP TABLE ingredient (foodstuff_id integer REFERENCES foodstuff(id), amount numeric) ON COMMIT DROP"
            )
        )
        connection.execute(text("INSERT INTO foodstuff VALUES (7, 'Oats', 370.1234)"))
        connection.execute(text("INSERT INTO ingredient VALUES (7, 125)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(
            text("SELECT id, name, kcal, fiber FROM foodstuff")
        ).one() == (7, "Oats", Decimal("370.1234"), None)
        assert connection.execute(
            text("SELECT foodstuff_id, amount FROM ingredient")
        ).one() == (7, 125)
        precision = connection.execute(
            text(
                "SELECT numeric_precision, numeric_scale, is_nullable FROM information_schema.columns WHERE table_schema LIKE 'pg_temp_%' AND table_name = 'foodstuff' AND column_name = 'fiber'"
            )
        ).one()
        assert precision == (12, 4, "YES")
        for value in (0, 1.2345, None):
            connection.execute(
                text("UPDATE foodstuff SET fiber = :value"), {"value": value}
            )
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE foodstuff SET fiber = -1"))
        transaction.rollback()
