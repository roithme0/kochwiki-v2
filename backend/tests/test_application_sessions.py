from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update

from app.api.routes import auth
from app.core.config import Settings
from app.db.session import SessionLocal
from app.models.application_session import ApplicationSession
from app.models.user import User
from app.services.sessions import (
    SESSION_COOKIE, SESSION_PATH, SESSION_SECONDS, authenticated_user, invalidate_session, secret_hash,
)
from test_oidc_login import Provider, begin, browser, finish, provider, settings


def test_session_cookie_hash_and_current_profile(browser: TestClient, provider: Provider) -> None:
    query = begin(browser, provider)
    response = browser.get("/api/auth/callback", params={"state": query["state"][0], "code": "provider-code"}, follow_redirects=False)
    assert response.status_code == 302 and response.headers["location"] == "/"
    secret = browser.cookies.get(SESSION_COOKIE)
    assert secret and len(secret) == 43 and secret not in response.text
    cookie = next(value for value in response.headers.get_list("set-cookie") if value.startswith(SESSION_COOKIE + "="))
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Domain=" not in cookie
    assert f"Path={SESSION_PATH}" in cookie and f"Max-Age={SESSION_SECONDS}" in cookie and "expires=" in cookie.lower()
    assert "Secure" not in cookie
    with SessionLocal() as session:
        stored = session.scalars(select(ApplicationSession)).one()
        assert stored.secret_hash == secret_hash(secret) and stored.secret_hash != secret
        assert stored.created_at == stored.last_activity_at and stored.last_provider_check_at is None
        assert set(ApplicationSession.__table__.columns.keys()) == {
            "id", "secret_hash", "user_id", "created_at", "last_activity_at", "last_provider_check_at",
        }
        user_id = stored.user_id
    current = browser.get("/api/auth/me")
    assert current.json() == {"id": user_id, "display_name": "Kitchen Friend"}
    assert current.headers["cache-control"] == "no-store"


