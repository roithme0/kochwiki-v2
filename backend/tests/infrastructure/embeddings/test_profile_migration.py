from typing import Protocol, cast

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.infrastructure.database.session import engine


class Migration(Protocol):
    def upgrade(self) -> None: ...
    def downgrade(self) -> None: ...


def test_profile_migration_preserves_vectors_and_roundtrips_legacy_models() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261025_20")
    assert revision is not None
    migration = cast(Migration, revision.module)
    tables = ("foodstuff_embedding", "recipe_embedding")
    models = ("text-embedding-3-large", "other-model", "semantic-text-v1", "x" * 100)
    vector = "[1," + ",".join(["0"] * 3071) + "]"
    with engine.begin() as connection:
        for table in tables:
            connection.execute(text(f"""
                CREATE TEMP TABLE {table} (
                    id INTEGER PRIMARY KEY, model VARCHAR(100) NOT NULL,
                    source_text TEXT NOT NULL, vector vector(3072) NOT NULL
                ) ON COMMIT DROP
            """))
            for index, model in enumerate(models):
                connection.execute(text(f"""
                    INSERT INTO pg_temp.{table} VALUES (:id, :model, :source, CAST(:vector AS vector))
                """), {"id": index, "model": model, "source": f"Source {index}", "vector": vector})

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        for table in tables:
            rows = connection.execute(text(
                f"SELECT profile, source_text, vector::text FROM pg_temp.{table} ORDER BY id"
            )).all()
            assert [row.profile for row in rows] == ["semantic-text-v1"] + [
                "legacy-model:" + model for model in models[1:]
            ]
            assert [row.source_text for row in rows] == [f"Source {index}" for index in range(len(models))]
            assert all(row.vector == vector for row in rows)
            assert connection.scalar(text(
                f"SELECT count(*) FROM pg_temp.{table} WHERE profile = 'semantic-text-v1'"
            )) == 1

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        for table in tables:
            rows = connection.execute(text(
                f"SELECT model, source_text, vector::text FROM pg_temp.{table} ORDER BY id"
            )).all()
            assert [row.model for row in rows] == list(models)
            assert [row.source_text for row in rows] == [f"Source {index}" for index in range(len(models))]
            assert all(row.vector == vector for row in rows)
