import base64
import hashlib
import json
import logging
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.identity.routes import auth
from app.identity.config import LOGIN_COOKIE, LOGIN_COOKIE_PATH
from app.identity.logging import AuthQueryFilter
from app.core.config import Settings
from app.infrastructure.database.session import SessionLocal
from app.identity.models.login_transaction import LoginTransaction
from app.identity.models.user import User
from app.identity.schemas.oidc import Identity
from app.identity.services import oidc
from app.identity.services.users import map_identity

ISSUER = "http://localhost:8006/realms/services"
CALLBACK = "http://localhost:8000/api/auth/callback"
SECRET = "unit-test-client-secret-value-123456789"


class Provider:
    def __init__(self) -> None:
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.nonce = ""
        self.override: dict[str, object] = {}
        self.omit_email = False
        self.token_form: dict[str, str] = {}
        self.unavailable = False
        self.invalid_signature = False
        self.calls = 0
        self.discovery_issuer = ISSUER

    def fetch(self, url: str, form: dict[str, str] | None = None) -> bytes:
        self.calls += 1
        if self.unavailable:
            raise oidc.ProviderUnavailable()
        if url.endswith("/.well-known/openid-configuration"):
            return json.dumps({
                "issuer": self.discovery_issuer,
                "authorization_endpoint": ISSUER + "/protocol/openid-connect/auth",
                "token_endpoint": ISSUER + "/protocol/openid-connect/token",
                "jwks_uri": ISSUER + "/protocol/openid-connect/certs",
            }).encode()
        if url.endswith("/token"):
            assert form is not None
            self.token_form = form
            now = int(time.time())
            claims: dict[str, object] = {
                "iss": ISSUER, "sub": "provider-user", "aud": "kochwiki",
                "exp": now + 60, "iat": now, "nonce": self.nonce,
                "email": "cook@example.invalid", "email_verified": False,
                "displayName": "Kitchen Friend",
            }
            claims.update(self.override)
            if self.omit_email:
                claims.pop("email")
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048) if self.invalid_signature else self.key
            token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})
            return json.dumps({"id_token": token, "access_token": "must-stay-server-side", "refresh_token": "must-also-stay-server-side"}).encode()
        if url.endswith("/certs"):
            key_data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
            key_data.update({"kid": "test-key", "use": "sig", "alg": "RS256"})
            return json.dumps({"keys": [key_data]}).encode()
        raise AssertionError("Unexpected provider endpoint")


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, oidc_issuer=ISSUER, oidc_client_secret=SECRET, oidc_callback_url=CALLBACK)


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Provider:
    instance = Provider()
    monkeypatch.setattr(oidc, "fetch", instance.fetch)
    return instance


@pytest.fixture
def browser(monkeypatch: pytest.MonkeyPatch, settings: Settings, provider: Provider) -> Iterator[TestClient]:
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    application = FastAPI()
    application.include_router(auth.router, prefix="/api")
    with TestClient(application, base_url="http://localhost:8000") as client:
        yield client


def begin(browser: TestClient, provider: Provider) -> dict[str, list[str]]:
    response = browser.get("/api/auth/login", follow_redirects=False)
    assert response.status_code == 302
    query = parse_qs(urlsplit(response.headers["location"]).query)
    provider.nonce = query["nonce"][0]
    return query


def finish(browser: TestClient, query: dict[str, list[str]]) -> int:
    return browser.get("/api/auth/callback", params={"state": query["state"][0], "code": "provider-code", "iss": ISSUER}, follow_redirects=False).status_code


def test_login_roundtrip_and_replay(browser: TestClient, provider: Provider) -> None:
    query = begin(browser, provider)
    assert query["scope"] == ["openid"]
    assert query["redirect_uri"] == [CALLBACK]
    assert query["code_challenge_method"] == ["S256"]
    binding = browser.cookies.get(LOGIN_COOKIE)
    assert binding and provider.nonce not in binding
    with SessionLocal() as session:
        transaction = session.scalar(select(LoginTransaction))
        assert transaction is not None
        assert transaction.state_hash == oidc.digest(query["state"][0])
        verifier = transaction.verifier
    response = browser.get("/api/auth/callback", params={"state": query["state"][0], "code": "provider-code", "iss": ISSUER}, follow_redirects=False)
    assert response.status_code == 302 and response.headers["location"] == "/"
    assert provider.token_form["client_secret"] == SECRET
    assert provider.token_form["code_verifier"] == verifier
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert query["code_challenge"] == [challenge]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert LOGIN_COOKIE not in browser.cookies
    for private_value in (SECRET, "provider-user", "cook@example.invalid", "must-stay-server-side", "must-also-stay-server-side"):
        assert private_value not in response.text
    browser.cookies.set(LOGIN_COOKIE, binding, domain="localhost.local", path=LOGIN_COOKIE_PATH)
    assert finish(browser, query) == 400


