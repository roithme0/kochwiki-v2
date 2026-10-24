from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.identity.models.user import User
from app.identity.dependencies import require_current_user
from app.recipes.models.recipe import RecipeVersion
from app.recipes.services.recipes import require_recipe_lineage_owner
from app.core.exceptions import NotFoundError

from app.infrastructure.database.session import SessionLocal, get_write_db
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
    session: Session = Depends(get_write_db, scope="function"),
) -> RecipeVersionOut:
    proposal = store.get(proposal_id)
    source = session.get(RecipeVersion, proposal.sourceRecipeVersionId)
    if source is None:
        raise NotFoundError(f"Recipe version with id {proposal.sourceRecipeVersionId} not found")
    require_recipe_lineage_owner(session, source.lineage_id, user.id)
    return save_recipe_proposal(SessionLocal, store, proposal_id)
