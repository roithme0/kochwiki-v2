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


def test_user_rename_preserves_identity_sequence_and_references() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261024_17")
    assert revision is not None
    migration = cast(Migration, revision.module)
    schema = f"user_naming_{uuid4().hex}"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(CreateSchema(schema))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(text("""
                CREATE TABLE custom_user (
                    id SERIAL PRIMARY KEY, display_name TEXT NOT NULL, email TEXT NOT NULL,
                    issuer TEXT NOT NULL, subject TEXT NOT NULL,
                    CONSTRAINT uq_custom_user_identity UNIQUE (issuer, subject)
                )
            """))
            connection.execute(text("""
                INSERT INTO custom_user (display_name, email, issuer, subject)
                VALUES ('Cook', 'cook@example.invalid', 'issuer', 'subject')
            """))
            for table, column, action in (
                ("application_session", "user_id", "CASCADE"),
                ("recipe_lineage", "owner_id", "RESTRICT"),
                ("image_asset", "uploader_id", "RESTRICT"),
                ("recipe_image_upload", "uploader_id", "RESTRICT"),
            ):
                connection.execute(text(f"CREATE TABLE {table} ({column} INTEGER REFERENCES custom_user(id) ON DELETE {action})"))
                connection.execute(text(f"INSERT INTO {table} VALUES (1)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert connection.scalar(text("SELECT to_regclass('custom_user')")) is None
            assert connection.scalar(text('SELECT display_name FROM "user" WHERE id = 1')) == "Cook"
            for table, column in (
                ("application_session", "user_id"), ("recipe_lineage", "owner_id"),
                ("image_asset", "uploader_id"), ("recipe_image_upload", "uploader_id"),
            ):
                assert connection.scalar(text(f'SELECT count(*) FROM {table} JOIN "user" ON {table}.{column} = "user".id')) == 1
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(text(f"INSERT INTO {table} VALUES (999)"))
            assert connection.scalar(text("""
                INSERT INTO "user" (display_name, email, issuer, subject)
                VALUES ('Updated Cook', 'cook@example.invalid', 'issuer', 'subject')
                ON CONFLICT ON CONSTRAINT uq_user_identity DO UPDATE SET display_name = excluded.display_name
                RETURNING id
            """)) == 1
            assert connection.scalar(text("""
                INSERT INTO "user" (display_name, email, issuer, subject)
                VALUES ('Second Cook', 'second@example.invalid', 'issuer', 'second') RETURNING id
            """)) == 3
            assert connection.scalar(text("SELECT to_regclass('user_id_seq')")) is not None
            assert connection.scalar(text("SELECT to_regclass('custom_user_id_seq')")) is None
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text('DELETE FROM "user" WHERE id = 1'))
            connection.execute(text("INSERT INTO application_session VALUES (3)"))
            connection.execute(text('DELETE FROM "user" WHERE id = 3'))
            assert connection.scalar(text("SELECT count(*) FROM application_session")) == 1
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert connection.scalar(text("SELECT display_name FROM custom_user WHERE id = 1")) == "Updated Cook"
            assert connection.scalar(text("SELECT count(*) FROM custom_user")) == 1
            assert connection.scalar(text("SELECT to_regclass('custom_user_id_seq')")) is not None
        finally:
            transaction.rollback()
