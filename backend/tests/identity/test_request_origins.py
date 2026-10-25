from collections.abc import Iterator
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.config import Settings
from app.foodstuffs.routes.images import get_foodstuff_image_storage
from app.identity import dependencies
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.images.models import ImageAsset
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.storage.storage import Storage
from app.recipes.models.image_upload import RecipeImageUpload
from app.recipes.models.recipe import RecipeLineage, RecipeVersion
from app.recipes.routes.images import get_recipe_image_storage
from tests.recipes.test_recipe_proposal_http import prepare


@pytest.mark.parametrize("origin", [
    "http://localhost:4202/", "http://localhost:4202/path", "null",
    "https://*.example.com", "https://name:password@example.com",
    "https://example.com?", "https://example.com#", "http://localhost:bad",
])
def test_invalid_additional_origin_configuration(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, csrf_trusted_origins=origin)


@pytest.mark.parametrize(("origin", "expected_status"), [
    ("http://localhost:8000", 201),
    ("http://localhost:4202", 201),
    ("https://preview.example:443", 201),
    ("http://localhost:4203", 403),
    ("https://attacker.invalid", 403),
    ("http://localhost:4202/", 403),
    (None, 403),
])
def test_additional_origins_keep_callback_trusted_and_reject_other_requests(
    client: TestClient, recipe_session: UserOut, monkeypatch: pytest.MonkeyPatch,
    origin: str | None, expected_status: int,
) -> None:
    configured = Settings(
        _env_file=None,
        csrf_trusted_origins=" http://localhost:4202, https://preview.example ",
    )
    settings = dependencies.get_settings().model_copy(update={
        "csrf_trusted_origins": configured.csrf_trusted_origins,
    })
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    client.headers.pop("Origin")
    response = client.post(
        "/recipes", json={"name": "Recipe", "servings": 1},
        headers={"Origin": origin} if origin else {},
    )
    assert response.status_code == expected_status


