from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.users import map_identity
from app.services.oidc import LoginRejected, OIDCLogin, ProviderUnavailable, TRANSACTION_SECONDS

router = APIRouter(prefix="/auth", tags=["authentication"])
COOKIE = "kochwiki_login"
COOKIE_PATH = "/api/auth"
HEADERS = {
    "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
}


def result(message: str, status: int) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html lang='en'><meta charset='utf-8'><title>KochWiki login verification</title>"
        f"<h1>{message}</h1><p>This verifies identity only. It does not sign you into KochWiki.</p></html>",
        status_code=status, headers=HEADERS,
    )


def login_service() -> OIDCLogin | None:
    settings = get_settings()
    return OIDCLogin(settings) if settings.oidc_issuer else None


@router.get("/login", response_model=None, include_in_schema=False)
def login() -> Response:
    service = login_service()
    if service is None:
        return result("Login verification is not configured.", 503)
    try:
        start = service.start()
    except ProviderUnavailable:
        return result("The identity provider is unavailable. Start a new login later.", 503)
    response = RedirectResponse(start.url, status_code=302, headers=HEADERS)
    response.set_cookie(COOKIE, start.browser_binding, max_age=TRANSACTION_SECONDS,
                        path=COOKIE_PATH, secure=service.secure_cookie, httponly=True, samesite="lax")
    return response


@router.get("/callback", response_class=HTMLResponse, include_in_schema=False)
def callback(request: Request) -> HTMLResponse:
    service = login_service()
    if service is None:
        return result("Login verification is not configured.", 503)
    response: HTMLResponse
    try:
        parameters = request.query_params
        if any(len(parameters.getlist(key)) > 1 for key in ("state", "code", "error", "iss")):
            raise LoginRejected()
        state, binding = parameters.get("state"), request.cookies.get(COOKIE)
        if not state or not binding or len(state) > 128 or len(binding) > 128:
            raise LoginRejected()
        transaction = service.consume(state, binding)
        if parameters.get("iss") not in (None, service.issuer):
            raise LoginRejected()
        if "error" in parameters:
            response = result("Login was cancelled or rejected. Start a new login to try again.", 400)
        else:
            code = parameters.get("code")
            if not code or len(code) > 4096:
                raise LoginRejected()
            identity = service.finish(transaction, code)
            with SessionLocal.begin() as session:
                user = map_identity(session, identity)
                user_id = user.id
            response = result(f"Identity successfully verified. Local user: {user_id}.", 200)
    except LoginRejected:
        response = result("Login verification failed or expired. Start a new login to try again.", 400)
    except ProviderUnavailable:
        response = result("The identity provider is unavailable. Start a new login later.", 503)
    response.delete_cookie(COOKIE, path=COOKIE_PATH, secure=service.secure_cookie, httponly=True, samesite="lax")
    return response
