import secrets
from collections.abc import Callable
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import invalidate_session, secret_hash
from app.infrastructure.database.session import SessionLocal
from app.recipes.models.recipe import RecipeLineage, RecipeVersion
from app.recipes.services.recipes import get_recipe_lineage

PAYLOAD = {"name": "Owned recipe", "servings": 2}


def test_creation_assigns_authenticated_creator(
    client: TestClient, sign_in: Callable[[TestClient], UserOut],
) -> None:
    first = sign_in(client)
    original = client.post("/recipes", json=PAYLOAD)
    assert original.status_code == 201
    assert original.json()["ownerId"] == first.id
    assert original.headers["cache-control"] == "no-store"
    assert "HttpOnly" in original.headers["set-cookie"]
    second = sign_in(client)
    other = client.post("/recipes", json=PAYLOAD)
    assert other.status_code == 201
    assert other.json()["ownerId"] == second.id != first.id
    with SessionLocal() as session:
        for body in (original.json(), other.json()):
            lineage = session.get(RecipeLineage, UUID(body["recipeLineageId"]))
            assert lineage is not None and lineage.owner_id == body["ownerId"]


@pytest.mark.parametrize("credential", ["missing", "malformed", "unknown", "expired", "revoked", "stored-hash"])
def test_creation_rejects_invalid_sessions_without_creating_records(
    client: TestClient, sign_in: Callable[[TestClient], UserOut], credential: str,
) -> None:
    sign_in(client)
    secret = client.cookies.get(SESSION_COOKIE)
    assert secret is not None
    if credential == "expired":
        with SessionLocal.begin() as session:
            session.execute(update(ApplicationSession).values(
                last_activity_at=func.statement_timestamp() - SESSION_LIFETIME,
            ))
    elif credential == "revoked":
        with SessionLocal.begin() as session:
            assert invalidate_session(session, secret)
    client.cookies.clear()
    supplied = {
        "missing": None, "malformed": "invalid", "unknown": secrets.token_urlsafe(32),
        "expired": secret, "revoked": secret, "stored-hash": secret_hash(secret),
    }[credential]
    if supplied is not None:
        client.cookies.set(SESSION_COOKIE, supplied)
    response = client.post("/recipes", json=PAYLOAD)
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}
    assert "Max-Age=0" in response.headers["set-cookie"]
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(RecipeLineage)) == 0
        assert session.scalar(select(func.count()).select_from(RecipeVersion)) == 0


def test_creation_fails_when_login_is_not_configured(client: TestClient) -> None:
    assert client.post("/recipes", json=PAYLOAD).status_code == 503
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(RecipeLineage)) == 0


@pytest.mark.parametrize("field", ["ownerId", "owner_id"])
def test_creator_cannot_be_supplied_in_recipe_content(authenticated_client: TestClient, field: str) -> None:
    response = authenticated_client.post("/recipes", json={**PAYLOAD, field: 999})
    assert response.status_code == 422
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(RecipeLineage)) == 0


def test_all_versions_retain_lineage_owner(
    client: TestClient, sign_in: Callable[[TestClient], UserOut],
) -> None:
    owner = sign_in(client)
    original = client.post("/recipes", json=PAYLOAD).json()
    path = f"/recipes/{original['recipeLineageId']}"
    sign_in(client)
    draft = client.post(f"{path}/drafts", json={**PAYLOAD, "name": "Draft"}).json()
    edited = client.put(
        f"{path}/drafts/{draft['recipeVersionId']}", json={**PAYLOAD, "name": "Edited"},
    ).json()
    published = client.post(f"{path}/drafts/{draft['recipeVersionId']}/publish").json()
    active_edit = client.post(f"{path}/publish", json=PAYLOAD).json()
    bodies = [original, draft, edited, published, active_edit, client.get(path).json()]
    bodies.extend(client.get(f"{path}/history").json())
    bodies.extend(client.get("/recipes").json())
    assert all(body["ownerId"] == owner.id for body in bodies)
    with SessionLocal() as session:
        lineage = get_recipe_lineage(session, UUID(original["recipeVersionId"]))
        assert lineage.ownerId == owner.id
        assert len(lineage.versions) == 3
        assert all(version.ownerId == owner.id for version in lineage.versions)
