import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://test:test@localhost:5433/kochwiki_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from app.db.session import engine
from app.main import create_app


@pytest.fixture(scope="session", autouse=True)
def migrate_database() -> None:
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clear_database() -> None:
    with engine.begin() as connection:
        connection.execute(
            text('TRUNCATE TABLE ingredient, step, recipe_version, recipe_lineage, foodstuff, custom_user RESTART IDENTITY CASCADE')
        )


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client
