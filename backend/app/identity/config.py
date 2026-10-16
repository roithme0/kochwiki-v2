from datetime import timedelta
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

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
    values = (settings.oidc_issuer, settings.oidc_client_secret, settings.oidc_callback_url)
    if not any(values):
        if settings.oidc_backchannel_url:
            raise ValueError("OIDC_BACKCHANNEL_URL requires OIDC configuration")
        return
    if not all(values):
        raise ValueError("Set OIDC_ISSUER, OIDC_CLIENT_SECRET and OIDC_CALLBACK_URL together")
    assert settings.oidc_issuer and settings.oidc_callback_url and settings.oidc_client_secret
    for value in (settings.oidc_issuer, settings.oidc_callback_url, settings.oidc_backchannel_url):
        if value is None:
            continue
        url = urlsplit(value)
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        if value == settings.oidc_backchannel_url:
            local_hosts.add("host.docker.internal")
        local_http = url.scheme == "http" and url.hostname in local_hosts
        if (url.scheme != "https" and not local_http) or not url.hostname:
            raise ValueError("OIDC URLs require HTTPS, except local development addresses")
        if url.username or url.password or url.query or url.fragment or "*" in value:
            raise ValueError("OIDC URLs must not contain credentials, queries, fragments or wildcards")
        if url.port is not None and not 1 <= url.port <= 65535:
            raise ValueError("Invalid OIDC URL port")
    if settings.oidc_issuer.endswith("/") or (settings.oidc_backchannel_url or "").endswith("/"):
        raise ValueError("OIDC issuer/backchannel URLs must not end with a slash")
    if urlsplit(settings.oidc_callback_url).path != "/api/auth/callback":
        raise ValueError("OIDC_CALLBACK_URL must use /api/auth/callback")
    if not settings.oidc_client_id.strip():
        raise ValueError("OIDC_CLIENT_ID must not be empty")
    secret = settings.oidc_client_secret.get_secret_value()
    if secret == "xxxx" or len(secret) < 32 or any(char.isspace() for char in secret):
        raise ValueError("OIDC_CLIENT_SECRET must be a configured secret of at least 32 characters")
