import secrets
from collections.abc import Callable
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import invalidate_session, secret_hash
from app.infrastructure.database.session import SessionLocal
from app.recipes.schemas.recipe import RecipeVersionOut

READS = [
    ("GET", "/recipes"),
    ("GET", "/recipes/{lineage}"),
    ("GET", "/recipes/{lineage}/versions/{version}"),
    ("GET", "/recipes/{lineage}/history"),
    ("GET", "/ingredients"),
    ("GET", "/steps"),
    ("POST", "/recipe-presentations/resolve"),
]
PRESENTATION = {"servings": 2, "preptime": None, "ingredients": [], "steps": []}


@pytest.fixture
def readable_recipe(authenticated_client: TestClient) -> RecipeVersionOut:
    client = authenticated_client
    foodstuff = client.post("/foodstuffs", json={"name": "Oats", "unit": "G"})
    assert foodstuff.status_code == 201
    payload = {
        "name": "Shared recipe",
        "servings": 2,
        "ingredients": [
            {"index": 1, "amount": 100, "foodstuffId": foodstuff.json()["id"]}
        ],
        "steps": [{"index": 1, "description": "Mix"}],
    }
    source = client.post("/recipes", json=payload)
    assert source.status_code == 201
    recipe = RecipeVersionOut.model_validate(source.json())
    path = f"/recipes/{recipe.recipeLineageId}"
    assert client.post(f"{path}/drafts", json=payload).status_code == 201
    assert client.post(f"{path}/publish", json=payload).status_code == 200
    return recipe


@pytest.mark.parametrize(("method", "path"), READS)
@pytest.mark.parametrize(
    "credential",
    ["missing", "malformed", "unknown", "expired", "revoked", "stored-hash"],
)
def test_reads_reject_invalid_sessions_and_spoofed_identity(
    client: TestClient,
    readable_recipe: RecipeVersionOut,
    method: str,
    path: str,
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
        path.format(
            lineage=readable_recipe.recipeLineageId,
            version=readable_recipe.recipeVersionId,
        ),
        json=PRESENTATION if method == "POST" else None,
        headers={"X-Application-User": f"kochwiki:{readable_recipe.ownerId}"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}
    assert response.headers["cache-control"] == "no-store"
    assert "Max-Age=0" in response.headers["set-cookie"]


@pytest.mark.parametrize(("method", "path"), READS)
def test_other_users_can_read_and_renew_their_session(
    client: TestClient,
    readable_recipe: RecipeVersionOut,
    sign_in: Callable[[TestClient], UserOut],
    method: str,
    path: str,
) -> None:
    path = path.format(
        lineage=readable_recipe.recipeLineageId, version=readable_recipe.recipeVersionId
    )
    payload = PRESENTATION if method == "POST" else None
    if method == "POST":
        payload = {
            **PRESENTATION,
            "ingredients": [
                {
                    "index": ingredient.index,
                    "amount": float(ingredient.amount),
                    "foodstuffId": ingredient.foodstuff.id,
                }
                for ingredient in readable_recipe.ingredients
            ],
        }
    expected = client.request(method, path, json=payload)
    assert expected.status_code == 200
    reader = sign_in(client)
    assert reader.id != readable_recipe.ownerId
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
    response = client.request(method, path, json=payload)
    assert response.status_code == 200
    assert response.json() == expected.json()
    assert response.headers["cache-control"] == "no-store"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Max-Age=0" not in response.headers["set-cookie"]
    with SessionLocal() as session:
        renewed_activity = session.scalar(
            select(ApplicationSession.last_activity_at).where(
                ApplicationSession.secret_hash == secret_hash(secret),
            )
        )
    assert renewed_activity is not None and renewed_activity > previous_activity


@pytest.mark.parametrize(("method", "path"), READS)
def test_reads_require_configured_login(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(
        method,
        path.format(lineage=uuid4(), version=uuid4()),
        json=PRESENTATION if method == "POST" else None,
    )
    assert response.status_code == 503


@pytest.mark.parametrize(("method", "path"), READS)
def test_read_contract_declares_authentication(
    client: TestClient, method: str, path: str
) -> None:
    path = path.replace("{lineage}", "{lineage_id}").replace(
        "{version}", "{version_id}"
    )
    operation = client.get("/api/openapi.json").json()["paths"][path][method.lower()]
    assert operation["security"] == [{"APIKeyCookie": []}]
    for status in ("401", "503"):
        assert operation["responses"][status]["content"]["application/json"][
            "schema"
        ] == {
            "$ref": "#/components/schemas/ErrorResponse",
        }
