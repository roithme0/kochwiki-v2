from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.foodstuff import Foodstuff
from app.models.recipe import RecipeVersion
from app.schemas.recipe_proposal import (
    ExistingProposalFoodstuff,
    RecipeProposalCreate,
    RecipeProposalOut,
)
from app.services.exceptions import ConflictError, NotFoundError


class RecipeProposalStore:
    def __init__(self) -> None:
        self._proposals: dict[UUID, RecipeProposalOut] = {}

    def create(self, session: Session, payload: RecipeProposalCreate) -> RecipeProposalOut:
        validated = RecipeProposalCreate.model_validate(payload.model_dump())
        if validated.baseProposalId is not None:
            base = self.get(validated.baseProposalId)
            if base.sourceRecipeVersionId != validated.sourceRecipeVersionId:
                raise ConflictError("A refinement must retain its base proposal's original source")

        with session.no_autoflush:
            source_id = session.scalar(
                select(RecipeVersion.version_id).where(
                    RecipeVersion.version_id == validated.sourceRecipeVersionId
                )
            )
            if source_id is None:
                raise NotFoundError(f"Recipe version with id {validated.sourceRecipeVersionId} not found")
            foodstuff_ids = {
                ingredient.foodstuff.foodstuffId
                for ingredient in validated.recipe.ingredients
                if isinstance(ingredient.foodstuff, ExistingProposalFoodstuff)
            }
            if foodstuff_ids:
                found_ids = set(session.scalars(select(Foodstuff.id).where(Foodstuff.id.in_(foodstuff_ids))))
                missing_ids = sorted(foodstuff_ids - found_ids)
                if missing_ids:
                    raise NotFoundError(f"Foodstuff with id {missing_ids[0]} not found")

        proposal = RecipeProposalOut(
            proposalId=uuid4(),
            createdAt=datetime.now(timezone.utc),
            sourceRecipeVersionId=validated.sourceRecipeVersionId,
            baseProposalId=validated.baseProposalId,
            recipe=validated.recipe,
        )
        result = proposal.model_copy(deep=True)
        self._proposals[proposal.proposalId] = proposal
        return result

    def get(self, proposal_id: UUID) -> RecipeProposalOut:
        proposal = self._proposals.get(proposal_id)
        if proposal is None:
            raise NotFoundError(f"Recipe proposal with id {proposal_id} not found")
        return proposal.model_copy(deep=True)

    def clear(self) -> None:
        self._proposals.clear()
