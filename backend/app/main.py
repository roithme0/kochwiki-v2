import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import ExitStack, asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import router
from app.identity.logging import configure_auth_logging
from app.core.config import get_settings
from app.infrastructure.database.metrics import observe_postgresql
from app.infrastructure.database.session import engine
from app.infrastructure.mcp.server import create_mcp_server
from app.infrastructure.metrics import create_metrics_provider, instrument_metrics
from app.infrastructure.mcp.services import MCPServices
from app.core.schemas.errors import ErrorResponse
from app.infrastructure.embeddings.lifecycle import (
    embedding_refresh_workers,
    semantic_search_services,
)
from app.core.exceptions import DomainError
from app.recipes.services.proposal_store import RecipeProposalStore
from app.images.dependencies import ImageStoragePool

logger = logging.getLogger("uvicorn.error.metrics")


async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
    body = ErrorResponse(detail=error.message)
    return JSONResponse(
        status_code=error.status_code,
        content=body.model_dump(mode="json"),
    )


def create_app() -> FastAPI:
    configure_auth_logging()
    settings = get_settings()
    recipe_proposals = RecipeProposalStore()
    image_storages = ImageStoragePool()
    mcp_services = MCPServices(recipe_proposals)
    mcp_server, mcp_app = create_mcp_server(mcp_services)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            with ExitStack() as stack:
                if metrics_provider is not None and engine.dialect.name == "postgresql":
                    stack.enter_context(
                        observe_postgresql(
                            engine, metrics_provider.get_meter("kochwiki.postgresql")
                        )
                    )
                embeddings = stack.enter_context(
                    semantic_search_services(settings, mcp_services)
                )
                stack.enter_context(embedding_refresh_workers(embeddings))
                async with mcp_server.session_manager.run():
                    yield
        finally:
            if metrics_provider is not None:
                try:
                    await asyncio.to_thread(
                        metrics_provider.shutdown, timeout_millis=4000
                    )
                except Exception:
                    logger.warning("Metrics shutdown failed")
            try:
                image_storages.close()
            finally:
                recipe_proposals.clear()

    application = FastAPI(
        title="Kochwiki API",
        version=settings.app_version,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    application.add_exception_handler(DomainError, handle_domain_error)
    application.state.recipe_proposals = recipe_proposals
    application.state.image_storages = image_storages
    application.include_router(router)
    application.mount("/mcp", mcp_app)
    metrics_provider = create_metrics_provider(settings.app_version)
    if metrics_provider is not None:
        try:
            instrument_metrics(application, metrics_provider)
        except Exception as error:
            logger.error(
                "Metrics export disabled because request instrumentation failed (%s)",
                type(error).__name__,
            )
            try:
                metrics_provider.shutdown(timeout_millis=4000)
            except Exception:
                logger.warning("Metrics shutdown failed")
            metrics_provider = None
    return application


app = create_app()
