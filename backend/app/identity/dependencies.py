from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Response, Security
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.identity.config import (
    SESSION_COOKIE,
    SESSION_COOKIE_PATH,
    SESSION_LIFETIME_SECONDS,
)
from app.identity.models.user import User
from app.identity.services.oidc import OIDCLogin
from app.identity.services.sessions import authenticated_user
from app.infrastructure.database.session import get_write_db

session_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)
HEADERS = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
}


def login_service() -> OIDCLogin | None:
    settings = get_settings()
    return OIDCLogin(settings) if settings.oidc_issuer else None


def set_session_cookie(
    response: Response, secret: str, expires: datetime, secure: bool
) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        secret,
        max_age=SESSION_LIFETIME_SECONDS,
        expires=expires.astimezone(timezone.utc),
        path=SESSION_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="lax",
    )


def unauthenticated(secure: bool) -> JSONResponse:
    response = JSONResponse(
        {"detail": "Authentication required."}, status_code=401, headers=HEADERS
    )
    response.delete_cookie(
        SESSION_COOKIE,
        path=SESSION_COOKIE_PATH,
        secure=secure,
        httponly=True,
        samesite="lax",
    )
    return response


def require_current_user(
    response: Response,
    secret: Annotated[str | None, Security(session_cookie)],
    session: Annotated[Session, Depends(get_write_db, scope="function")],
) -> User:
    service = login_service()
    if service is None:
        raise HTTPException(
            status_code=503, detail="Login is not configured.", headers=HEADERS
        )
    authenticated = authenticated_user(session, secret)
    if authenticated is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={
                **HEADERS,
                "Set-Cookie": unauthenticated(service.secure_cookie).headers[
                    "set-cookie"
                ],
            },
        )
    user, expires = authenticated
    assert secret is not None
    response.headers.update(HEADERS)
    set_session_cookie(response, secret, expires, service.secure_cookie)
    return user
