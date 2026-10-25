import secrets
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.foodstuffs.schemas.foodstuff import FoodstuffOut
from app.foodstuffs.services.foodstuffs import foodstuff_out, list_foodstuffs
from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import invalidate_session, secret_hash
from app.infrastructure.database.session import SessionLocal

OPERATIONS: list[tuple[str, str, int]] = [
    ("GET", "/foodstuffs", 200),
    ("GET", "/foodstuffs/{foodstuff_id}", 200),
    ("POST", "/foodstuffs", 201),
    ("PATCH", "/foodstuffs/{foodstuff_id}", 200),
    ("DELETE", "/foodstuffs/{foodstuff_id}", 204),
]


def payload_for(method: str) -> dict[str, object] | None:
    if method == "POST":
        return {"name": "New foodstuff", "unit": "G"}
    if method == "PATCH":
        return {"name": "Updated foodstuff", "kcal": 123}
    return None


@pytest.fixture
def shared_foodstuff(authenticated_client: TestClient) -> FoodstuffOut:
    response = authenticated_client.post(
        "/foodstuffs", json={"name": "Oats", "brand": "Mill", "unit": "G"}
    )
    assert response.status_code == 201
    return FoodstuffOut.model_validate(response.json())


@pytest.mark.parametrize(("method", "path", "status"), OPERATIONS)
@pytest.mark.parametrize(
    "credential",
    ["missing", "malformed", "unknown", "expired", "revoked", "stored-hash"],
)
def test_invalid_sessions_cannot_access_or_mutate_foodstuffs(
    client: TestClient,
    shared_foodstuff: FoodstuffOut,
    recipe_session: UserOut,
    method: str,
    path: str,
    status: int,
    credential: str,
) -> None:
    secret = client.cookies.get(SESSION_COOKIE, path="/")
    assert secret is not None
    if credential == "expired":
        with SessionLocal.begin() as session:
            session.execute(
                update(ApplicationSession).values(
                    last_activity_at=func.statement_timestamp() - SESSION_LIFETIME,
                )
            )
    elif credential == "revoked":
        with SessionLocal.begin() as session:
            assert invalidate_session(session, secret)
    supplied = {
        "missing": None,
        "malformed": "invalid",
        "unknown": secrets.token_urlsafe(32),
        "expired": secret,
        "revoked": secret,
        "stored-hash": secret_hash(secret),
    }[credential]
    client.cookies.clear()
    if supplied is not None:
        client.cookies.set(SESSION_COOKIE, supplied)
    response = client.request(
        method,
        path.format(foodstuff_id=shared_foodstuff.id),
        json=payload_for(method),
        headers={"X-Application-User": f"kochwiki:{recipe_session.id}"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}
    assert response.headers["cache-control"] == "no-store"
    assert "Max-Age=0" in response.headers["set-cookie"]
    with SessionLocal() as session:
        assert [foodstuff_out(item) for item in list_foodstuffs(session)] == [
            shared_foodstuff
        ]


@pytest.mark.parametrize(("method", "path", "status"), OPERATIONS)
def test_other_users_can_access_and_mutate_shared_foodstuffs_and_renew_sessions(
    client: TestClient,
    shared_foodstuff: FoodstuffOut,
    recipe_session: UserOut,
    sign_in: Callable[[TestClient], UserOut],
    method: str,
    path: str,
    status: int,
) -> None:
    caller = sign_in(client)
    assert caller.id != recipe_session.id
    secret = client.cookies.get(SESSION_COOKIE, path="/")
    with SessionLocal.begin() as session:
        previous_activity = session.scalar(
            update(ApplicationSession)
            .where(
                ApplicationSession.secret_hash == secret_hash(secret),
            )
            .values(last_activity_at=func.statement_timestamp() - SESSION_LIFETIME / 2)
            .returning(ApplicationSession.last_activity_at)
        )
    assert previous_activity is not None
    response = client.request(
        method, path.format(foodstuff_id=shared_foodstuff.id), json=payload_for(method)
    )
    assert response.status_code == status
    assert response.headers["cache-control"] == "no-store"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Max-Age=0" not in response.headers["set-cookie"]
    with SessionLocal() as session:
        renewed_activity = session.scalar(
            select(ApplicationSession.last_activity_at).where(
                ApplicationSession.secret_hash == secret_hash(secret),
            )
        )
        saved = [foodstuff_out(item) for item in list_foodstuffs(session)]
    assert renewed_activity is not None and renewed_activity > previous_activity
    if method == "DELETE":
        assert response.content == b""
        assert saved == []
    elif method == "POST":
        created = FoodstuffOut.model_validate(response.json())
        assert created.name == "New foodstuff"
        assert saved == [shared_foodstuff, created]
    elif method == "PATCH":
        changed = shared_foodstuff.model_copy(
            update={"name": "Updated foodstuff", "kcal": 123}
        )
        assert FoodstuffOut.model_validate(response.json()) == changed
        assert saved == [changed]
    else:
        assert response.json() == (
            shared_foodstuff.model_dump(mode="json")
            if "{foodstuff_id}" in path
            else [shared_foodstuff.model_dump(mode="json")]
        )
        assert saved == [shared_foodstuff]


def test_shared_mutation_retains_domain_constraints(
    client: TestClient,
    shared_foodstuff: FoodstuffOut,
    sign_in: Callable[[TestClient], UserOut],
) -> None:
    recipe = client.post(
        "/recipes",
        json={
            "name": "Porridge",
            "servings": 1,
            "ingredients": [
                {"index": 1, "amount": 100, "foodstuffId": shared_foodstuff.id}
            ],
        },
    )
    assert recipe.status_code == 201
    sign_in(client)
    path = f"/foodstuffs/{shared_foodstuff.id}"
    assert client.patch(path, json={"kcal": 123}).status_code == 200
    lineage = recipe.json()["recipeLineageId"]
    assert (
        client.get(f"/recipes/{lineage}").json()["ingredients"][0]["foodstuff"]["kcal"]
        == 123
    )
    assert client.delete(path).status_code == 409
    assert (
        client.post(
            "/foodstuffs", json={"name": "Oats", "brand": "Mill", "unit": "G"}
        ).status_code
        == 409
    )
    assert client.patch(path, json={"name": None}).status_code == 422
    assert client.get("/foodstuffs/999").status_code == 404
    assert client.patch("/foodstuffs/999", json={"name": "Missing"}).status_code == 404
    assert client.delete("/foodstuffs/999").status_code == 404


@pytest.mark.parametrize(("method", "path", "status"), OPERATIONS)
def test_foodstuffs_require_configured_login(
    client: TestClient,
    method: str,
    path: str,
    status: int,
) -> None:
    response = client.request(
        method, path.format(foodstuff_id=1), json=payload_for(method)
    )
    assert response.status_code == 503


@pytest.mark.parametrize(("method", "path", "status"), OPERATIONS)
def test_foodstuff_contract_declares_authentication(
    client: TestClient,
    method: str,
    path: str,
    status: int,
) -> None:
    operation = client.get("/api/openapi.json").json()["paths"][path][method.lower()]
    assert operation["security"] == [{"APIKeyCookie": []}]
    for code in ("401", "503"):
        assert operation["responses"][code]["content"]["application/json"][
            "schema"
        ] == {
            "$ref": "#/components/schemas/ErrorResponse",
        }
