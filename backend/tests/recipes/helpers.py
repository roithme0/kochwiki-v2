from sqlalchemy import select
from sqlalchemy.orm import Session

from app.infrastructure.database.session import SessionLocal
from app.identity.models.user import User
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


def recipe_owner_id(session: Session | None = None) -> int:
    if session is None:
        with SessionLocal() as connection:
            return recipe_owner_id(connection)
    with session.no_autoflush:
        owner_id = session.scalar(select(User.id).where(User.subject == "recipe-fixture-owner"))
    assert owner_id is not None
    return owner_id
