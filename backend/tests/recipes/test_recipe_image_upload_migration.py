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


def test_upload_migration_preserves_assets_and_requires_valid_upload_owners() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261024_16")
    assert revision is not None
    migration = cast(Migration, revision.module)
    schema = f"upload_migration_{uuid4().hex}"
    image_id, upload_id = uuid4(), uuid4()
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(CreateSchema(schema))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(text("CREATE TABLE custom_user (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE image_asset (id UUID PRIMARY KEY, kind TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO custom_user VALUES (1)"))
            connection.execute(text("INSERT INTO image_asset VALUES (:id, 'recipe')"), {"id": image_id})
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert connection.scalar(text("SELECT uploader_id IS NULL FROM image_asset WHERE id = :id"), {"id": image_id})
            for owner in (None, 999):
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(text("INSERT INTO recipe_image_upload VALUES (:id, :owner, now())"), {"id": upload_id, "owner": owner})
            connection.execute(text("INSERT INTO recipe_image_upload VALUES (:id, 1, now())"), {"id": upload_id})
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("UPDATE image_asset SET uploader_id = 999"))
            connection.execute(text("UPDATE image_asset SET uploader_id = 1"))
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("DELETE FROM custom_user WHERE id = 1"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert connection.scalar(text("SELECT kind FROM image_asset WHERE id = :id"), {"id": image_id}) == "recipe"
            assert connection.scalar(text("SELECT count(*) FROM custom_user")) == 1
        finally:
            transaction.rollback()
