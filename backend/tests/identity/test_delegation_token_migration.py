from typing import Protocol, cast
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateSchema

from app.infrastructure.database.session import engine


class Migration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


def test_migration_preserves_sessions_and_enforces_delegation_integrity() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(
        "20261024_19"
    )
    assert revision is not None
    migration = cast(Migration, revision.module)
    schema = f"delegation_migration_{uuid4().hex}"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(CreateSchema(schema))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(
                text("CREATE TABLE application_session (id INTEGER PRIMARY KEY)")
            )
            connection.execute(text("INSERT INTO application_session VALUES (1), (2)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert (
                connection.scalar(text("SELECT count(*) FROM application_session")) == 2
            )
            insert = text("""
                INSERT INTO delegation_token (secret_hash, session_id, audience, created_at, expires_at)
                VALUES (:hash, :session, 'kochwiki:mcp', now(), now() + :seconds * interval '1 second')
            """)
            for session_id in (1, 2):
                connection.execute(
                    insert,
                    {
                        "hash": str(session_id) * 64,
                        "session": session_id,
                        "seconds": 300,
                    },
                )
            for hashed, session_id, seconds in (
                ("1" * 64, 1, 300),
                ("3" * 64, 999, 300),
                ("4" * 64, None, 300),
                ("5" * 64, 1, 0),
                ("6" * 64, 1, -1),
                ("short", 1, 300),
            ):
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(
                        insert,
                        {"hash": hashed, "session": session_id, "seconds": seconds},
                    )
            connection.execute(text("DELETE FROM application_session WHERE id = 1"))
            assert list(
                connection.scalars(text("SELECT session_id FROM delegation_token"))
            ) == [2]
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert (
                connection.scalar(text("SELECT to_regclass('delegation_token')"))
                is None
            )
            assert list(
                connection.scalars(text("SELECT id FROM application_session"))
            ) == [2]
        finally:
            transaction.rollback()