@pytest.mark.parametrize("override", [
    {"iss": "https://other.example/realm"}, {"aud": "other-client"},
    {"exp": 1}, {"iat": int(time.time()) + 600}, {"nonce": "wrong"},
    {"nonce": "non-ascii-\u00e4"}, {"sub": ""}, {"email_verified": "false"},
    {"displayName": "a" * 51}, {"azp": "other-client"},
    {"displayName": "   "}, {"displayName": "Kitchen\nFriend"},
    {"aud": ["kochwiki", "other-client"]},
])
def test_invalid_identity_rejected(browser: TestClient, provider: Provider, override: dict[str, object]) -> None:
    query = begin(browser, provider)
    provider.override = override
    assert finish(browser, query) == 400
    assert not provider.unavailable
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(User)) == 0


def test_identity_mapping_refresh_and_separation(browser: TestClient, provider: Provider) -> None:
    provider.override = {"displayName": "  " + "a" * 50 + "  "}
    assert finish(browser, begin(browser, provider)) == 302
    with SessionLocal() as session:
        first = session.scalars(select(User)).one()
        first_id = first.id
        assert first.display_name == "a" * 50
        assert first.email == "cook@example.invalid"
        assert (first.issuer, first.subject) == (ISSUER, "provider-user")
    provider.override = {"displayName": "Shared Name", "email": "new@example.invalid"}
    assert finish(browser, begin(browser, provider)) == 302
    provider.override = {"sub": "recreated-account", "displayName": "Shared Name", "email": "new@example.invalid"}
    assert finish(browser, begin(browser, provider)) == 302
    with SessionLocal() as session:
        users = session.scalars(select(User).order_by(User.id)).all()
        assert len(users) == 2
        assert users[0].id == first_id
        assert users[0].display_name == users[1].display_name == "Shared Name"
        assert users[0].email == users[1].email == "new@example.invalid"
        assert users[0].subject != users[1].subject


@pytest.mark.parametrize("problem", ["missing", "null", "empty"])
def test_email_claim_is_required(browser: TestClient, provider: Provider, problem: str) -> None:
    query = begin(browser, provider)
    if problem == "missing":
        provider.omit_email = True
    else:
        provider.override = {"email": None if problem == "null" else ""}
    assert finish(browser, query) == 400
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(User)) == 0


def test_concurrent_first_login_and_issuer_separation() -> None:
    identity = Identity(iss=ISSUER, sub="same-subject", email="cook@example.invalid",
                             email_verified=False, displayName="Shared Name", nonce="test")

    barrier = Barrier(4)

    def map_user() -> int:
        with SessionLocal.begin() as session:
            barrier.wait(timeout=10)
            return map_identity(session, identity).id

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(map_user) for _ in range(4)]
        ids = [future.result() for future in futures]
    assert len(set(ids)) == 1
    with SessionLocal.begin() as session:
        other = map_identity(session, identity.model_copy(update={"iss": "https://other.example/realm"}))
        assert other.id != ids[0]
        assert session.scalar(select(func.count()).select_from(User)) == 2


def test_user_creation_and_profile_edit_are_not_exposed(client: TestClient) -> None:
    identity = Identity(iss=ISSUER, sub="provider-user", email="cook@example.invalid",
                             email_verified=False, displayName="Shared Name", nonce="test")
    with SessionLocal.begin() as session:
        user_id = map_identity(session, identity).id
    assert client.get(f"/users/{user_id}").json() == {"id": user_id, "display_name": "Shared Name"}
    assert client.patch(f"/users/{user_id}", json={"display_name": "Local override"}).status_code == 405
    assert client.post("/users", json={"display_name": "Shared Name", "issuer": ISSUER, "subject": "fake"}).status_code == 405
    paths = client.get("/api/openapi.json").json()["paths"]
    assert "post" not in paths["/users"]
    assert "patch" not in paths["/users/{user_id}"]


@pytest.mark.parametrize("issuer,subject", [(None, None), (ISSUER, None), (None, "provider-user")])
def test_users_require_provider_identity(issuer: str | None, subject: str | None) -> None:
    with SessionLocal.begin() as session:
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(User(display_name="Unlinked", issuer=issuer, subject=subject, email="cook@example.invalid"))
                session.flush()
        assert session.scalar(select(func.count()).select_from(User)) == 0


def test_users_require_email() -> None:
    with SessionLocal.begin() as session:
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(User(display_name="No email", issuer=ISSUER, subject="provider-user", email=None))
                session.flush()
        assert session.scalar(select(func.count()).select_from(User)) == 0


