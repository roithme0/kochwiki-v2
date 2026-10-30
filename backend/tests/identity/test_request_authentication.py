from collections.abc import Callable
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.identity import dependencies
from app.identity.models.user import User
from app.identity.schemas.user import UserOut
from app.infrastructure.database import session as database


def test_authentication_releases_connection_before_endpoint(
    client: TestClient,
    sign_in: Callable[[TestClient], UserOut],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = sign_in(client)
    engine = create_engine(
        database.engine.url, pool_size=1, max_overflow=0, pool_timeout=0.1
    )
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(database, "SessionLocal", sessions)
    monkeypatch.setattr(dependencies, "SessionLocal", sessions)
    app = FastAPI()

    @app.get("/protected")
    def protected(
        user: Annotated[User, Depends(dependencies.require_current_user)],
    ) -> dict[str, str]:
        with sessions() as session:
            name = session.scalar(select(User.display_name).where(User.id == user.id))
        assert name is not None
        return {"name": name, "authenticated_name": user.display_name}

    try:
        with TestClient(app, cookies=client.cookies) as browser:
            response = browser.get("/protected")
        assert response.status_code == 200
        assert response.json() == {
            "name": expected.display_name,
            "authenticated_name": expected.display_name,
        }
        assert "HttpOnly" in response.headers["set-cookie"]
    finally:
        engine.dispose()
