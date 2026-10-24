"""Register all domain models with the shared SQLAlchemy metadata."""

from app.identity.models.application_session import ApplicationSession
from app.identity.models.delegation_token import DelegationToken
from app.foodstuffs.models.embedding import FoodstuffEmbedding
from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step
from app.recipes.models.embedding import RecipeEmbedding
from app.recipes.models.image_upload import RecipeImageUpload
from app.images.models import ImageAsset
from app.identity.models.user import User
from app.identity.models.login_transaction import LoginTransaction

__all__ = [
    "ApplicationSession",
    "DelegationToken",
    "FoodstuffEmbedding",
    "Foodstuff",
    "Ingredient",
    "RecipeLineage",
    "RecipeVersion",
    "RecipeEmbedding",
    "RecipeImageUpload",
    "ImageAsset",
    "Step",
    "User",
    "LoginTransaction",
]
