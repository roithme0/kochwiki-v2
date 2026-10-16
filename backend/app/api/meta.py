from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.core.config import get_settings

router = APIRouter()


@router.get("/meta/version", response_class=PlainTextResponse)
def get_version() -> str:
    return get_settings().app_version