def test_invalid_signature(browser: TestClient, provider: Provider) -> None:
    query = begin(browser, provider)
    provider.invalid_signature = True
    assert finish(browser, query) == 400
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("problem", ["missing-cookie", "wrong-cookie", "wrong-state", "expired", "duplicate-state"])
def test_invalid_transaction_no_provider_call(browser: TestClient, provider: Provider, problem: str) -> None:
    query = begin(browser, provider)
    parameters = [("state", query["state"][0]), ("code", "provider-code")]
    if problem == "missing-cookie":
        browser.cookies.clear()
    elif problem == "wrong-cookie":
        browser.cookies.clear()
        browser.cookies.set(LOGIN_COOKIE, "another-browser", path=LOGIN_COOKIE_PATH)
    elif problem == "wrong-state":
        parameters[0] = ("state", "unrelated-state")
    elif problem == "expired":
        with SessionLocal.begin() as session:
            session.execute(update(LoginTransaction).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    else:
        parameters.append(("state", "duplicate"))
    calls = provider.calls
    assert browser.get("/api/auth/callback", params=parameters).status_code == 400
    assert provider.calls == calls


def test_cancellation_consumes_transaction(browser: TestClient, provider: Provider) -> None:
    query = begin(browser, provider)
    calls = provider.calls
    response = browser.get("/api/auth/callback", params={"state": query["state"][0], "error": "access_denied", "error_description": "untrusted-html"})
    assert response.status_code == 400 and "cancelled" in response.text
    assert "untrusted-html" not in response.text and provider.calls == calls
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(LoginTransaction)) == 0


def test_provider_failure_consumes_transaction(browser: TestClient, provider: Provider) -> None:
    query = begin(browser, provider)
    provider.unavailable = True
    assert finish(browser, query) == 503
    provider.unavailable = False
    assert finish(browser, query) == 400


def test_discovery_mismatch_and_outage(browser: TestClient, provider: Provider) -> None:
    provider.discovery_issuer = "https://wrong.example"
    assert browser.get("/api/auth/login").status_code == 503
    provider.unavailable = True
    assert browser.get("/api/auth/login").status_code == 503
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(LoginTransaction)) == 0


def test_atomic_consumption_and_restart(browser: TestClient, provider: Provider, settings: Settings) -> None:
    query = begin(browser, provider)
    binding = browser.cookies.get(LOGIN_COOKIE)
    assert binding is not None

    def consume() -> bool:
        try:
            oidc.OIDCLogin(settings).consume(query["state"][0], binding)
            return True
        except oidc.LoginRejected:
            return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(consume) for _ in range(2)]
        assert sorted(future.result() for future in futures) == [False, True]


def test_cookie_flags(browser: TestClient, provider: Provider, settings: Settings) -> None:
    response = browser.get("/api/auth/login", follow_redirects=False)
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api/auth" in cookie
    assert "Max-Age=600" in cookie and "Secure" not in cookie
    assert oidc.OIDCLogin(settings.model_copy(update={"oidc_callback_url": "https://wiki.example/api/auth/callback"})).secure_cookie


@pytest.mark.parametrize("values", [
    {"oidc_issuer": ISSUER},
    {"oidc_issuer": ISSUER, "oidc_client_secret": "xxxx", "oidc_callback_url": CALLBACK},
    {"oidc_issuer": "http://idp.example/realm", "oidc_client_secret": SECRET, "oidc_callback_url": CALLBACK},
    {"oidc_issuer": ISSUER, "oidc_client_secret": SECRET, "oidc_callback_url": "https://wiki.example/other"},
])
def test_invalid_configuration(values: dict[str, str]) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, **values)
    assert SECRET not in str(error.value)


def test_backchannel_never_changes_identity(settings: Settings) -> None:
    service = oidc.OIDCLogin(settings.model_copy(update={"oidc_backchannel_url": "http://host.docker.internal:8006/realms/services"}))
    assert service.transport_url(ISSUER + "/protocol/openid-connect/token") == "http://host.docker.internal:8006/realms/services/protocol/openid-connect/token"
    assert service.issuer == ISSUER
    with pytest.raises(oidc.ProviderUnavailable):
        service.transport_url("https://untrusted.example/token")


@pytest.mark.parametrize("path", [
    "/auth/callback", "/auth/callback/", "/api/auth/callback/",
    "/auth/login/", "/api/auth/login/", "/auth/unknown",
])
def test_access_log_redacts_auth_namespace(path: str) -> None:
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "%s - %s %s %s %s", ("client", "GET", path + "?code=private&state=private", "1.1", 307), None)
    assert AuthQueryFilter().filter(record)
    assert "private" not in record.getMessage()


def test_disabled_verification(client: TestClient) -> None:
    assert client.get("/auth/login").status_code == 503
    assert client.get("/auth/callback").status_code == 503
