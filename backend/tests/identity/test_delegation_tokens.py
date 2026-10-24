import secrets
from collections.abc import Callable
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from app.identity.config import SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.models.delegation_token import DelegationToken
from app.identity.schemas.user import UserOut
from app.identity.services.delegation import MCP_AUDIENCE, delegated_user, issue_delegation_token
from app.identity.services.sessions import (
    authenticated_user, cleanup_expired_sessions, establish_session, invalidate_session, secret_hash,
)
from app.infrastructure.database.session import SessionLocal


@pytest.fixture
def browser_session(provider_user: Callable[[str], UserOut]) -> tuple[str, UserOut]:
    user = provider_user("Delegating user")
    with SessionLocal.begin() as session:
        secret, _ = establish_session(session, user.id, None)
    return secret, user


def test_tokens_are_distinct_hash_only_and_bound_to_the_originating_session(
    browser_session: tuple[str, UserOut],
) -> None:
    secret, user = browser_session
    lifetime = timedelta(minutes=5)
    with SessionLocal.begin() as session:
        first = issue_delegation_token(session, secret, lifetime=lifetime)
        second = issue_delegation_token(session, secret, lifetime=lifetime)
        assert first is not None and second is not None
        assert len(first.secret) == 43 and first.secret != second.secret != secret
        assert first.secret not in repr(first)
        with SessionLocal() as observer:
            assert observer.scalar(select(func.count()).select_from(DelegationToken)) == 0
    with SessionLocal() as session:
        parent = session.scalars(select(ApplicationSession)).one()
        tokens = session.scalars(select(DelegationToken).order_by(DelegationToken.id)).all()
        assert [token.secret_hash for token in tokens] == [secret_hash(first.secret), secret_hash(second.secret)]
        for token, issued in zip(tokens, (first, second), strict=True):
            assert token.secret_hash != issued.secret
            assert token.session_id == parent.id
            assert token.audience == MCP_AUDIENCE
            assert token.expires_at == issued.expires_at == token.created_at + lifetime
            principal = delegated_user(session, issued.secret, audience=MCP_AUDIENCE)
            assert principal is not None and principal.id == user.id


@pytest.mark.parametrize("credential", [None, "malformed", "x" * 44, "!" * 43, "a" * 64, "unknown", "browser-secret"])
def test_validation_rejects_invalid_or_browser_credentials(
    browser_session: tuple[str, UserOut], credential: str | None,
) -> None:
    browser_secret, _ = browser_session
    supplied = browser_secret if credential == "browser-secret" else secrets.token_urlsafe(32) if credential == "unknown" else credential
    with SessionLocal.begin() as session:
        assert issue_delegation_token(session, browser_secret, lifetime=timedelta(minutes=5)) is not None
        assert delegated_user(session, supplied, audience=MCP_AUDIENCE) is None


def test_audience_and_credential_boundaries(browser_session: tuple[str, UserOut]) -> None:
    browser_secret, _ = browser_session
    with SessionLocal.begin() as session:
        issued = issue_delegation_token(session, browser_secret, lifetime=timedelta(minutes=5))
        assert issued is not None
        assert delegated_user(session, issued.secret, audience="another-resource") is None
        assert delegated_user(session, secret_hash(issued.secret), audience=MCP_AUDIENCE) is None
        assert authenticated_user(session, issued.secret) is None
        assert issue_delegation_token(session, issued.secret, lifetime=timedelta(minutes=5)) is None
        assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is not None


@pytest.mark.parametrize("credential", [None, "malformed", "unknown", "stored-hash", "expired", "deleted"])
def test_issuance_requires_an_active_original_session(
    browser_session: tuple[str, UserOut], credential: str | None,
) -> None:
    browser_secret, _ = browser_session
    with SessionLocal.begin() as session:
        supplied = credential
        if credential == "unknown":
            supplied = secrets.token_urlsafe(32)
        elif credential == "stored-hash":
            supplied = secret_hash(browser_secret)
        elif credential == "expired":
            session.execute(update(ApplicationSession).values(last_activity_at=func.statement_timestamp() - SESSION_LIFETIME))
            supplied = browser_secret
        elif credential == "deleted":
            assert invalidate_session(session, browser_secret)
            supplied = browser_secret
        assert issue_delegation_token(session, supplied, lifetime=timedelta(minutes=5)) is None
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 0


