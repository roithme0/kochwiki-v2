import time
from uuid import uuid4
from collections.abc import Callable
from app.identity.schemas.user import UserOut

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.metrics.export import (
    Histogram,
    HistogramDataPoint,
    InMemoryMetricReader,
    MetricExporter,
)

from app.infrastructure.metrics import metrics
from app.main import create_app


def test_duration_series_and_exclusions(
    monkeypatch: pytest.MonkeyPatch, sign_in: Callable[[TestClient], UserOut]
) -> None:
    reader = InMemoryMetricReader()
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "http://localhost:1/otlp/v1/metrics"
    )
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", "test-token")
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")

    def memory_reader(
        exporter: MetricExporter, **kwargs: object
    ) -> InMemoryMetricReader:
        return reader

    monkeypatch.setattr(metrics, "PeriodicExportingMetricReader", memory_reader)
    app = create_app()

    @app.get("/test-failure")
    def failure() -> None:
        raise RuntimeError("failure")

    with TestClient(
        app, raise_server_exceptions=False, headers={"Origin": "http://localhost:8000"}
    ) as client:
        sign_in(client)
        for _ in range(2):
            assert (
                client.get(
                    f"/recipes/{uuid4()}?secret=private",
                    headers={"X-Secret": "private"},
                ).status_code
                == 404
            )
        assert client.get("/recipes/not-a-uuid").status_code == 422
        assert client.get("/test-failure").status_code == 500
        assert client.get("/missing-private").status_code == 404
        assert client.get("/meta/version").status_code == 200
        assert client.request("BREW", "/meta/version").status_code == 405
        client.get("/auth/me")
        for path in (
            "/mcp",
            "/mcp/",
            "/mcp/private",
            "/api/docs",
            "/api/openapi.json",
            "/docs/oauth2-redirect",
        ):
            client.get(path, follow_redirects=False)
        data = reader.get_metrics_data()
        assert data is not None
        found = [
            metric
            for resource in data.resource_metrics
            for scope in resource.scope_metrics
            for metric in scope.metrics
        ]
        assert len(found) == 1
        metric = found[0]
        assert metric.name == "http.server.request.duration"
        assert metric.unit == "s"
        assert isinstance(metric.data, Histogram)
        points = list(metric.data.data_points)
        assert all(
            set(point.attributes)
            <= {
                "http.request.method",
                "http.route",
                "http.response.status_code",
                "url.scheme",
            }
            for point in points
        )

        def matching(route: str | None, status: int) -> list[HistogramDataPoint]:
            return [
                point
                for point in points
                if point.attributes.get("http.route") == route
                and point.attributes.get("http.response.status_code") == status
            ]

        assert len(matching("/recipes/{lineage_id}", 404)) == 1
        assert matching("/recipes/{lineage_id}", 404)[0].count == 2
        assert matching("/recipes/{lineage_id}", 422)[0].count == 1
        assert matching("/test-failure", 500)[0].count == 1
        assert matching(None, 404)[0].count == 1
        assert matching("/meta/version", 200)[0].count == 1
        assert (
            matching("/meta/version", 200)[0].attributes["http.request.method"] == "GET"
        )
        assert (
            matching("/meta/version", 405)[0].attributes["http.request.method"]
            == "_OTHER"
        )
        assert any(point.attributes.get("http.route") == "/auth/me" for point in points)
        assert all("private" not in str(point.attributes) for point in points)
        assert sum(point.count for point in points) == 8


@pytest.mark.parametrize("endpoint", [None, "", "invalid"])
def test_disabled_or_invalid_export_preserves_api(
    monkeypatch: pytest.MonkeyPatch, endpoint: str | None
) -> None:
    if endpoint is None:
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", raising=False)
    else:
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", endpoint)
    start = time.monotonic()
    with TestClient(create_app()) as client:
        assert client.get("/meta/version").status_code == 200
    assert time.monotonic() - start < 5


