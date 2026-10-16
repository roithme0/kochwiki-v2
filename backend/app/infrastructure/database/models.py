"""Register all domain models with the shared SQLAlchemy metadata."""

from app.identity.models.application_session import ApplicationSession
from app.foodstuffs.models.embedding import FoodstuffEmbedding
from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step
from app.recipes.models.recipe_embedding import RecipeEmbedding
from app.recipes.models.recipe_image import RecipeImage
from app.identity.models.user import User
from app.identity.models.login_transaction import LoginTransaction

__all__ = [
    "ApplicationSession",
    "FoodstuffEmbedding",
    "Foodstuff",
    "Ingredient",
    "RecipeLineage",
    "RecipeVersion",
    "RecipeEmbedding",
    "RecipeImage",
    "Step",
    "User",
    "LoginTransaction",
]
