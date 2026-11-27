import subprocess
import sys
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Queue
from socket import socket
from threading import Thread
from time import monotonic
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import (
    ExportMetricsServiceRequest,
)
from opentelemetry.proto.metrics.v1.metrics_pb2 import (
    AGGREGATION_TEMPORALITY_CUMULATIVE,
)
from opentelemetry.sdk.metrics.export import (
    Histogram,
    InMemoryMetricReader,
    Metric,
    MetricExporter,
    PeriodicExportingMetricReader,
)

from app.core.exceptions import NotFoundError
from app.identity.schemas.user import UserOut
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.metrics import metrics
from app.infrastructure.metrics.config import MetricsConfig
from app.main import create_app
from app.recipes.services.recipes import get_active_recipe_version

ENDPOINT = "http://127.0.0.1:1/otlp/v1/metrics"
TOKEN = "private-metrics-token"
INVALID_METRICS_PATH = (
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must end in /otlp/v1/metrics"
    " without a query or fragment"
)


@pytest.fixture
def metrics_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", ENDPOINT)
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", TOKEN)
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")


@pytest.fixture
def metric_reader(
    monkeypatch: pytest.MonkeyPatch, metrics_environment: None
) -> InMemoryMetricReader:
    reader = InMemoryMetricReader()

    def memory_reader(
        exporter: MetricExporter, *, export_interval_millis: float
    ) -> InMemoryMetricReader:
        return reader

    monkeypatch.setattr(metrics, "PeriodicExportingMetricReader", memory_reader)
    return reader


def _read_metrics(reader: InMemoryMetricReader) -> dict[str, Metric]:
    data = reader.get_metrics_data()
    assert data is not None
    return {
        metric.name: metric
        for resource in data.resource_metrics
        for scope in resource.scope_metrics
        for metric in scope.metrics
    }


def test_request_duration_labels_aggregate_and_exclude_non_api_routes(
    metric_reader: InMemoryMetricReader,
    sign_in: Callable[[TestClient], UserOut],
) -> None:
    app = create_app()

    @app.get("/test-failure")
    def failure() -> None:
        raise RuntimeError("failure")

    with TestClient(
        app, raise_server_exceptions=False, headers={"Origin": "http://localhost:8000"}
    ) as client:
        sign_in(client)
        for private_value in ("first", "second"):
            assert (
                client.get(
                    f"/recipes/{uuid4()}?secret={private_value}",
                    headers={"X-Secret": private_value},
                ).status_code
                == HTTPStatus.NOT_FOUND
            )
        assert (
            client.get("/recipes/not-a-uuid").status_code
            == HTTPStatus.UNPROCESSABLE_CONTENT
        )
        assert (
            client.get("/test-failure").status_code == HTTPStatus.INTERNAL_SERVER_ERROR
        )
        assert client.get("/missing-private").status_code == HTTPStatus.NOT_FOUND
        assert client.get("/meta/version").status_code == HTTPStatus.OK
        assert (
            client.request("BREW", "/meta/version").status_code
            == HTTPStatus.METHOD_NOT_ALLOWED
        )
        assert client.get("/auth/me").status_code == HTTPStatus.OK
        for path in (
            "/mcp",
            "/mcp/",
            "/mcp/private",
            "/api/docs",
            "/api/openapi.json",
            "/redoc",
            "/docs/oauth2-redirect",
        ):
            client.get(path, follow_redirects=False)

        collected = _read_metrics(metric_reader)

    http_metrics = {name for name in collected if name.startswith("http.")}
    assert http_metrics == {"http.server.request.duration"}
    duration = collected["http.server.request.duration"]
    assert duration.unit == "s"
    assert isinstance(duration.data, Histogram)
    assert len(duration.data.data_points) == 7
    assert all(
        point.attributes.get("url.scheme", "http") == "http"
        for point in duration.data.data_points
    )
    assert {
        frozenset(
            (key, value)
            for key, value in point.attributes.items()
            if key != "url.scheme"
        ): point.count
        for point in duration.data.data_points
    } == {
        frozenset(
            {
                "http.request.method": method,
                "http.response.status_code": status,
                **({"http.route": route} if route is not None else {}),
            }.items()
        ): count
        for method, route, status, count in (
            ("GET", "/recipes/{lineage_id}", 404, 2),
            ("GET", "/recipes/{lineage_id}", 422, 1),
            ("GET", "/test-failure", 500, 1),
            ("GET", None, 404, 1),
            ("GET", "/meta/version", 200, 1),
            ("_OTHER", "/meta/version", 405, 1),
            ("GET", "/auth/me", 200, 1),
        )
    }


