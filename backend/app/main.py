from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import router
from app.core.config import get_settings
from app.services.exceptions import DomainError

settings = get_settings()
app = FastAPI(
    title="Kochwiki API",
    version=settings.app_version,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(DomainError)
async def handle_domain_error(_: Request, error: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"statusCode": error.status_code, "message": error.message},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _: Request, error: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "statusCode": 422,
            "message": "Validation failed",
            "details": jsonable_encoder(error.errors()),
        },
    )


app.include_router(router)


@app.get("/")
async def hello_world() -> dict[str, str]:
    return {"message": "Hello World"}