def test_otlp_wire_export_and_unique_instances(monkeypatch: pytest.MonkeyPatch) -> None:
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import (
        ExportMetricsServiceRequest,
    )
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

    received: list[tuple[str, str | None, str | None, bytes]] = []

    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = self.rfile.read(int(self.headers["Content-Length"]))
            received.append(
                (
                    self.path,
                    self.headers.get("Authorization"),
                    self.headers.get("Content-Type"),
                    body,
                )
            )
            self.send_response(200)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
        f"http://127.0.0.1:{server.server_port}/otlp/v1/metrics",
    )
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", "test-token")
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")
    monkeypatch.setenv("OTEL_METRICS_EXEMPLAR_FILTER", "always_on")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE", "DELTA")
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION",
        "BASE2_EXPONENTIAL_BUCKET_HISTOGRAM",
    )

    def fast_reader(
        exporter: MetricExporter, **kwargs: object
    ) -> PeriodicExportingMetricReader:
        return PeriodicExportingMetricReader(
            exporter, export_interval_millis=100, export_timeout_millis=3000
        )

    monkeypatch.setattr(metrics, "PeriodicExportingMetricReader", fast_reader)
    try:
        app1, app2 = create_app(), create_app()
        with TestClient(app1) as client1, TestClient(app2) as client2:
            assert client1.get("/meta/version").status_code == 200
            assert client2.get("/meta/version").status_code == 200
            deadline = time.monotonic() + 5

            def live_instances() -> set[str]:
                return {
                    item.value.string_value
                    for _, _, _, body in list(received)
                    for resource in ExportMetricsServiceRequest.FromString(
                        body
                    ).resource_metrics
                    for item in resource.resource.attributes
                    if item.key == "service.instance.id"
                }

            while len(live_instances()) < 2 and time.monotonic() < deadline:
                time.sleep(0.05)
            assert len(live_instances()) == 2
            periodic_exports = list(received)
        instances: set[str] = set()
        for path, authorization, content_type, body in periodic_exports:
            assert path == "/otlp/v1/metrics"
            assert authorization == "Bearer test-token"
            assert content_type == "application/x-protobuf"
            request = ExportMetricsServiceRequest.FromString(body)
            for resource in request.resource_metrics:
                attrs = {
                    item.key: item.value.string_value
                    for item in resource.resource.attributes
                }
                assert attrs["service.namespace"] == "personal"
                assert attrs["service.name"] == "kochwiki"
                assert attrs["service.version"] == app1.version
                assert attrs["deployment.environment.name"] == "test"
                instances.add(attrs["service.instance.id"])
                for scope in resource.scope_metrics:
                    for metric in scope.metrics:
                        assert metric.name == "http.server.request.duration"
                        assert metric.HasField("histogram")
                        assert metric.histogram.aggregation_temporality == 2
                        assert all(
                            point.explicit_bounds and not point.exemplars
                            for point in metric.histogram.data_points
                        )
        assert len(instances) == 2
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_unreachable_receiver_keeps_api_and_shutdown_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "http://127.0.0.1:1/otlp/v1/metrics"
    )
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", "test-token")
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")
    start = time.monotonic()
    with TestClient(create_app()) as client:
        assert client.get("/meta/version").status_code == 200
    assert time.monotonic() - start < 6


@pytest.mark.parametrize(
    "endpoint,token",
    [
        (
            "http://user:password@localhost:4318/otlp/v1/metrics",
            "token",
        ),
        ("http://localhost:bad/otlp/v1/metrics", "token"),
        ("http://localhost:0/otlp/v1/metrics", "token"),
        ("http://localhost:4318/otlp/v1/metrics", "malformed secret value"),
    ],
)
def test_invalid_settings_are_redacted_and_do_not_break_api(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    endpoint: str,
    token: str,
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", endpoint)
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", token)
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")
    with TestClient(create_app()) as client:
        assert client.get("/meta/version").status_code == 200
    assert "Invalid metrics configuration; metrics export disabled" in caplog.text
    assert "malformed secret value" not in caplog.text
    assert "password" not in caplog.text


@pytest.mark.parametrize("enabled", [False, True])
def test_malformed_instrumentor_environment_does_not_break_import_or_api(
    enabled: bool,
) -> None:
    import os
    import subprocess
    import sys

    env = os.environ.copy()
    env["OTEL_PYTHON_FASTAPI_EXCLUDED_URLS"] = "["
    env["OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"] = (
        "http://127.0.0.1:1/otlp/v1/metrics" if enabled else ""
    )
    env["OTEL_METRICS_BEARER_TOKEN"] = "token"
    env["DEPLOYMENT_ENVIRONMENT_NAME"] = "test"
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from fastapi.testclient import TestClient; from app.main import create_app; c = TestClient(create_app()); assert c.get('/meta/version').status_code == 200",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "token", ["", "Bearer token", "token%20value", " token", "token\n"]
)
def test_invalid_bearer_token_disables_export(
    monkeypatch: pytest.MonkeyPatch, token: str
) -> None:
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "http://localhost:4318/otlp/v1/metrics"
    )
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")
    monkeypatch.setenv("OTEL_METRICS_BEARER_TOKEN", token)
    assert metrics.create_metrics_provider("test") is None


def test_legacy_headers_do_not_enable_export(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "http://localhost:4318/otlp/v1/metrics"
    )
    monkeypatch.setenv("DEPLOYMENT_ENVIRONMENT_NAME", "test")
    monkeypatch.delenv("OTEL_METRICS_BEARER_TOKEN", raising=False)
    monkeypatch.setenv(
        "OTEL_EXPORTER_OTLP_METRICS_HEADERS", "Authorization=Bearer%20token"
    )
    assert metrics.create_metrics_provider("test") is None
