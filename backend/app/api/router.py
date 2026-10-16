from fastapi import APIRouter

from app.api import greeting, meta
from app.identity.routes import auth, users
from app.foodstuffs.routes import foodstuffs
from app.recipes.routes import images, proposals, recipes

router = APIRouter()
router.include_router(auth.router)
router.include_router(foodstuffs.router)
router.include_router(recipes.router)
router.include_router(proposals.router)
router.include_router(images.router)
router.include_router(users.router)
router.include_router(meta.router)
router.include_router(greeting.router)
