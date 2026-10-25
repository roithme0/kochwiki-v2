import secrets
from collections.abc import Callable
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import invalidate_session, secret_hash
from app.infrastructure.database.session import SessionLocal
from app.recipes.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step
from app.recipes.services.recipes import get_recipe_lineage
from app.recipes.services.proposal_store import RecipeProposalStore
from app.recipes.schemas.proposal import RecipeProposalCreate
from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.embedding import RecipeEmbedding
from app.foodstuffs.models.embedding import FoodstuffEmbedding


PAYLOAD = {"name": "Owned recipe", "servings": 2}


def counts(session: Session) -> list[int | None]:
    return [session.scalar(select(func.count()).select_from(model)) for model in (
        Foodstuff, RecipeVersion, Ingredient, Step, FoodstuffEmbedding, RecipeEmbedding,
    )]


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


MUTATIONS = [
    ("POST", "/publish"), ("POST", "/drafts"),
    ("PUT", "/drafts/{draft}"), ("POST", "/drafts/{draft}/publish"),
    ("DELETE", "/drafts/{draft}"), ("DELETE", ""),
]


@pytest.mark.parametrize(("method", "suffix"), MUTATIONS)
@pytest.mark.parametrize("caller", ["other", "missing", "revoked", "expired"])
def test_mutations_require_live_owner_without_side_effects(
    client: TestClient, sign_in: Callable[[TestClient], UserOut],
    method: str, suffix: str, caller: str,
) -> None:
    owner = sign_in(client)
    secret = client.cookies.get(SESSION_COOKIE)
    active = client.post("/recipes", json=PAYLOAD).json()
    path = f"/recipes/{active['recipeLineageId']}"
    draft = client.post(f"{path}/drafts", json=PAYLOAD).json()
    before = client.get("/recipes").json()
    if caller == "other":
        sign_in(client)
    elif caller == "missing":
        client.cookies.clear()
    elif caller == "revoked":
        with SessionLocal.begin() as session:
            assert invalidate_session(session, secret)
    else:
        with SessionLocal.begin() as session:
            session.execute(update(ApplicationSession).values(
                last_activity_at=func.statement_timestamp() - SESSION_LIFETIME,
            ))
    response = client.request(
        method, path + suffix.format(draft=draft["recipeVersionId"]),
        json={**PAYLOAD, "imageId": str(uuid4())} if method != "DELETE" else None,
        headers={"X-Application-User": f"kochwiki:{owner.id}"},
    )
    assert response.status_code == (403 if caller == "other" else 401)
    sign_in(client)
    assert client.get("/recipes").json() == before
    assert client.get(f"{path}/history").json() == []


@pytest.mark.parametrize(("method", "suffix"), MUTATIONS)
def test_owner_can_mutate_and_unknown_lineages_return_404(
    authenticated_client: TestClient, method: str, suffix: str,
) -> None:
    client = authenticated_client
    active = client.post("/recipes", json=PAYLOAD).json()
    path = f"/recipes/{active['recipeLineageId']}"
    draft = client.post(f"{path}/drafts", json=PAYLOAD).json()
    response = client.request(method, path + suffix.format(draft=draft["recipeVersionId"]),
                              json=PAYLOAD if method != "DELETE" else None)
    assert response.status_code == (204 if method == "DELETE" else 201 if suffix == "/drafts" else 200)
    assert "HttpOnly" in response.headers["set-cookie"]
    assert response.headers["cache-control"] == "no-store"
    missing = client.request(method, f"/recipes/{uuid4()}" + suffix.format(draft=uuid4()),
                             json=PAYLOAD if method != "DELETE" else None)
    assert missing.status_code == 404


def test_other_user_can_read_all_lineage_states(
    client: TestClient, sign_in: Callable[[TestClient], UserOut],
) -> None:
    sign_in(client)
    historical = client.post("/recipes", json=PAYLOAD).json()
    path = f"/recipes/{historical['recipeLineageId']}"
    draft = client.post(f"{path}/drafts", json=PAYLOAD).json()
    active = client.post(f"{path}/publish", json=PAYLOAD).json()
    sign_in(client)
    for version in (historical, draft, active):
        assert client.get(f"{path}/versions/{version['recipeVersionId']}").status_code == 200
    assert client.get(path).json() == active
    assert len(client.get(f"{path}/history").json()) == 1
    assert len(client.get("/recipes").json()) == 2


@pytest.mark.parametrize("saved", [False, True])
@pytest.mark.parametrize("caller", ["other", "missing", "revoked"])
def test_proposal_save_checks_owner_even_on_repeat_without_creating_foodstuffs(
    client: TestClient, sign_in: Callable[[TestClient], UserOut], saved: bool, caller: str,
) -> None:
    owner = sign_in(client)
    secret = client.cookies.get(SESSION_COOKIE)
    source = client.post("/recipes", json=PAYLOAD).json()
    store = cast(RecipeProposalStore, client.app.state.recipe_proposals)
    with SessionLocal() as session:
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source["recipeVersionId"],
            "recipe": {
                **PAYLOAD, "steps": [], "ingredients": [{
                    "index": 1, "amount": 100, "foodstuff": {
                        "kind": "temporary", "definition": {"name": "Beans", "unit": "G"},
                    },
                }],
            },
        }), user_id=owner.id)
    path = f"/recipe-proposals/{proposal.proposalId}/save"
    if saved:
        assert client.post(path).status_code == 200
        assert client.post(path).status_code == 200
    with SessionLocal() as session:
        before = counts(session)
    if caller == "other":
        sign_in(client)
    elif caller == "missing":
        client.cookies.clear()
    else:
        with SessionLocal.begin() as session:
            assert invalidate_session(session, secret)
    assert client.post(path).status_code == (404 if caller == "other" else 401)
    with SessionLocal() as session:
        assert counts(session) == before
    assert (store.saved_version_id(proposal.proposalId, user_id=owner.id) is not None) == saved
