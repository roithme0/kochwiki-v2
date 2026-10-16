from fastapi import APIRouter

from app.api.routes import meta
from app.identity.routes import auth, users
from app.foodstuffs.routes import foodstuffs
from app.recipes.routes import recipe_images, recipe_proposals, recipes

router = APIRouter()
router.include_router(auth.router)
router.include_router(foodstuffs.router)
router.include_router(recipes.router)
router.include_router(recipe_proposals.router)
router.include_router(recipe_images.router)
router.include_router(users.router)
router.include_router(meta.router)
