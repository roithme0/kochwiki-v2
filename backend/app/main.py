from collections.abc import AsyncIterator
from contextlib import ExitStack, asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.embeddings import EmbeddingClient
from app.services.foodstuff_embeddings import FoodstuffEmbeddingService
from app.services.embedding_refresh import EmbeddingRefreshWorker
from app.services.foodstuff_refresh import foodstuff_refresh as foodstuff_refresh_coordinator
from app.services.foodstuff_search import FoodstuffSemanticSearch
from app.services.recipe_embeddings import RecipeEmbeddingService
from app.services.recipe_refresh import recipe_refresh as recipe_refresh_coordinator
from app.mcp_server import MCPServices, create_mcp_server
from app.schemas.errors import ErrorResponse
from app.services import greeting
from app.services.exceptions import DomainError


async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
    body = ErrorResponse(detail=error.message)
    return JSONResponse(
        status_code=error.status_code,
        content=body.model_dump(mode="json"),
    )


async def hello_world() -> dict[str, str]:
    return greeting.hello_world()


def create_app() -> FastAPI:
    settings = get_settings()
    mcp_services = MCPServices()
    server, mcp_app = create_mcp_server(mcp_services)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        with ExitStack() as cleanup:
            embeddings = EmbeddingClient.from_settings(settings)
            cleanup.callback(embeddings.close)
            mcp_services.bind_foodstuff_search(FoodstuffSemanticSearch(SessionLocal, embeddings))
            cleanup.callback(mcp_services.bind_foodstuff_search, None)
            if embeddings.available:
                foodstuff_refresh_service = FoodstuffEmbeddingService(SessionLocal, embeddings)
                foodstuff_worker: EmbeddingRefreshWorker[int] = EmbeddingRefreshWorker(
                    foodstuff_refresh_service.refresh_one,
                    lambda: foodstuff_refresh_service.refresh_all(foodstuff_worker.is_stopping),
                    coordinator=foodstuff_refresh_coordinator)
                cleanup.callback(foodstuff_worker.stop)
                foodstuff_worker.start()
                recipe_refresh_service = RecipeEmbeddingService(SessionLocal, embeddings)
                recipe_worker: EmbeddingRefreshWorker[UUID] = EmbeddingRefreshWorker(
                    recipe_refresh_service.refresh_one,
                    lambda: recipe_refresh_service.refresh_all(recipe_worker.is_stopping),
                    coordinator=recipe_refresh_coordinator)
                cleanup.callback(recipe_worker.stop)
                recipe_worker.start()
            async with server.session_manager.run():
                yield

    application = FastAPI(
        title="Kochwiki API",
        version=settings.app_version,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    application.add_exception_handler(DomainError, handle_domain_error)
    application.include_router(router)
    application.get("/")(hello_world)
    application.mount("/mcp", mcp_app)
    return application


app = create_app()
