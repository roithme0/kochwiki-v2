"""Register all domain models with the shared SQLAlchemy metadata."""

from app.models.application_session import ApplicationSession
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step
from app.recipes.models.recipe_embedding import RecipeEmbedding
from app.recipes.models.recipe_image import RecipeImage
from app.models.user import User
from app.models.login_transaction import LoginTransaction

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