@pytest.mark.parametrize("lifetime", [timedelta(0), timedelta(seconds=-1)])
def test_issuance_rejects_nonpositive_lifetimes(browser_session: tuple[str, UserOut], lifetime: timedelta) -> None:
    secret, _ = browser_session
    with SessionLocal.begin() as session:
        with pytest.raises(ValueError, match="must be positive"):
            issue_delegation_token(session, secret, lifetime=lifetime)
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 0


def test_issuance_and_validation_never_renew_session_or_token(browser_session: tuple[str, UserOut]) -> None:
    secret, _ = browser_session
    with SessionLocal.begin() as session:
        previous = session.scalar(update(ApplicationSession).values(
            last_activity_at=func.statement_timestamp() - timedelta(days=29),
        ).returning(ApplicationSession.last_activity_at))
        assert isinstance(previous, datetime)
        issued = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
        assert issued is not None
        for _ in range(2):
            assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is not None
        assert session.scalar(select(ApplicationSession.last_activity_at)) == previous
        assert session.scalar(select(DelegationToken.expires_at)) == issued.expires_at
    with SessionLocal.begin() as session:
        assert authenticated_user(session, secret) is not None
        assert session.scalar(select(ApplicationSession.last_activity_at)) > previous
        assert session.scalar(select(DelegationToken.expires_at)) == issued.expires_at


@pytest.mark.parametrize("expiry", ["token", "session"])
def test_validation_checks_live_token_and_session_expiry(
    browser_session: tuple[str, UserOut], expiry: str,
) -> None:
    secret, _ = browser_session
    with SessionLocal.begin() as session:
        issued = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
        assert issued is not None
        assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is not None
        if expiry == "token":
            session.execute(update(DelegationToken).values(
                created_at=func.statement_timestamp() - timedelta(minutes=5),
                expires_at=func.statement_timestamp(),
            ))
        else:
            session.execute(update(ApplicationSession).values(last_activity_at=func.statement_timestamp() - SESSION_LIFETIME))
        assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is None
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 1


def test_logout_removes_all_its_tokens_and_preserves_independent_sessions(
    browser_session: tuple[str, UserOut], provider_user: Callable[[str], UserOut],
) -> None:
    secret, user = browser_session
    other_user = provider_user("Another user")
    with SessionLocal.begin() as session:
        same_user_secret, _ = establish_session(session, user.id, None)
        other_user_secret, _ = establish_session(session, other_user.id, None)
        session.flush()
        issued = [issue_delegation_token(session, parent, lifetime=timedelta(minutes=5))
            for parent in (secret, secret, same_user_secret, other_user_secret)]
        assert all(token is not None for token in issued)
    with SessionLocal.begin() as session:
        assert invalidate_session(session, secret)
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 2
    with SessionLocal() as session:
        for index, token in enumerate(issued):
            assert token is not None
            principal = delegated_user(session, token.secret, audience=MCP_AUDIENCE)
            if index < 2:
                assert principal is None
            else:
                assert principal is not None
                assert principal.id == (user.id if index == 2 else other_user.id)


@pytest.mark.parametrize("invalidate", ["rotation", "expired-session-cleanup"])
def test_session_replacement_or_cleanup_cascades_to_delegations(
    browser_session: tuple[str, UserOut], invalidate: str,
) -> None:
    secret, user = browser_session
    with SessionLocal.begin() as session:
        issued = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
        assert issued is not None
        if invalidate == "rotation":
            establish_session(session, user.id, secret)
            session.flush()
        else:
            session.execute(update(ApplicationSession).values(last_activity_at=func.statement_timestamp() - SESSION_LIFETIME))
            cleanup_expired_sessions(session)
        assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is None
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 0


def test_issuance_uses_the_callers_transaction(browser_session: tuple[str, UserOut]) -> None:
    secret, _ = browser_session
    with pytest.raises(RuntimeError, match="roll back issuance"):
        with SessionLocal.begin() as session:
            issued = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
            assert issued is not None
            raise RuntimeError("roll back issuance")
    with SessionLocal() as session:
        assert delegated_user(session, issued.secret, audience=MCP_AUDIENCE) is None
        assert session.scalar(select(func.count()).select_from(DelegationToken)) == 0
