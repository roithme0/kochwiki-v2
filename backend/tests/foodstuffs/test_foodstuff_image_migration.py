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


def test_existing_foodstuff_survives_nullable_image_migration() -> None:
    revision = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("20261017_14")
    assert revision is not None
    migration = cast(Migration, revision.module)
    image_id = uuid4()
    with engine.begin() as connection:
        connection.execute(text("CREATE TEMP TABLE image_asset (id UUID PRIMARY KEY) ON COMMIT DROP"))
        connection.execute(text("CREATE TEMP TABLE foodstuff (id INTEGER PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP"))
        connection.execute(text("INSERT INTO pg_temp.foodstuff VALUES (1, 'Existing')"))
        connection.execute(text("INSERT INTO pg_temp.image_asset VALUES (:id)"), {"id": image_id})
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(text("SELECT * FROM pg_temp.foodstuff")).one() == (1, "Existing", None)
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE pg_temp.foodstuff SET image_id = :id"), {"id": uuid4()})
        connection.execute(text("UPDATE pg_temp.foodstuff SET image_id = :id"), {"id": image_id})
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("DELETE FROM pg_temp.image_asset"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(text("SELECT * FROM pg_temp.foodstuff")).one() == (1, "Existing")
        assert connection.scalar(text("SELECT id FROM pg_temp.image_asset")) == image_id
