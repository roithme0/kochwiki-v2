from fastapi import APIRouter

from app.api.routes import auth, foodstuffs, meta, users
from app.recipes.routes import recipe_images, recipe_proposals, recipes

router = APIRouter()
router.include_router(auth.router)
router.include_router(foodstuffs.router)
router.include_router(recipes.router)
router.include_router(recipe_proposals.router)
router.include_router(recipe_images.router)
router.include_router(users.router)
router.include_router(meta.router)
