from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.identity.models.user import User
from app.identity.dependencies import require_current_user

from app.infrastructure.database.session import SessionLocal
from app.core.schemas.errors import (
    AUTHENTICATION_RESPONSES,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_AND_CONFLICT_RESPONSES,
)
from app.recipes.schemas.recipe import RecipeVersionOut
from app.recipes.services.proposal_saves import save_recipe_proposal
from app.recipes.services.proposal_store import RecipeProposalStore

router = APIRouter()


def get_recipe_proposals(request: Request) -> RecipeProposalStore:
    return cast(RecipeProposalStore, request.app.state.recipe_proposals)


@router.post(
    "/recipe-proposals/{proposal_id}/save",
    response_model=RecipeVersionOut,
    responses={**NOT_FOUND_AND_CONFLICT_RESPONSES, **AUTHENTICATION_RESPONSES, **FORBIDDEN_RESPONSE},
)
def save_proposal(
    proposal_id: UUID,
    store: RecipeProposalStore = Depends(get_recipe_proposals),
    user: User = Depends(require_current_user, scope="function"),
) -> RecipeVersionOut:
    return save_recipe_proposal(SessionLocal, store, proposal_id, user_id=user.id)
