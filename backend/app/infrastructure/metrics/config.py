import os
import re
from dataclasses import dataclass

from pydantic import SecretStr

from app.core.urls import validate_http_url


@dataclass(frozen=True)
class MetricsConfig:
    endpoint: str
    environment: str
    bearer_token: SecretStr

    @classmethod
    def from_environment(cls) -> "MetricsConfig | None":
        endpoint = os.getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "").strip()
        if not endpoint:
            return None
        environment = os.getenv("DEPLOYMENT_ENVIRONMENT_NAME", "").strip()
        _validate_metrics_endpoint(endpoint)
        if not environment:
            raise ValueError("DEPLOYMENT_ENVIRONMENT_NAME must be set")
        token = os.getenv("OTEL_METRICS_BEARER_TOKEN", "")
        if not re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token):
            raise ValueError("OTEL_METRICS_BEARER_TOKEN must be a raw bearer token")
        return cls(endpoint, environment, SecretStr(token))


def _validate_metrics_endpoint(endpoint: str) -> None:
    try:
        url = validate_http_url(endpoint)
    except ValueError:
        raise ValueError(
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must be a valid HTTP(S) URL without credentials"
        ) from None
    if url.path != "/otlp/v1/metrics" or "?" in endpoint or "#" in endpoint:
        raise ValueError(
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must end in /otlp/v1/metrics without a query or fragment"
        )
