import os
from collections.abc import Callable
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://test:test@localhost:5433/kochwiki_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["OPENAI_API_KEY"] = ""
for variable in ("OIDC_ISSUER", "OIDC_CLIENT_SECRET", "OIDC_CALLBACK_URL", "OIDC_BACKCHANNEL_URL"):
    os.environ[variable] = ""
os.environ["OIDC_CLIENT_ID"] = "kochwiki"

from app.infrastructure.database.session import SessionLocal, engine
from app.main import create_app
from app.identity.schemas.user import UserOut
from app.identity.schemas.oidc import Identity
from app.identity.services.users import map_identity


@pytest.fixture(scope="session", autouse=True)
def migrate_database() -> None:
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clear_database() -> None:
    with engine.begin() as connection:
        connection.execute(
            text('TRUNCATE TABLE image_asset, login_transaction, ingredient, step, recipe_version, recipe_lineage, foodstuff, custom_user RESTART IDENTITY CASCADE')
        )


@pytest.fixture
def provider_user() -> Callable[[str], UserOut]:
    def create(display_name: str) -> UserOut:
        subject = str(uuid4())
        identity = Identity(
            iss="http://localhost:8006/realms/services", sub=subject,
            email=f"{subject}@example.invalid", email_verified=False,
            displayName=display_name, nonce="test-fixture",
        )
        with SessionLocal.begin() as session:
            return UserOut.model_validate(map_identity(session, identity))

    return create


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client
