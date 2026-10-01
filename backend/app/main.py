from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import router
from app.core.config import get_settings
from app.mcp_server import create_mcp_server
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
    server, mcp_app = create_mcp_server()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
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
