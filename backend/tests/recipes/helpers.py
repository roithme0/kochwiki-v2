from sqlalchemy.orm import Session

from app.identity.schemas.oidc import Identity
from app.identity.services.users import map_identity
from app.recipes.models.recipe import RecipeVersion
from app.recipes.schemas.recipe import RecipeVersionWrite
from app.recipes.services.recipes import create_recipe


def create_owned_recipe(session: Session, payload: RecipeVersionWrite) -> RecipeVersion:
    owner = map_identity(session, Identity(
        iss="http://localhost:8006/realms/services", sub="recipe-fixture-owner",
        email="recipe-owner@example.invalid", email_verified=False,
        displayName="Recipe owner", nonce="test-fixture",
    ))
    return create_recipe(session, payload, owner_id=owner.id)
