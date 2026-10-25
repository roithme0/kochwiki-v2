import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.identity.config import SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.models.delegation_token import DelegationToken
from app.identity.models.user import User
from app.identity.services.sessions import secret_hash

MCP_AUDIENCE = "kochwiki:mcp"


@dataclass(frozen=True)
class IssuedDelegationToken:
    secret: str = field(repr=False)
    expires_at: datetime


def issue_delegation_token(
    session: Session, session_secret: str | None, *, lifetime: timedelta
) -> IssuedDelegationToken | None:
    if lifetime <= timedelta(0):
        raise ValueError("Delegation token lifetime must be positive")
    hashed_session = secret_hash(session_secret)
    if hashed_session is None:
        return None
    row = session.execute(
        select(ApplicationSession.id, func.statement_timestamp())
        .where(
            ApplicationSession.secret_hash == hashed_session,
            ApplicationSession.last_activity_at
            > func.statement_timestamp() - SESSION_LIFETIME,
        )
        .with_for_update()
    ).one_or_none()
    if row is None:
        return None
    session_id, now = row
    assert isinstance(now, datetime)
    secret = secrets.token_urlsafe(32)
    hashed_token = secret_hash(secret)
    assert hashed_token is not None
    expires_at = now + lifetime
    session.add(
        DelegationToken(
            secret_hash=hashed_token,
            session_id=session_id,
            audience=MCP_AUDIENCE,
            created_at=now,
            expires_at=expires_at,
        )
    )
    session.flush()
    return IssuedDelegationToken(secret=secret, expires_at=expires_at)


def delegated_user(
    session: Session, secret: str | None, *, audience: str
) -> User | None:
    hashed = secret_hash(secret)
    if hashed is None:
        return None
    return session.scalar(
        select(User)
        .join(ApplicationSession, ApplicationSession.user_id == User.id)
        .join(DelegationToken, DelegationToken.session_id == ApplicationSession.id)
        .where(
            DelegationToken.secret_hash == hashed,
            DelegationToken.audience == audience,
            DelegationToken.expires_at > func.statement_timestamp(),
            ApplicationSession.last_activity_at
            > func.statement_timestamp() - SESSION_LIFETIME,
        )
    )