def test_logout_accepts_additional_frontend_origin(
    client: TestClient, recipe_session: UserOut, monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = dependencies.get_settings().model_copy(update={
        "csrf_trusted_origins": "http://localhost:4202",
    })
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    assert client.post("/auth/logout", headers={"Origin": "http://localhost:4202"}).status_code == 204
    assert client.get("/recipes").status_code == 401


@pytest.mark.parametrize("origin", [
    None, "null", "https://attacker.invalid", "http://localhost:8006",
    "https://localhost:8000", "http://localhost:8000/", "http://localhost:8000/path",
    "http://localhost:8000?query", "http://localhost:8000#fragment",
    "http://localhost:8000?", "http://localhost:8000#",
    "http://@localhost:8000", "http://name:password@localhost:8000",
    "http://localhost:bad", "http://localhost:65536", "http://[localhost:8000",
    " http://localhost:8000", "http://localhost:8000\t", "http://localhost:8000\n",
    "http://localhost:8000, http://localhost:8000",
])
def test_untrusted_origin_cannot_create_or_renew_session(
    client: TestClient, recipe_session: UserOut, origin: str | None,
) -> None:
    client.headers.pop("Origin")
    with SessionLocal() as session:
        previous = session.scalars(select(ApplicationSession)).one().last_activity_at
    response = client.post("/recipes", json={"name": "Rejected", "servings": 1},
        headers={"Origin": origin} if origin is not None else {})
    assert response.status_code == 403
    assert response.json() == {"detail": "Untrusted request origin."}
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in response.headers
    with SessionLocal() as session:
        assert session.scalars(select(ApplicationSession)).one().last_activity_at == previous
        assert session.scalar(select(func.count()).select_from(RecipeLineage)) == 0
    assert client.get("/recipes").status_code == 200
    assert client.get("/recipes", headers={"Origin": "https://attacker.invalid"}).status_code == 200


def test_duplicate_origins_are_rejected(client: TestClient, recipe_session: UserOut) -> None:
    client.headers.pop("Origin")
    response = client.post("/recipes", json={"name": "Rejected", "servings": 1},
        headers=[("Origin", "http://localhost:8000"), ("Origin", "http://localhost:8000")])
    assert response.status_code == 403
    assert client.get("/recipes").json() == []


@pytest.mark.parametrize(("callback", "origin"), [
    ("http://localhost:8000/api/auth/callback", "http://LOCALHOST:8000"),
    ("http://localhost/api/auth/callback", "http://localhost:80"),
    ("http://localhost:80/api/auth/callback", "http://localhost"),
    ("https://cook.example/api/auth/callback", "https://cook.example:443"),
    ("https://cook.example:443/api/auth/callback", "https://cook.example"),
    ("https://[::1]/api/auth/callback", "https://[::1]:443"),
])
def test_origin_matches_configured_public_origin(
    client: TestClient, recipe_session: UserOut, monkeypatch: pytest.MonkeyPatch,
    callback: str, origin: str,
) -> None:
    settings = dependencies.get_settings().model_copy(update={"oidc_callback_url": callback})
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    response = client.post("/recipes", json={"name": "Accepted", "servings": 1}, headers={"Origin": origin})
    assert response.status_code == 201
    assert response.json()["ownerId"] == recipe_session.id
    assert "set-cookie" in response.headers


@pytest.fixture
def storage(client: TestClient) -> Iterator[Mock]:
    adapter = Mock(spec=Storage)

    def dependency() -> Storage:
        return adapter

    for dependency_key in (get_recipe_image_storage, get_foodstuff_image_storage):
        client.app.dependency_overrides[dependency_key] = dependency
    try:
        yield adapter
    finally:
        for dependency_key in (get_recipe_image_storage, get_foodstuff_image_storage):
            client.app.dependency_overrides.pop(dependency_key)


@pytest.mark.parametrize(("method", "path"), [
    ("POST", "/recipes"), ("POST", "/recipes/{lineage}/publish"),
    ("POST", "/recipes/{lineage}/drafts"), ("PUT", "/recipes/{lineage}/drafts/{draft}"),
    ("POST", "/recipes/{lineage}/drafts/{draft}/publish"),
    ("DELETE", "/recipes/{lineage}/drafts/{draft}"), ("DELETE", "/recipes/{lineage}"),
    ("POST", "/recipe-presentations/resolve"), ("POST", "/recipe-proposals/{proposal}/save"),
    ("POST", "/foodstuffs"), ("PATCH", "/foodstuffs/{foodstuff}"), ("DELETE", "/foodstuffs/{foodstuff}"),
    ("POST", "/recipe-image-uploads"), ("POST", "/recipe-image-uploads/{upload}/complete"),
    ("POST", "/foodstuff-image-uploads"), ("POST", "/foodstuff-image-uploads/{upload}/complete"),
])
@pytest.mark.parametrize("origin", [None, "https://attacker.invalid"])
def test_rejection_precedes_domain_and_storage_operations(
    client: TestClient, recipe_session: UserOut, storage: Mock, method: str, path: str, origin: str | None,
) -> None:
    proposal = prepare(client)
    original = client.get("/recipes").json()[0]
    lineage = original["recipeLineageId"]
    draft = client.post(f"/recipes/{lineage}/drafts", json={"name": "Draft", "servings": 1}).json()
    foodstuff = client.post("/foodstuffs", json={"name": "Original", "unit": "G"}).json()
    recipes_before = client.get("/recipes").json()
    foodstuffs_before = client.get("/foodstuffs").json()
    client.headers.pop("Origin")
    payload: dict[str, object]
    if path == "/recipe-presentations/resolve":
        payload = {"servings": 1, "ingredients": [], "steps": []}
    elif "foodstuffs" in path:
        payload = {"name": "Rejected", "unit": "G"}
    else:
        payload = {"name": "Rejected", "servings": 1}
    response = client.request(method, path.format(lineage=lineage, draft=draft["recipeVersionId"],
        foodstuff=foodstuff["id"], proposal=proposal.proposalId, upload=uuid4()),
        json=payload, headers={"Origin": origin} if origin is not None else {})
    assert response.status_code == 403
    assert response.json() == {"detail": "Untrusted request origin."}
    assert "set-cookie" not in response.headers
    assert storage.mock_calls == []
    assert client.get("/recipes").json() == recipes_before
    assert client.get("/foodstuffs").json() == foodstuffs_before
    assert client.get(f"/recipes/{lineage}/history").json() == []
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(RecipeVersion)) == 2
        assert session.scalar(select(func.count()).select_from(RecipeImageUpload)) == 0
        assert session.scalar(select(func.count()).select_from(ImageAsset)) == 0
