"""Register all domain models with the shared SQLAlchemy metadata."""

from app.foodstuffs.models.embedding import FoodstuffEmbedding
from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.image_upload import FoodstuffImageUpload
from app.identity.models.application_session import ApplicationSession
from app.identity.models.delegation_token import DelegationToken
from app.identity.models.login_transaction import LoginTransaction
from app.identity.models.user import User
from app.images.models import ImageAsset
from app.recipes.models.embedding import RecipeEmbedding
from app.recipes.models.image_upload import RecipeImageUpload
from app.recipes.models.recipe import Ingredient, RecipeLineage, RecipeVersion, Step

__all__ = [
    "ApplicationSession",
    "DelegationToken",
    "Foodstuff",
    "FoodstuffEmbedding",
    "FoodstuffImageUpload",
    "ImageAsset",
    "Ingredient",
    "LoginTransaction",
    "RecipeEmbedding",
    "RecipeImageUpload",
    "RecipeLineage",
    "RecipeVersion",
    "Step",
    "User",
]