def test_app_lifespan_exports_postgresql_duration_histograms(
    metric_reader: InMemoryMetricReader,
) -> None:
    with TestClient(create_app()):
        with SessionLocal() as session, pytest.raises(NotFoundError):
            get_active_recipe_version(session, uuid4())

        collected = _read_metrics(metric_reader)

    assert collected.keys() == {
        "kochwiki.postgresql.connection.acquisition.duration",
        "kochwiki.postgresql.query.execution.duration",
    }
    for name, attributes in (
        ("kochwiki.postgresql.connection.acquisition.duration", {"outcome": "success"}),
        (
            "kochwiki.postgresql.query.execution.duration",
            {"query.name": "Get active recipe version", "outcome": "success"},
        ),
    ):
        metric = collected[name]
        assert metric.unit == "s"
        assert isinstance(metric.data, Histogram)
        (point,) = metric.data.data_points
        assert point.attributes == attributes
        assert point.explicit_bounds == (0.005, 0.02, 0.1, 0.5)
        assert point.count == 1


@pytest.mark.parametrize("endpoint", [None, ""])
def test_export_is_opt_in(
    monkeypatch: pytest.MonkeyPatch, endpoint: str | None
) -> None:
    if endpoint is None:
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", raising=False)
    else:
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", endpoint)

    assert MetricsConfig.from_environment() is None


@pytest.mark.parametrize(
    "variable,value,diagnostic",
    [
        (
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
            "http://localhost:4318/",
            INVALID_METRICS_PATH,
        ),
        (
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
            f"{ENDPOINT}?query=value",
            INVALID_METRICS_PATH,
        ),
        (
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
            f"{ENDPOINT}#fragment",
            INVALID_METRICS_PATH,
        ),
        (
            "DEPLOYMENT_ENVIRONMENT_NAME",
            "",
            "DEPLOYMENT_ENVIRONMENT_NAME must be set",
        ),
        *(
            (
                "OTEL_METRICS_BEARER_TOKEN",
                token,
                "OTEL_METRICS_BEARER_TOKEN must be a raw bearer token",
            )
            for token in ("", f"Bearer {TOKEN}", "token%20value", " token", "token\n")
        ),
    ],
)
def test_invalid_export_settings_are_rejected(
    monkeypatch: pytest.MonkeyPatch,
    metrics_environment: None,
    variable: str,
    value: str,
    diagnostic: str,
) -> None:
    monkeypatch.setenv(variable, value)
    with pytest.raises(ValueError) as error:
        MetricsConfig.from_environment()
    assert str(error.value) == diagnostic


def test_legacy_headers_do_not_supply_a_bearer_token(
    monkeypatch: pytest.MonkeyPatch, metrics_environment: None
) -> None:
    monkeypatch.delenv("OTEL_METRICS_BEARER_TOKEN")
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_HEADERS", "Authorization=Bearer%20token"
    )

    with pytest.raises(ValueError, match="must be a raw bearer token"):
        MetricsConfig.from_environment()


