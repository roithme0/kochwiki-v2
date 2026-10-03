from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import router
from app.core.config import get_settings
from app.mcp_server import MCPServices, create_mcp_server
from app.schemas.errors import ErrorResponse
from app.semantic_lifecycle import embedding_refresh_workers, semantic_search_services
from app.services import greeting
from app.services.exceptions import DomainError
from app.services.recipe_proposals import RecipeProposalStore


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
    recipe_proposals = RecipeProposalStore()
    mcp_services = MCPServices(recipe_proposals)
    server, mcp_app = create_mcp_server(mcp_services)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            with semantic_search_services(settings, mcp_services) as embeddings:
                with embedding_refresh_workers(embeddings):
                    async with server.session_manager.run():
                        yield
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
    application.include_router(router)
    application.get("/")(hello_world)
    application.mount("/mcp", mcp_app)
    return application


app = create_app()
