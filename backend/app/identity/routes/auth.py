from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Request, Security
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from app.identity.config import (
    LOGIN_COOKIE,
    LOGIN_COOKIE_PATH,
    LOGIN_TRANSACTION_LIFETIME_SECONDS,
    SESSION_COOKIE,
    SESSION_COOKIE_PATH,
)
from app.infrastructure.database.session import SessionLocal
from app.identity.dependencies import (
    HEADERS,
    login_service,
    session_cookie,
    set_session_cookie,
    unauthenticated,
)
from app.identity.schemas.user import UserOut
from app.identity.services.oidc import (
    LoginRejected,
    ProviderUnavailable,
)
from app.identity.services.sessions import (
    authenticated_user,
    cleanup_expired_sessions,
    establish_session,
    invalidate_session,
)
from app.identity.services.users import map_identity

router = APIRouter(prefix="/auth", tags=["authentication"])


def result(message: str, status: int) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html lang='en'><meta charset='utf-8'><title>KochWiki login verification</title>"
        f"<h1>{message}</h1><p>KochWiki local login verification.</p></html>",
        status_code=status,
        headers=HEADERS,
    )


@router.get("/login", response_model=None, include_in_schema=False)
def login() -> Response:
    service = login_service()
    if service is None:
        return result("Login verification is not configured.", 503)
    with SessionLocal.begin() as session:
        cleanup_expired_sessions(session)
    try:
        start = service.start()
    except ProviderUnavailable:
        return result(
            "The identity provider is unavailable. Start a new login later.", 503
        )
    response = RedirectResponse(start.url, status_code=302, headers=HEADERS)
    response.set_cookie(
        LOGIN_COOKIE,
        start.browser_binding,
        max_age=LOGIN_TRANSACTION_LIFETIME_SECONDS,
        path=LOGIN_COOKIE_PATH,
        secure=service.secure_cookie,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/callback", response_model=None, include_in_schema=False)
def callback(request: Request) -> Response:
    service = login_service()
    if service is None:
        return result("Login verification is not configured.", 503)
    response: Response
    try:
        parameters = request.query_params
        if any(
            len(parameters.getlist(key)) > 1
            for key in ("state", "code", "error", "iss")
        ):
            raise LoginRejected()
        state, binding = parameters.get("state"), request.cookies.get(LOGIN_COOKIE)
        if not state or not binding or len(state) > 128 or len(binding) > 128:
            raise LoginRejected()
        transaction = service.consume(state, binding)
        if parameters.get("iss") not in (None, service.issuer):
            raise LoginRejected()
        if "error" in parameters:
            response = result(
                "Login was cancelled or rejected. Start a new login to try again.", 400
            )
        else:
            code = parameters.get("code")
            if not code or len(code) > 4096:
                raise LoginRejected()
            identity = service.finish(transaction, code)
            with SessionLocal.begin() as session:
                user = map_identity(session, identity)
                user_id = user.id
                secret, expires = establish_session(
                    session, user_id, request.cookies.get(SESSION_COOKIE)
                )
            response = RedirectResponse("/", status_code=302, headers=HEADERS)
            set_session_cookie(response, secret, expires, service.secure_cookie)
    except LoginRejected:
        response = result(
            "Login verification failed or expired. Start a new login to try again.", 400
        )
    except ProviderUnavailable:
        response = result(
            "The identity provider is unavailable. Start a new login later.", 503
        )
    response.delete_cookie(
        LOGIN_COOKIE,
        path=LOGIN_COOKIE_PATH,
        secure=service.secure_cookie,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get(
    "/me",
    response_model=UserOut,
    responses={
        401: {"description": "Invalid or expired session"},
        503: {"description": "Login not configured"},
    },
)
def current_user(secret: Annotated[str | None, Security(session_cookie)]) -> Response:
    service = login_service()
    if service is None:
        return JSONResponse(
            {"detail": "Login is not configured."}, status_code=503, headers=HEADERS
        )
    with SessionLocal.begin() as session:
        authenticated = authenticated_user(session, secret)
        if authenticated is None:
            return unauthenticated(service.secure_cookie)
        user, expires = authenticated
        body = UserOut.model_validate(user)
    assert secret is not None
    response = JSONResponse(body.model_dump(mode="json"), headers=HEADERS)
    set_session_cookie(response, secret, expires, service.secure_cookie)
    return response


def origin(url: str) -> tuple[str, str | None, int | None]:
    parsed = urlsplit(url)
    return (
        parsed.scheme,
        parsed.hostname,
        (
            parsed.port
            if parsed.port is not None
            else (443 if parsed.scheme == "https" else 80)
        ),
    )


@router.post(
    "/logout",
    status_code=204,
    response_class=Response,
    responses={
        401: {"description": "Invalid or expired session"},
        403: {"description": "Missing or untrusted Origin"},
        503: {"description": "Login not configured"},
    },
)
def logout(
    request: Request, secret: Annotated[str | None, Security(session_cookie)]
) -> Response:
    service = login_service()
    if service is None:
        return JSONResponse(
            {"detail": "Login is not configured."}, status_code=503, headers=HEADERS
        )
    origins = request.headers.getlist("origin")
    trusted = False
    if len(origins) == 1:
        try:
            supplied = urlsplit(origins[0])
            trusted = (
                not any(ord(character) <= 32 for character in origins[0])
                and not supplied.username
                and not supplied.password
                and not supplied.path
                and not supplied.query
                and not supplied.fragment
                and origin(origins[0]) == origin(service.callback_url)
            )
        except ValueError:
            pass
    if not trusted:
        return JSONResponse(
            {"detail": "Untrusted request origin."}, status_code=403, headers=HEADERS
        )
    with SessionLocal.begin() as session:
        if not invalidate_session(session, secret):
            return unauthenticated(service.secure_cookie)
    response = Response(status_code=204, headers=HEADERS)
    response.delete_cookie(
        SESSION_COOKIE,
        path=SESSION_COOKIE_PATH,
        secure=service.secure_cookie,
        httponly=True,
        samesite="lax",
    )
    return response
