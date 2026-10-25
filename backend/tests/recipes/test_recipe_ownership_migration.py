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


def test_ownership_migration_clears_only_unowned_recipe_data_and_requires_valid_owner() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261023_15")
    assert revision is not None
    migration = cast(Migration, revision.module)
    lineage_id = uuid4()
    with engine.begin() as connection:
        for statement in (
            "CREATE TEMP TABLE custom_user (id INTEGER PRIMARY KEY) ON COMMIT DROP",
            "CREATE TEMP TABLE application_session (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES custom_user(id)) ON COMMIT DROP",
            "CREATE TEMP TABLE foodstuff (id INTEGER PRIMARY KEY) ON COMMIT DROP",
            "CREATE TEMP TABLE image_asset (id INTEGER PRIMARY KEY) ON COMMIT DROP",
            "CREATE TEMP TABLE recipe_lineage (id UUID PRIMARY KEY) ON COMMIT DROP",
            "CREATE TEMP TABLE recipe_version (version_id UUID PRIMARY KEY, lineage_id UUID REFERENCES recipe_lineage(id) ON DELETE CASCADE, state TEXT, image_id INTEGER REFERENCES image_asset(id)) ON COMMIT DROP",
            "CREATE TEMP TABLE ingredient (id INTEGER PRIMARY KEY, recipe_version_id UUID REFERENCES recipe_version(version_id) ON DELETE CASCADE, foodstuff_id INTEGER REFERENCES foodstuff(id)) ON COMMIT DROP",
            "CREATE TEMP TABLE step (id INTEGER PRIMARY KEY, recipe_version_id UUID REFERENCES recipe_version(version_id) ON DELETE CASCADE) ON COMMIT DROP",
            "CREATE TEMP TABLE recipe_embedding (recipe_version_id UUID PRIMARY KEY REFERENCES recipe_version(version_id) ON DELETE CASCADE) ON COMMIT DROP",
            "INSERT INTO custom_user VALUES (1)",
            "INSERT INTO application_session VALUES (1, 1)",
            "INSERT INTO foodstuff VALUES (1)",
            "INSERT INTO image_asset VALUES (1)",
        ):
            connection.execute(text(statement))
        connection.execute(text("INSERT INTO recipe_lineage VALUES (:id)"), {"id": lineage_id})
        for index, state in enumerate(("active", "draft", "historical"), start=1):
            version_id = uuid4()
            connection.execute(text("INSERT INTO recipe_version VALUES (:id, :lineage, :state, 1)"), {
                "id": version_id, "lineage": lineage_id, "state": state,
            })
            connection.execute(text("INSERT INTO ingredient VALUES (:index, :version, 1)"), {"index": index, "version": version_id})
            connection.execute(text("INSERT INTO step VALUES (:index, :version)"), {"index": index, "version": version_id})
            connection.execute(text("INSERT INTO recipe_embedding VALUES (:version)"), {"version": version_id})
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        for table in ("recipe_lineage", "recipe_version", "ingredient", "step", "recipe_embedding"):
            assert connection.scalar(text(f"SELECT count(*) FROM pg_temp.{table}")) == 0
        for table in ("custom_user", "application_session", "foodstuff", "image_asset"):
            assert connection.scalar(text(f"SELECT count(*) FROM pg_temp.{table}")) == 1
        for owner in (None, 999):
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text("INSERT INTO recipe_lineage VALUES (:id, :owner)"), {"id": uuid4(), "owner": owner})
        connection.execute(text("INSERT INTO recipe_lineage VALUES (:id, 1)"), {"id": lineage_id})
        connection.execute(text("DELETE FROM application_session"))
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("DELETE FROM custom_user WHERE id = 1"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.scalar(text("SELECT count(*) FROM recipe_lineage")) == 1
        assert connection.scalar(text("SELECT count(*) FROM recipe_version")) == 0
