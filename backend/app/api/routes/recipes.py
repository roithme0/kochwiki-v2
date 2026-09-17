from collections.abc import Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db, get_write_db
from app.schemas.recipe import (
    IngredientOut,
    RecipePresentationOut,
    RecipePresentationResolve,
    RecipeVersionOut,
    RecipeVersionWrite,
    StepOut,
)
from app.services import recipes

router = APIRouter()


@router.post("/recipe-presentations/resolve", response_model=RecipePresentationOut)
def resolve_recipe_presentation(
    payload: RecipePresentationResolve, session: Session = Depends(get_db)
) -> RecipePresentationOut:
    return recipes.resolve_recipe_presentation(session, payload)


@router.get("/recipes", response_model=list[RecipeVersionOut])
def list_recipe_versions(session: Session = Depends(get_db)) -> Sequence[RecipeVersionOut]:
    return [recipes.recipe_version_out(version) for version in recipes.list_recipe_versions(session)]


@router.get("/recipes/{lineage_id}", response_model=RecipeVersionOut)
def get_active_recipe_version(lineage_id: UUID, session: Session = Depends(get_db)) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.get_active_recipe_version(session, lineage_id))


@router.get("/recipes/{lineage_id}/versions/{version_id}", response_model=RecipeVersionOut)
def get_recipe_version_by_id(lineage_id: UUID, version_id: UUID, session: Session = Depends(get_db)) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.get_recipe_version_by_id(session, lineage_id, version_id))


@router.get("/recipes/{lineage_id}/history", response_model=list[RecipeVersionOut])
def list_historical_recipe_versions(lineage_id: UUID, session: Session = Depends(get_db)) -> Sequence[RecipeVersionOut]:
    return [recipes.recipe_version_out(version) for version in recipes.list_historical_recipe_versions(session, lineage_id)]


@router.post("/recipes", response_model=RecipeVersionOut, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeVersionWrite, session: Session = Depends(get_write_db, scope="function")) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.create_recipe(session, payload))


@router.post("/recipes/{lineage_id}/publish", response_model=RecipeVersionOut)
def publish_active_recipe_edit(
    lineage_id: UUID,
    payload: RecipeVersionWrite,
    session: Session = Depends(get_write_db, scope="function"),
) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.publish_active_recipe_edit(session, lineage_id, payload))


@router.post("/recipes/{lineage_id}/drafts", response_model=RecipeVersionOut, status_code=status.HTTP_201_CREATED)
def create_recipe_draft(
    lineage_id: UUID,
    payload: RecipeVersionWrite,
    session: Session = Depends(get_write_db, scope="function"),
) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.create_recipe_draft(session, lineage_id, payload))


@router.put("/recipes/{lineage_id}/drafts/{version_id}", response_model=RecipeVersionOut)
def update_recipe_draft(
    lineage_id: UUID,
    version_id: UUID,
    payload: RecipeVersionWrite,
    session: Session = Depends(get_write_db, scope="function"),
) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.update_recipe_draft(session, lineage_id, version_id, payload))


@router.post("/recipes/{lineage_id}/drafts/{version_id}/publish", response_model=RecipeVersionOut)
def publish_recipe_draft(
    lineage_id: UUID,
    version_id: UUID,
    session: Session = Depends(get_write_db, scope="function"),
) -> RecipeVersionOut:
    return recipes.recipe_version_out(recipes.publish_recipe_draft(session, lineage_id, version_id))


@router.delete("/recipes/{lineage_id}/drafts/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_recipe_draft(
    lineage_id: UUID,
    version_id: UUID,
    session: Session = Depends(get_write_db, scope="function"),
) -> Response:
    recipes.discard_recipe_draft(session, lineage_id, version_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/recipes/{lineage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe_lineage(lineage_id: UUID, session: Session = Depends(get_write_db, scope="function")) -> Response:
    recipes.delete_recipe_lineage(session, lineage_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(session: Session = Depends(get_db)) -> Sequence[IngredientOut]:
    return [recipes.ingredient_out(ingredient) for ingredient in recipes.list_ingredients(session)]


@router.get("/steps", response_model=list[StepOut])
def list_steps(session: Session = Depends(get_db)) -> Sequence[StepOut]:
    return [recipes.step_out(step) for step in recipes.list_steps(session)]
