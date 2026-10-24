import json
from collections.abc import Callable
from uuid import uuid4
from urllib.parse import quote

import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.conversations import routes, service
from app.core.config import Settings
from app.identity.config import SESSION_COOKIE
from app.identity.schemas.user import UserOut
from app.identity.models.user import User
from app.identity.services.sessions import invalidate_session
from app.infrastructure.database.session import SessionLocal
from app.recipes.schemas.recipe import RecipeVersionOut


CREATED = {"session_id": "private-conversation", "expires_at": "2026-10-25T12:00:00Z"}
CAPABILITIES = [{"type": "json", "description": "Show JSON", "payloadSchema": {"type": "object"}}]


@pytest.fixture
def source(authenticated_client: TestClient) -> RecipeVersionOut:
    food = authenticated_client.post("/foodstuffs", json={"name": "Oats", "unit": "G"})
    response = authenticated_client.post("/recipes", json={
        "name": "Authoritative recipe", "servings": 2,
        "ingredients": [{"index": 1, "amount": 100, "foodstuffId": food.json()["id"]}],
        "steps": [{"index": 1, "description": "Mix oats"}],
    })
    assert response.status_code == 201
    return RecipeVersionOut.model_validate(response.json())


@pytest.fixture
def upstream(monkeypatch: pytest.MonkeyPatch) -> list[httpx2.Request]:
    monkeypatch.setattr(routes, "get_settings", lambda: Settings(_env_file=None, ai_gateway_url="https://ai.example"))
    requests: list[httpx2.Request] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(201, json={**CREATED, "expires_at": "2026-10-25T14:00:00+02:00"})

    def client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.Client:
        return httpx2.Client(transport=httpx2.MockTransport(handle), timeout=timeout,
                            follow_redirects=follow_redirects, trust_env=trust_env)

    monkeypatch.setattr(service, "Client", client)
    return requests


def test_creation_uses_session_identity_and_authoritative_context(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request], recipe_session: UserOut,
) -> None:
    response = client.post("/recipe-conversations", json={
        "sourceRecipeVersionId": str(source.recipeVersionId), "artifact_capabilities": CAPABILITIES,
    }, headers={"X-Application-User": "kochwiki:999999", "Authorization": "Bearer browser-secret"})
    assert response.status_code == 201
    assert response.json() == CREATED
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" in response.headers
    assert len(upstream) == 1
    request = upstream[0]
    assert str(request.url) == "https://ai.example/api/v1/agents/kochwiki/sessions"
    assert request.headers["X-Application-User"] == ":".join(
        quote(value, safe="~()*!.'") for value in (recipe_session.issuer, recipe_session.subject)
    )
    assert "cookie" not in request.headers
    assert "authorization" not in request.headers
    assert "origin" not in request.headers
    assert json.loads(request.content) == {
        "initial_context": {"source": source.model_dump(mode="json")},
        "artifact_capabilities": CAPABILITIES,
    }


@pytest.mark.parametrize("credential", ["missing", "revoked"])
def test_invalid_session_cannot_create(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request], credential: str,
) -> None:
    if credential == "missing":
        client.cookies.clear()
    else:
        secret = client.cookies.get(SESSION_COOKIE, path="/")
        assert secret is not None
        with SessionLocal.begin() as session:
            invalidate_session(session, secret)
    response = client.post("/recipe-conversations", json={"sourceRecipeVersionId": str(source.recipeVersionId)},
                           headers={"X-Application-User": f"kochwiki:{source.ownerId}"})
    assert response.status_code == 401
    assert upstream == []


def test_forwarded_identity_matches_browser_encoding(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request],
) -> None:
    with SessionLocal.begin() as session:
        user = session.get(User, source.ownerId)
        assert user is not None
        user.issuer = "https://idp.example/realms/cooks"
        user.subject = "cook:ä !'()*"
    response = client.post("/recipe-conversations", json={
        "sourceRecipeVersionId": str(source.recipeVersionId),
    })
    assert response.status_code == 201
    assert upstream[0].headers["X-Application-User"] == "https%3A%2F%2Fidp.example%2Frealms%2Fcooks:cook%3A%C3%A4%20!'()*"


def test_foreign_recipe_cannot_create_even_with_spoofed_identity(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request],
    sign_in: Callable[[TestClient], UserOut],
) -> None:
    sign_in(client)
    response = client.post("/recipe-conversations", json={"sourceRecipeVersionId": str(source.recipeVersionId)},
                           headers={"X-Application-User": f"kochwiki:{source.ownerId}"})
    assert response.status_code == 403
    assert upstream == []


@pytest.mark.parametrize("origin", [None, "https://attacker.example"])
def test_untrusted_origin_cannot_create(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request], origin: str | None,
) -> None:
    client.headers.pop("origin")
    response = client.post("/recipe-conversations", json={"sourceRecipeVersionId": str(source.recipeVersionId)},
                           headers={} if origin is None else {"Origin": origin})
    assert response.status_code == 403
    assert upstream == []


def test_missing_recipe_and_supplied_context_are_not_forwarded(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request],
) -> None:
    assert client.post("/recipe-conversations", json={"sourceRecipeVersionId": str(uuid4())}).status_code == 404
    assert client.post("/recipe-conversations", json={
        "sourceRecipeVersionId": str(source.recipeVersionId), "initial_context": {"source": "forged"},
    }).status_code == 422
    assert upstream == []


@pytest.mark.parametrize("failure", ["disabled", "unavailable", "timeout", "network", "redirect", "rejected", "malformed", "wrong-shape"])
def test_upstream_failures_are_sanitized_and_not_retried(
    client: TestClient, source: RecipeVersionOut, upstream: list[httpx2.Request],
    monkeypatch: pytest.MonkeyPatch, failure: str,
) -> None:
    attempts: list[httpx2.Request] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        attempts.append(request)
        if failure == "timeout":
            raise httpx2.ReadTimeout("sensitive upstream detail", request=request)
        if failure == "network":
            raise httpx2.ConnectError("sensitive upstream detail", request=request)
        if failure == "malformed":
            return httpx2.Response(201, content=b"sensitive upstream detail")
        if failure == "wrong-shape":
            return httpx2.Response(201, json={"session_id": "sensitive upstream detail"})
        return httpx2.Response({"unavailable": 503, "redirect": 307, "rejected": 422}[failure],
                              headers={"Location": "https://other.example"}, json={"detail": "sensitive upstream detail"})

    def http_client(*, timeout: float, follow_redirects: bool, trust_env: bool) -> httpx2.Client:
        return httpx2.Client(transport=httpx2.MockTransport(handle), timeout=timeout,
                            follow_redirects=follow_redirects, trust_env=trust_env)

    monkeypatch.setattr(service, "Client", http_client)
    if failure == "disabled":
        monkeypatch.setattr(routes, "get_settings", lambda: Settings(_env_file=None))
    response = client.post("/recipe-conversations", json={"sourceRecipeVersionId": str(source.recipeVersionId)})
    assert response.status_code == {"disabled": 503, "unavailable": 503, "timeout": 504}.get(failure, 502)
    assert "sensitive upstream detail" not in response.text
    assert len(attempts) == (0 if failure == "disabled" else 1)


@pytest.mark.parametrize("url", ["https://ai.example/path", "https://user:password@ai.example", "https://ai.example?", "ftp://ai.example", "https://ai.example:bad"])
def test_upstream_url_requires_an_http_origin(url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_gateway_url=url)
