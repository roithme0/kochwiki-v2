from fastapi import APIRouter

from app.api import greeting, meta
from app.conversations import routes as conversations
from app.identity.routes import auth
from app.foodstuffs.routes import foodstuffs
from app.foodstuffs.routes import images as foodstuff_images
from app.recipes.routes import images as recipe_images
from app.recipes.routes import proposals, recipes

router = APIRouter()
router.include_router(conversations.router)
router.include_router(auth.router)
router.include_router(foodstuffs.router)
router.include_router(foodstuff_images.router)
router.include_router(recipes.router)
router.include_router(proposals.router)
router.include_router(recipe_images.router)
router.include_router(meta.router)
router.include_router(greeting.router)
