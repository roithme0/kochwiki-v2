import json

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.infrastructure.embeddings.config import STORAGE_DIMENSIONS, PROFILE
from app.infrastructure.embeddings.embeddings import (
    EmbeddingClient,
    HTTPEmbeddingProvider,
)


def payload() -> dict[str, object]:
    return {
        "profile": PROFILE,
        "model": "provider-model",
        "dimensions": STORAGE_DIMENSIONS,
        "vector": [1.0] + [0.0] * (STORAGE_DIMENSIONS - 1),
    }


def test_http_provider_contract_and_cleanup() -> None:
    requests: list[httpx.Request] = []

    def send(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=payload())

    http = httpx.Client(transport=httpx.MockTransport(send))
    client = EmbeddingClient(HTTPEmbeddingProvider("http://ai-service/", client=http))
    assert client.embed("Soup\nBrand: Farm", PROFILE) == payload()["vector"]
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == "http://ai-service/api/v1/embeddings"
    assert json.loads(request.content) == {
        "profile": PROFILE,
        "input": "Soup\nBrand: Farm",
    }
    assert "Authorization" not in request.headers
    assert "X-Application-User" not in request.headers
    assert "Cookie" not in request.headers
    client.close()
    assert http.is_closed


@pytest.mark.parametrize("include_model", [False, True])
def test_provider_metadata_does_not_determine_compatibility(
    include_model: bool,
) -> None:
    response = payload()
    if not include_model:
        del response["model"]
    response["provider_metadata"] = {"provider": "opaque"}
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=response)
        )
    ) as http:
        provider = HTTPEmbeddingProvider("http://ai-service", client=http)
        assert provider.embed("Soup", PROFILE) == payload()["vector"]


def test_unsupported_profile_never_calls_service() -> None:
    def send(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Unsupported profiles must not call the service")

    with httpx.Client(transport=httpx.MockTransport(send)) as http:
        provider = HTTPEmbeddingProvider("http://ai-service", client=http)
        with pytest.raises(ValueError, match="profile"):
            provider.embed("Soup", "unsupported")
        client = EmbeddingClient(provider)
        with pytest.raises(ValueError, match="profile"):
            client.embed("Soup", "unsupported")


@pytest.mark.parametrize(
    "invalid",
    [
        "profile",
        "dimensions",
        "dimension_type",
        "short",
        "zero",
        "nonfinite",
        "bool",
        "missing",
    ],
)
def test_mismatched_or_invalid_response_is_rejected(invalid: str) -> None:
    response = payload()
    if invalid == "profile":
        response["profile"] = "semantic-text-v2"
    elif invalid == "dimensions":
        response["dimensions"] = 1536
    elif invalid == "dimension_type":
        response["dimensions"] = "3072"
    elif invalid == "short":
        response["vector"] = [1.0]
    elif invalid == "zero":
        response["vector"] = [0.0] * STORAGE_DIMENSIONS
    elif invalid == "nonfinite":
        response["vector"] = ["NaN"] + [0.0] * (STORAGE_DIMENSIONS - 1)
    elif invalid == "bool":
        response["vector"] = [True] + [0.0] * (STORAGE_DIMENSIONS - 1)
    else:
        del response["profile"]
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=response)
        )
    ) as http:
        provider = HTTPEmbeddingProvider("http://ai-service", client=http)
        with pytest.raises(ValueError):
            provider.embed("Soup", PROFILE)


@pytest.mark.parametrize("status", [302, 422, 502, 503])
def test_service_errors_are_not_retried_or_followed(status: int) -> None:
    requests: list[httpx.Request] = []

    def send(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            status,
            json={"detail": "failure"},
            headers={"Location": "http://other-service"},
        )

    with httpx.Client(transport=httpx.MockTransport(send)) as http:
        with pytest.raises(httpx.HTTPStatusError):
            HTTPEmbeddingProvider("http://ai-service", client=http).embed(
                "Soup", PROFILE
            )
    assert len(requests) == 1


@pytest.mark.parametrize("failure", [httpx.ConnectError, httpx.ReadTimeout])
def test_transport_failures_are_not_retried(
    failure: type[httpx.TransportError],
) -> None:
    attempts = 0

    def send(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise failure("unavailable", request=request)

    with httpx.Client(transport=httpx.MockTransport(send)) as http:
        with pytest.raises(failure):
            HTTPEmbeddingProvider("http://ai-service", client=http).embed(
                "Soup", PROFILE
            )
    assert attempts == 1


def test_invalid_json_is_rejected() -> None:
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, text="invalid")
        )
    ) as http:
        with pytest.raises(ValueError):
            HTTPEmbeddingProvider("http://ai-service", client=http).embed(
                "Soup", PROFILE
            )


def test_configuration_uses_gateway_url_and_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_GATEWAY_URL", " http://ai-gateway:8000/ ")
    settings = Settings(_env_file=None)
    client = EmbeddingClient.from_settings(settings)
    try:
        assert settings.ai_gateway_url == "http://ai-gateway:8000"
        assert client.available
        assert client.profile == PROFILE
        assert isinstance(client.provider, HTTPEmbeddingProvider)
        assert client.provider.client.timeout.connect == 5.0
        assert client.provider.client.timeout.read == 35.0
    finally:
        client.close()


@pytest.mark.parametrize("url", [None, "", "  "])
def test_missing_url_disables_generation(url: str | None) -> None:
    client = EmbeddingClient.from_settings(Settings(_env_file=None, ai_gateway_url=url))
    assert not client.available
    with pytest.raises(RuntimeError, match="AI_GATEWAY_URL"):
        client.embed("Soup", PROFILE)
    client.close()


@pytest.mark.parametrize(
    "url",
    [
        "ftp://ai-service",
        "http://user:password@ai-service",
        "http://ai-service/path",
        "http://ai-service?query=1",
        "http://ai-service#fragment",
        "http://ai-service:0",
    ],
)
def test_invalid_gateway_origin_is_rejected(url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_gateway_url=url)
