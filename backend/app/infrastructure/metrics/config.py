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
        _validate_metrics_endpoint(endpoint, environment)
        if not environment:
            raise ValueError("Missing deployment environment")
        token = os.getenv("OTEL_METRICS_BEARER_TOKEN", "")
        if not re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token):
            raise ValueError("Invalid metrics authorization")
        return cls(endpoint, environment, SecretStr(token))


def _validate_metrics_endpoint(endpoint: str, environment: str) -> None:
    url = validate_http_url(endpoint)
    if url.path != "/otlp/v1/metrics" or url.query or url.fragment:
        raise ValueError("Invalid metrics endpoint")
    if environment in {"staging", "production"} and url.scheme != "https":
        raise ValueError("Deployed metrics require HTTPS and authorization")