def test_activity_slides_database_and_cookie_expiry(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    secret = browser.cookies.get(SESSION_COOKIE)
    old_activity = datetime.now(timezone.utc) - timedelta(days=29)
    with SessionLocal.begin() as session:
        session.execute(update(ApplicationSession).values(last_activity_at=old_activity))
    response = browser.get("/api/auth/me")
    assert response.status_code == 200 and browser.cookies.get(SESSION_COOKIE) == secret
    assert "expires=" in response.headers["set-cookie"].lower()
    with SessionLocal() as session:
        stored = session.scalars(select(ApplicationSession)).one()
        assert stored.last_activity_at > old_activity + timedelta(days=28)
        assert stored.last_provider_check_at is None


@pytest.mark.parametrize("secret", [None, "unknown", "x" * 43])
def test_invalid_session_cleared(browser: TestClient, secret: str | None) -> None:
    if secret is not None:
        browser.cookies.set(SESSION_COOKIE, secret, domain="localhost.local", path=SESSION_PATH)
    response = browser.get("/api/auth/me")
    assert response.status_code == 401 and response.headers["cache-control"] == "no-store"
    assert "Max-Age=0" in response.headers["set-cookie"] and SESSION_COOKIE not in browser.cookies


@pytest.mark.parametrize("days", [30, 31])
def test_expired_cannot_be_revived(browser: TestClient, provider: Provider, days: int) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    secret = browser.cookies.get(SESSION_COOKIE)
    old_activity = datetime.now(timezone.utc) - timedelta(days=days)
    with SessionLocal.begin() as session:
        session.execute(update(ApplicationSession).values(last_activity_at=old_activity))
    assert browser.get("/api/auth/me").status_code == 401
    assert secret is not None
    browser.cookies.set(SESSION_COOKIE, secret, domain="localhost.local", path=SESSION_PATH)
    assert browser.post("/api/auth/logout", headers={"Origin": "http://localhost:8000"}).status_code == 401
    with SessionLocal() as session:
        assert session.scalars(select(ApplicationSession)).one().last_activity_at == old_activity


@pytest.mark.parametrize("origin", [None, "null", "http://localhost:8006", "https://attacker.invalid", "http://localhost:8000/", "http://localhost:8000@attacker.invalid", "http://localhost:bad", "http://localhost:0", " http://localhost:8000"])
def test_logout_csrf_rejection_preserves_session(browser: TestClient, provider: Provider, origin: str | None) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    with SessionLocal() as session:
        previous = session.scalars(select(ApplicationSession)).one().last_activity_at
    response = browser.post("/api/auth/logout", headers={"Origin": origin} if origin else {})
    assert response.status_code == 403 and "set-cookie" not in response.headers
    with SessionLocal() as session:
        assert session.scalars(select(ApplicationSession)).one().last_activity_at == previous
    assert browser.get("/api/auth/me").status_code == 200


def test_logout_invalidates_only_local_session_and_rejects_reuse(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    secret = browser.cookies.get(SESSION_COOKIE)
    calls = provider.calls
    assert browser.get("/api/auth/logout").status_code == 405
    assert browser.post("/api/auth/logout", headers=[("Origin", "http://localhost:8000"), ("Origin", "http://localhost:8000")]).status_code == 403
    response = browser.post("/api/auth/logout", headers={"Origin": "http://localhost:8000"})
    assert response.status_code == 204 and "Max-Age=0" in response.headers["set-cookie"]
    assert provider.calls == calls and SESSION_COOKIE not in browser.cookies
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(ApplicationSession)) == 0
        assert session.scalar(select(func.count()).select_from(User)) == 1
    assert secret is not None
    browser.cookies.set(SESSION_COOKIE, secret, domain="localhost.local", path=SESSION_PATH)
    assert browser.get("/api/auth/me").status_code == 401
    assert browser.post("/api/auth/logout", headers={"Origin": "http://localhost:8000"}).status_code == 401


def test_login_rotates_only_after_successful_validation(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    original = browser.cookies.get(SESSION_COOKIE)
    query = begin(browser, provider)
    provider.override = {"nonce": "wrong"}
    assert finish(browser, query) == 400
    assert browser.cookies.get(SESSION_COOKIE) == original
    assert browser.get("/api/auth/me").status_code == 200
    provider.override = {}
    assert finish(browser, begin(browser, provider)) == 302
    assert browser.cookies.get(SESSION_COOKIE) != original
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(ApplicationSession)) == 1
    assert original is not None
    browser.cookies.set(SESSION_COOKIE, original, domain="localhost.local", path=SESSION_PATH)
    assert browser.get("/api/auth/me").status_code == 401


def test_https_cookie_and_default_origin_port(browser: TestClient, provider: Provider, settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "get_settings", lambda: settings.model_copy(update={"oidc_callback_url": "https://cook.example/api/auth/callback"}))
    with TestClient(browser.app, base_url="https://cook.example") as secure_browser:
        query = begin(secure_browser, provider)
        response = secure_browser.get("/api/auth/callback", params={"state": query["state"][0], "code": "provider-code"}, follow_redirects=False)
        cookie = next(value for value in response.headers.get_list("set-cookie") if value.startswith(SESSION_COOKIE + "="))
        assert "Secure" in cookie and "Domain=" not in cookie
        assert secure_browser.get("/api/auth/me").status_code == 200
        assert secure_browser.post("/api/auth/logout", headers={"Origin": "https://cook.example:443"}).status_code == 204


def test_user_deletion_invalidates_sessions(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    with SessionLocal.begin() as session:
        session.execute(delete(User))
    assert browser.get("/api/auth/me").status_code == 401
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(ApplicationSession)) == 0


def test_concurrent_renewal_and_logout_cannot_resurrect_session(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    secret = browser.cookies.get(SESSION_COOKIE)
    barrier = Barrier(4)

    def use_session(logout: bool) -> bool:
        with SessionLocal.begin() as session:
            barrier.wait(timeout=10)
            return invalidate_session(session, secret) if logout else authenticated_user(session, secret) is not None

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(use_session, index == 0) for index in range(4)]
        assert futures[0].result()
        for future in futures[1:]:
            future.result()
    with SessionLocal.begin() as session:
        assert authenticated_user(session, secret) is None
        assert session.scalar(select(func.count()).select_from(ApplicationSession)) == 0



def test_stored_hash_is_not_a_session_credential(browser: TestClient, provider: Provider) -> None:
    assert finish(browser, begin(browser, provider)) == 302
    with SessionLocal() as session:
        hashed = session.scalars(select(ApplicationSession)).one().secret_hash
    browser.cookies.set(SESSION_COOKIE, hashed, domain="localhost.local", path=SESSION_PATH)
    assert browser.get("/api/auth/me").status_code == 401
