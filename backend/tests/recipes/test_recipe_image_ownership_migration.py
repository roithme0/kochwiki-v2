from typing import Protocol, cast
from uuid import uuid4

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.schema import CreateSchema

from app.infrastructure.database.session import engine


class Migration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


def test_cleanup_removes_only_unowned_recipe_images_and_preserves_versions() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261024_18")
    assert revision is not None
    migration = cast(Migration, revision.module)
    schema = f"image_ownership_migration_{uuid4().hex}"
    unowned, owned, foodstuff = uuid4(), uuid4(), uuid4()
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(CreateSchema(schema))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            for statement in (
                'CREATE TABLE "user" (id INTEGER PRIMARY KEY)',
                'INSERT INTO "user" VALUES (1)',
                'CREATE TABLE image_asset (id UUID PRIMARY KEY, kind TEXT NOT NULL, uploader_id INTEGER REFERENCES "user"(id))',
                'CREATE TABLE recipe_lineage (id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES "user"(id))',
                'INSERT INTO recipe_lineage VALUES (1, 1)',
                'CREATE TABLE recipe_version (version_id UUID PRIMARY KEY, lineage_id INTEGER REFERENCES recipe_lineage(id), state TEXT, image_id UUID REFERENCES image_asset(id) ON DELETE RESTRICT)',
                'CREATE TABLE foodstuff (id INTEGER PRIMARY KEY, image_id UUID REFERENCES image_asset(id) ON DELETE RESTRICT)',
            ):
                connection.execute(text(statement))
            for image_id, kind, uploader in ((unowned, "recipe", None), (owned, "recipe", 1), (foodstuff, "foodstuff", None)):
                connection.execute(text("INSERT INTO image_asset VALUES (:id, :kind, :uploader)"), {
                    "id": image_id, "kind": kind, "uploader": uploader,
                })
            for image_id in (unowned, owned, None):
                for state in ("active", "draft", "historical"):
                    connection.execute(text("INSERT INTO recipe_version VALUES (:id, 1, :state, :image)"), {
                        "id": uuid4(), "state": state, "image": image_id,
                    })
            connection.execute(text("INSERT INTO foodstuff VALUES (1, :id)"), {"id": foodstuff})
            versions = connection.execute(text("SELECT version_id, state FROM recipe_version ORDER BY version_id")).all()
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert connection.execute(text("SELECT version_id, state FROM recipe_version ORDER BY version_id")).all() == versions
            assert connection.scalar(text("SELECT count(*) FROM recipe_version WHERE image_id IS NULL")) == 6
            assert connection.scalar(text("SELECT count(*) FROM recipe_version WHERE image_id = :id"), {"id": owned}) == 3
            assert set(connection.scalars(text("SELECT id FROM image_asset"))) == {owned, foodstuff}
            assert connection.scalar(text("SELECT image_id FROM foodstuff")) == foodstuff
            assert connection.scalar(text("SELECT owner_id FROM recipe_lineage")) == 1
            assert connection.scalar(text('SELECT count(*) FROM "user"')) == 1
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert set(connection.scalars(text("SELECT id FROM image_asset"))) == {owned, foodstuff}
        finally:
            transaction.rollback()
