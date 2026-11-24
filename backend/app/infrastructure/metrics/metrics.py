import logging
import os
import re
from uuid import uuid4

from fastapi import FastAPI
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import AlwaysOffExemplarFilter, Histogram, MeterProvider
from opentelemetry.sdk.metrics.export import (
    AggregationTemporality,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.metrics.view import (
    DropAggregation,
    ExplicitBucketHistogramAggregation,
    View,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.trace import NoOpTracerProvider

from .config import MetricsConfig

logger = logging.getLogger(__name__)


def create_metrics_provider(version: str) -> MeterProvider | None:
    try:
        config = MetricsConfig.from_environment()
        if config is None:
            return None
        exporter = OTLPMetricExporter(
            endpoint=config.endpoint,
            headers={
                "authorization": f"Bearer {config.bearer_token.get_secret_value()}"
            },
            timeout=3,
            preferred_temporality={Histogram: AggregationTemporality.CUMULATIVE},
        )
        reader = PeriodicExportingMetricReader(exporter, export_interval_millis=60000)
        return MeterProvider(
            metric_readers=[reader],
            exemplar_filter=AlwaysOffExemplarFilter(),
            resource=Resource.create(
                {
                    "service.namespace": "personal",
                    "service.name": "kochwiki",
                    "service.version": version,
                    "service.instance.id": str(uuid4()),
                    "deployment.environment.name": config.environment,
                }
            ),
            views=[
                View(instrument_name="*", aggregation=DropAggregation()),
                View(
                    instrument_name="http.server.request.duration",
                    aggregation=ExplicitBucketHistogramAggregation(),
                    attribute_keys={
                        "http.request.method",
                        "http.route",
                        "http.response.status_code",
                        "url.scheme",
                    },
                ),
            ],
        )
    except Exception:
        logger.warning("Invalid metrics configuration; metrics export disabled")
        return None


def instrument_metrics(app: FastAPI, provider: MeterProvider) -> None:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    os.environ["OTEL_SEMCONV_STABILITY_OPT_IN"] = "http"
    excluded = [r"^https?://[^/]+/mcp(?:/|$)"]
    for path in (
        app.docs_url,
        app.redoc_url,
        app.openapi_url,
        app.swagger_ui_oauth2_redirect_url,
    ):
        if path:
            excluded.append(r"^https?://[^/]+" + re.escape(path) + r"$")
    FastAPIInstrumentor.instrument_app(
        app,
        meter_provider=provider,
        tracer_provider=NoOpTracerProvider(),
        excluded_urls=",".join(excluded),
    )
