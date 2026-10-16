from fastapi import APIRouter

from app.core import greeting

router = APIRouter()


@router.get("/")
async def hello_world() -> dict[str, str]:
    return greeting.hello_world()
