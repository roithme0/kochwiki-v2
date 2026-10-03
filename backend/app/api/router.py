from fastapi import APIRouter

from app.api.routes import foodstuffs, meta, recipe_proposals, recipes, users

router = APIRouter()
router.include_router(foodstuffs.router)
router.include_router(recipes.router)
router.include_router(recipe_proposals.router)
router.include_router(users.router)
router.include_router(meta.router)
