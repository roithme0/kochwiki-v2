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

from app.infrastructure.database.metrics import (
    ACQUISITION_DURATION,
    DURATION_BUCKETS,
    QUERY_DURATION,
)

from .config import MetricsConfig

logger = logging.getLogger("uvicorn.error.metrics")


def _metrics_views() -> list[View]:
    return [
        View(instrument_name="*", aggregation=DropAggregation()),
        View(
            instrument_name="http.server.request.duration",
            aggregation=ExplicitBucketHistogramAggregation(boundaries=(0.05, 0.2, 0.5)),
            attribute_keys={
                "http.request.method",
                "http.route",
                "http.response.status_code",
                "url.scheme",
            },
        ),
        View(
            instrument_name=ACQUISITION_DURATION,
            aggregation=ExplicitBucketHistogramAggregation(DURATION_BUCKETS),
            attribute_keys={"outcome"},
        ),
        View(
            instrument_name=QUERY_DURATION,
            aggregation=ExplicitBucketHistogramAggregation(DURATION_BUCKETS),
            attribute_keys={"query.name", "outcome"},
        ),
    ]


def _metrics_resource(version: str, environment: str) -> Resource:
    return Resource.create(
        {
            "service.namespace": "personal",
            "service.name": "kochwiki",
            "service.version": version,
            "service.instance.id": str(uuid4()),
            "deployment.environment.name": environment,
        }
    )


def create_metrics_provider(version: str) -> MeterProvider | None:
    try:
        config = MetricsConfig.from_environment()
    except ValueError as error:
        logger.error("Metrics export disabled due to invalid configuration. %s", error)
        return None
    if config is None:
        logger.info(
            "Metrics export disabled because OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is empty"
        )
        return None

    try:
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
            resource=_metrics_resource(version, config.environment),
            views=_metrics_views(),
        )
    except Exception as error:  # noqa: BLE001 - isolate optional service failures
        logger.error(
            "Metrics export disabled because exporter initialization failed (%s)",
            type(error).__name__,
        )
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
    logger.info("Request duration metrics export enabled")
