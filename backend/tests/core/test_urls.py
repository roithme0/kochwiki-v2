import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.urls import validate_http_origin, validate_http_url
from app.infrastructure.storage.config import StorageConfig


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com",
        "http://file-storage:3900",
        "http://localhost:8000",
        "http://127.0.0.1:1",
        "https://[::1]:65535",
        "https://example.com/path?value=1#section",
    ],
)
def test_http_urls_accept_hosts_ports_and_paths_without_normalizing(value: str) -> None:
    assert validate_http_url(value).geturl() == value


@pytest.mark.parametrize(
    "value",
    [
        "",
        "example.com",
        "//example.com",
        "ftp://example.com",
        "http:///path",
        "https://user:secret@example.com",
        "https://@example.com",
        "https://example.com:bad",
        "https://example.com:0",
        "https://example.com:65536",
        "https://[::1",
        " https://example.com",
        "https://exam\nple.com",
        "https://example.com/with space",
        "\x00https://example.com",
        "https://example.com/\x7f",
    ],
)
def test_http_urls_reject_invalid_components_before_parser_normalization(
    value: str,
) -> None:
    with pytest.raises(ValueError):
        validate_http_url(value)


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com/path",
        "https://example.com//",
        "https://example.com?query=1",
        "https://example.com?",
        "https://example.com#section",
        "https://example.com#",
    ],
)
def test_origins_reject_paths_and_even_empty_query_or_fragment_delimiters(
    value: str,
) -> None:
    with pytest.raises(ValueError):
        validate_http_origin(value, allow_trailing_slash=True)


def test_storage_normalizes_trailing_slash() -> None:
    origin = "https://example.com/"
    storage = StorageConfig(
        endpoint_url=origin,
        public_origin=origin,
        region="garage",
        bucket_recipe_images="recipes",
        bucket_foodstuff_images="foodstuffs",
        access_key_id="test-key",
        secret_access_key="test-secret",
    )
    assert storage.endpoint_url == storage.public_origin == origin.rstrip("/")


def test_oidc_preserves_exact_issuer_spelling_and_its_path() -> None:
    issuer = "https://IDP.example:443/realms/services"
    settings = Settings(
        _env_file=None,
        oidc_issuer=issuer,
        oidc_client_secret="test-client-secret-value-at-least-32-characters",
        oidc_callback_url="https://wiki.example/api/auth/callback",
    )
    assert settings.oidc_issuer == issuer


@pytest.mark.parametrize("suffix", ["?", "#", "\n", "/"])
def test_oidc_keeps_stricter_issuer_policy(suffix: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            oidc_issuer=f"https://idp.example/realms/services{suffix}",
            oidc_client_secret="test-client-secret-value-at-least-32-characters",
            oidc_callback_url="https://wiki.example/api/auth/callback",
        )