def test_periodic_otlp_exports_identify_concurrent_instances(
    monkeypatch: pytest.MonkeyPatch, metrics_environment: None
) -> None:
    received: Queue[tuple[str, str | None, str | None, bytes]] = Queue()

    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            received.put(
                (
                    self.path,
                    self.headers.get("Authorization"),
                    self.headers.get("Content-Type"),
                    self.rfile.read(int(self.headers["Content-Length"])),
                )
            )
            self.send_response(200)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            pass

    def fast_reader(
        exporter: MetricExporter, *, export_interval_millis: float
    ) -> PeriodicExportingMetricReader:
        return PeriodicExportingMetricReader(exporter, export_interval_millis=100)

    monkeypatch.setattr(metrics, "PeriodicExportingMetricReader", fast_reader)
    monkeypatch.setenv("OTEL_METRICS_EXEMPLAR_FILTER", "always_on")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE", "DELTA")
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION",
        "BASE2_EXPONENTIAL_BUCKET_HISTOGRAM",
    )

    with ThreadingHTTPServer(("127.0.0.1", 0), Receiver) as server:
        monkeypatch.setenv(
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
            f"http://127.0.0.1:{server.server_port}/otlp/v1/metrics",
        )
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "staging")
            first_app, second_app = create_app(), create_app()
            with (
                TestClient(first_app) as first_client,
                TestClient(second_app) as second_client,
            ):
                assert first_client.get("/meta/version").status_code == HTTPStatus.OK
                assert second_client.get("/missing").status_code == HTTPStatus.NOT_FOUND

                instances: dict[int, str] = {}
                deadline = monotonic() + 5
                while len(instances) < 2:
                    remaining = deadline - monotonic()
                    assert remaining > 0, instances
                    path, authorization, content_type, body = received.get(
                        timeout=remaining
                    )
                    assert path == "/otlp/v1/metrics"
                    assert authorization == f"Bearer {TOKEN}"
                    assert content_type == "application/x-protobuf"

                    request = ExportMetricsServiceRequest.FromString(body)
                    (resource,) = request.resource_metrics
                    attributes = {
                        item.key: item.value.string_value
                        for item in resource.resource.attributes
                    }
                    assert attributes["deployment.environment.name"] == "staging"
                    assert attributes["service.namespace"] == "personal"
                    assert attributes["service.name"] == "kochwiki"
                    assert attributes["service.version"] == first_app.version
                    instance = attributes["service.instance.id"]
                    assert instance

                    (duration,) = [
                        metric
                        for scope in resource.scope_metrics
                        for metric in scope.metrics
                    ]
                    assert duration.name == "http.server.request.duration"
                    assert duration.HasField("histogram")
                    assert (
                        duration.histogram.aggregation_temporality
                        == AGGREGATION_TEMPORALITY_CUMULATIVE
                    )
                    (point,) = duration.histogram.data_points
                    assert list(point.explicit_bounds) == [0.05, 0.2, 0.5]
                    assert len(point.bucket_counts) == 4
                    assert not point.exemplars
                    (status,) = (
                        item.value.int_value
                        for item in point.attributes
                        if item.key == "http.response.status_code"
                    )
                    assert status in {200, 404}
                    assert instances.setdefault(status, instance) == instance

                assert instances[200] != instances[404]

        finally:
            server.shutdown()
            thread.join()


def test_unreachable_receiver_leaves_api_and_shutdown_available(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    metrics_environment: None,
) -> None:
    with socket() as receiver:
        receiver.bind(("127.0.0.1", 0))
        port = receiver.getsockname()[1]
        monkeypatch.setenv(
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
            f"http://127.0.0.1:{port}/otlp/v1/metrics",
        )
        start = monotonic()
        with TestClient(create_app()) as client:
            assert client.get("/meta/version").status_code == HTTPStatus.OK
        assert monotonic() - start < 6

    assert "Failed to export metrics batch" in caplog.text


@pytest.mark.parametrize(
    "endpoint,level,message",
    [
        ("", "INFO:", "Metrics export disabled because"),
        (
            "http://user:private-password@localhost:4318/otlp/v1/metrics",
            "ERROR:",
            "Metrics export disabled due to invalid configuration. "
            "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT must be a valid HTTP(S) URL without credentials",
        ),
        (ENDPOINT, "INFO:", "Request duration metrics export enabled"),
    ],
)
def test_uvicorn_logs_metrics_status_without_secrets(
    monkeypatch: pytest.MonkeyPatch,
    metrics_environment: None,
    endpoint: str,
    level: str,
    message: str,
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", endpoint)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            """
from fastapi.testclient import TestClient
from uvicorn import Config

config = Config("app.main:app")
config.load()
assert TestClient(config.loaded_app).get("/meta/version").status_code == 200
""",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )
    assert any(
        line.startswith(level) and message in line
        for line in result.stderr.splitlines()
    ), result.stderr
    assert TOKEN not in result.stderr
    assert "private-password" not in result.stderr


@pytest.mark.parametrize("endpoint", ["", ENDPOINT])
def test_malformed_instrumentor_environment_keeps_api_available(
    monkeypatch: pytest.MonkeyPatch, metrics_environment: None, endpoint: str
) -> None:
    monkeypatch.setenv("OTEL_PYTHON_FASTAPI_EXCLUDED_URLS", "[")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", endpoint)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            """
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    assert client.get("/meta/version").status_code == 200
""",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
