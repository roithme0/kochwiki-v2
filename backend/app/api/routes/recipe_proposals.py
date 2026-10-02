from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.db.session import SessionLocal
from app.schemas.errors import NOT_FOUND_AND_CONFLICT_RESPONSES
from app.schemas.recipe import RecipeVersionOut
from app.services.recipe_proposal_saves import save_recipe_proposal
from app.services.recipe_proposals import RecipeProposalStore

router = APIRouter()


def get_recipe_proposals(request: Request) -> RecipeProposalStore:
    return cast(RecipeProposalStore, request.app.state.recipe_proposals)


@router.post("/recipe-proposals/{proposal_id}/save", response_model=RecipeVersionOut,
             responses=NOT_FOUND_AND_CONFLICT_RESPONSES)
def save_proposal(
    proposal_id: UUID, store: RecipeProposalStore = Depends(get_recipe_proposals),
) -> RecipeVersionOut:
    return save_recipe_proposal(SessionLocal, store, proposal_id)
