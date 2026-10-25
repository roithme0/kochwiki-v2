from datetime import timedelta
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from app.core.urls import validate_http_url

if TYPE_CHECKING:
    from app.core.config import Settings


LOGIN_COOKIE = "kochwiki_login"
LOGIN_COOKIE_PATH = "/api/auth"
LOGIN_TRANSACTION_LIFETIME_SECONDS = 600

SESSION_COOKIE = "kochwiki_session"
SESSION_COOKIE_PATH = "/api"
SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60
SESSION_LIFETIME = timedelta(seconds=SESSION_LIFETIME_SECONDS)


def validate_oidc_settings(settings: "Settings") -> None:
    values = (
        settings.oidc_issuer,
        settings.oidc_client_secret,
        settings.oidc_callback_url,
    )
    if not any(values):
        if settings.oidc_backchannel_url:
            raise ValueError("OIDC_BACKCHANNEL_URL requires OIDC configuration")
        return
    if not all(values):
        raise ValueError(
            "Set OIDC_ISSUER, OIDC_CLIENT_SECRET and OIDC_CALLBACK_URL together"
        )
    assert (
        settings.oidc_issuer
        and settings.oidc_callback_url
        and settings.oidc_client_secret
    )
    for value in (
        settings.oidc_issuer,
        settings.oidc_callback_url,
        settings.oidc_backchannel_url,
    ):
        if value is None:
            continue
        url = validate_http_url(value)
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        if value == settings.oidc_backchannel_url:
            local_hosts.add("host.docker.internal")
        allowed_http = url.scheme == "http" and (
            url.hostname in local_hosts or settings.oidc_allow_insecure_http
        )
        if url.scheme != "https" and not allowed_http:
            raise ValueError(
                "OIDC URLs require HTTPS, except local development addresses"
            )
        if "?" in value or "#" in value or "*" in value:
            raise ValueError(
                "OIDC URLs must not contain queries, fragments or wildcards"
            )
    if settings.oidc_issuer.endswith("/") or (
        settings.oidc_backchannel_url or ""
    ).endswith("/"):
        raise ValueError("OIDC issuer/backchannel URLs must not end with a slash")
    if urlsplit(settings.oidc_callback_url).path != "/api/auth/callback":
        raise ValueError("OIDC_CALLBACK_URL must use /api/auth/callback")
    if not settings.oidc_client_id.strip():
        raise ValueError("OIDC_CLIENT_ID must not be empty")
    secret = settings.oidc_client_secret.get_secret_value()
    if secret == "xxxx" or len(secret) < 32 or any(char.isspace() for char in secret):
        raise ValueError(
            "OIDC_CLIENT_SECRET must be a configured secret of at least 32 characters"
        )
