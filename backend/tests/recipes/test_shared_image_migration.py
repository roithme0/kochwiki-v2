from datetime import datetime, timezone
from typing import Protocol, cast
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.database.session import engine


class Migration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


@pytest.fixture
def shared_image_migration() -> Migration:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261017_13")
    assert revision is not None
    return cast(Migration, revision.module)


def test_existing_image_and_recipe_reference_survive_upgrade_and_downgrade(shared_image_migration: Migration) -> None:
    image_id, version_id = uuid4(), uuid4()
    created_at = datetime.now(timezone.utc)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TEMP TABLE recipe_image (
                id UUID PRIMARY KEY, object_key VARCHAR(1024) NOT NULL UNIQUE,
                content_type VARCHAR(32) NOT NULL, size INTEGER NOT NULL,
                width INTEGER NOT NULL, height INTEGER NOT NULL,
                sha256 VARCHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                CONSTRAINT ck_recipe_image_size CHECK (size BETWEEN 1 AND 10485760),
                CONSTRAINT ck_recipe_image_width CHECK (width BETWEEN 1 AND 4096),
                CONSTRAINT ck_recipe_image_height CHECK (height BETWEEN 1 AND 4096),
                CONSTRAINT ck_recipe_image_content_type CHECK (content_type = 'image/png'),
                CONSTRAINT ck_recipe_image_sha256 CHECK (length(sha256) = 64)
            ) ON COMMIT DROP
        """))
        connection.execute(text("""
            CREATE TEMP TABLE recipe_version (
                version_id UUID PRIMARY KEY,
                image_id UUID REFERENCES recipe_image(id) ON DELETE RESTRICT
            ) ON COMMIT DROP
        """))
        connection.execute(text("""
            INSERT INTO recipe_image VALUES
            (:id, 'recipe-images/original.png', 'image/png', 100, 800, 600, :sha, :created)
        """), {"id": image_id, "sha": "a" * 64, "created": created_at})
        connection.execute(text("INSERT INTO recipe_version VALUES (:version, :image)"), {
            "version": version_id, "image": image_id,
        })
        original = connection.execute(text("SELECT * FROM recipe_image")).one()
        with Operations.context(MigrationContext.configure(connection)):
            shared_image_migration.upgrade()
        migrated = connection.execute(text("""
            SELECT id, object_key, content_type, size, width, height, sha256, created_at
            FROM pg_temp.image_asset
        """)).one()
        assert migrated == original
        assert connection.scalar(text("SELECT kind FROM pg_temp.image_asset")) == "recipe"
        assert connection.execute(text("""
            SELECT v.version_id, i.id FROM pg_temp.recipe_version v
            JOIN pg_temp.image_asset i ON v.image_id = i.id
        """)).one() == (version_id, image_id)
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("DELETE FROM pg_temp.image_asset"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE pg_temp.image_asset SET kind = 'invalid'"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE pg_temp.image_asset SET kind = NULL"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("""
                INSERT INTO pg_temp.image_asset SELECT :id, object_key, content_type, size,
                    width, height, sha256, created_at, kind FROM pg_temp.image_asset
            """), {"id": uuid4()})
        foodstuff_id = uuid4()
        connection.execute(text("""
            INSERT INTO pg_temp.image_asset SELECT :id, object_key, content_type, size,
                width, height, sha256, created_at, 'foodstuff' FROM pg_temp.image_asset
        """), {"id": foodstuff_id})
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match="non-recipe images exist"):
                shared_image_migration.downgrade()
        connection.execute(text("DELETE FROM pg_temp.image_asset WHERE id = :id"), {"id": foodstuff_id})
        with Operations.context(MigrationContext.configure(connection)):
            shared_image_migration.downgrade()
        assert connection.execute(text("SELECT * FROM pg_temp.recipe_image")).one() == original
        assert connection.execute(text("SELECT * FROM pg_temp.recipe_version")).one() == (version_id, image_id)
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("DELETE FROM pg_temp.recipe_image"))
