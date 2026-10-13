import hashlib
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models.application_session import ApplicationSession
from app.models.user import User

SESSION_COOKIE = "kochwiki_session"
SESSION_PATH = "/api"
SESSION_SECONDS = 30 * 24 * 60 * 60
SESSION_LIFETIME = timedelta(seconds=SESSION_SECONDS)


def cleanup_expired_sessions(session: Session) -> None:
    session.execute(
        delete(ApplicationSession).where(
            ApplicationSession.last_activity_at
            <= func.statement_timestamp() - SESSION_LIFETIME
        )
    )


def secret_hash(secret: str | None) -> str | None:
    if secret is None or re.fullmatch(r"[A-Za-z0-9_-]{43}", secret) is None:
        return None
    return hashlib.sha256(secret.encode("ascii")).hexdigest()


def establish_session(
    session: Session, user_id: int, previous_secret: str | None
) -> tuple[str, datetime]:
    previous_hash = secret_hash(previous_secret)
    if previous_hash is not None:
        session.execute(
            delete(ApplicationSession).where(
                ApplicationSession.secret_hash == previous_hash
            )
        )
    secret = secrets.token_urlsafe(32)
    now = session.scalar(select(func.statement_timestamp()))
    assert isinstance(now, datetime)
    hashed = secret_hash(secret)
    assert hashed is not None
    session.add(
        ApplicationSession(
            secret_hash=hashed,
            user_id=user_id,
            created_at=now,
            last_activity_at=now,
            last_provider_check_at=None,
        )
    )
    return secret, now + SESSION_LIFETIME


def authenticated_user(
    session: Session, secret: str | None
) -> tuple[User, datetime] | None:
    hashed = secret_hash(secret)
    if hashed is None:
        return None
    row = session.execute(
        update(ApplicationSession)
        .where(
            ApplicationSession.secret_hash == hashed,
            ApplicationSession.last_activity_at
            > func.statement_timestamp() - SESSION_LIFETIME,
        )
        .values(
            last_activity_at=func.greatest(
                ApplicationSession.last_activity_at, func.statement_timestamp()
            )
        )
        .returning(ApplicationSession.user_id, ApplicationSession.last_activity_at)
    ).one_or_none()
    if row is None:
        return None
    user = session.get(User, row.user_id)
    assert user is not None
    return user, row.last_activity_at + SESSION_LIFETIME


def invalidate_session(session: Session, secret: str | None) -> bool:
    hashed = secret_hash(secret)
    if hashed is None:
        return False
    return (
        session.scalar(
            delete(ApplicationSession)
            .where(
                ApplicationSession.secret_hash == hashed,
                ApplicationSession.last_activity_at
                > func.statement_timestamp() - SESSION_LIFETIME,
            )
            .returning(ApplicationSession.id)
        )
        is not None
    )
