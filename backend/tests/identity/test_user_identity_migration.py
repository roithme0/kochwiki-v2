from typing import Protocol, cast

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.database.session import engine

OLD_USER_TABLE = """
CREATE TEMP TABLE custom_user (
    id INTEGER PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    CONSTRAINT custom_user_username_key UNIQUE (username)
) ON COMMIT DROP
"""


class Migration(Protocol):
    def upgrade(self) -> None: ...


@pytest.fixture
def user_identity_migration() -> Migration:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(
        "20261012_09"
    )
    assert revision is not None
    return cast(Migration, revision.module)


def test_existing_users_stop_migration_without_deletion_or_backfill(
    user_identity_migration: Migration,
) -> None:
    with engine.begin() as connection:
        connection.execute(text(OLD_USER_TABLE))
        connection.execute(text("INSERT INTO custom_user VALUES (1, 'Original user')"))
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(
                RuntimeError, match="operator-controlled KochWiki database reset"
            ):
                user_identity_migration.upgrade()
        assert connection.execute(
            text("SELECT id, username FROM custom_user")
        ).all() == [(1, "Original user")]


def test_empty_old_schema_upgrades_to_required_provider_profiles(
    user_identity_migration: Migration,
) -> None:
    with engine.begin() as connection:
        connection.execute(text(OLD_USER_TABLE))
        with Operations.context(MigrationContext.configure(connection)):
            user_identity_migration.upgrade()
        columns = dict(connection.execute(text("""
            SELECT attname, attnotnull FROM pg_attribute
            WHERE attrelid = 'pg_temp.custom_user'::regclass AND attnum > 0 AND NOT attisdropped
        """)).tuples().all())
        assert columns == {
            "id": True,
            "display_name": True,
            "email": True,
            "issuer": True,
            "subject": True,
        }
        connection.execute(text("""
            INSERT INTO custom_user (id, display_name, email, issuer, subject) VALUES
            (1, 'Shared name', 'shared@example.invalid', 'issuer', 'first'),
            (2, 'Shared name', 'shared@example.invalid', 'issuer', 'second')
        """))
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(text("""
                    INSERT INTO custom_user (id, display_name, email, issuer, subject)
                    VALUES (3, 'Different name', 'other@example.invalid', 'issuer', 'first')
                """))
        assert connection.scalar(text("SELECT COUNT(*) FROM custom_user")) == 2
