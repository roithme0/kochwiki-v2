from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.foodstuffs.models.foodstuff import Foodstuff
from app.recipes.models.recipe import RecipeVersion
from app.recipes.schemas.proposal import (
    ExistingProposalFoodstuff,
    RecipeProposalCreate,
    RecipeProposalOut,
)
from app.core.exceptions import ConflictError, NotFoundError
from app.recipes.services.recipes import require_recipe_lineage_owner


@dataclass(frozen=True)
class StoredRecipeProposal:
    creator_id: int
    proposal: RecipeProposalOut


class RecipeProposalStore:
    def __init__(self) -> None:
        self._proposals: dict[UUID, StoredRecipeProposal] = {}
        self._saved_versions: dict[UUID, UUID] = {}
        self._save_lock = RLock()

    def create(
        self, session: Session, payload: RecipeProposalCreate, *, user_id: int
    ) -> RecipeProposalOut:
        validated = RecipeProposalCreate.model_validate(payload.model_dump())
        if validated.baseProposalId is not None:
            base = self.get(validated.baseProposalId, user_id=user_id)
            if base.sourceRecipeVersionId != validated.sourceRecipeVersionId:
                raise ConflictError(
                    "A refinement must retain its base proposal's original source"
                )

        with session.no_autoflush:
            source = session.scalar(
                select(RecipeVersion).where(
                    RecipeVersion.version_id == validated.sourceRecipeVersionId
                )
            )
            if source is None:
                raise NotFoundError(
                    f"Recipe version with id {validated.sourceRecipeVersionId} not found"
                )
            require_recipe_lineage_owner(session, source.lineage_id, user_id)
            foodstuff_ids = {
                ingredient.foodstuff.foodstuffId
                for ingredient in validated.recipe.ingredients
                if isinstance(ingredient.foodstuff, ExistingProposalFoodstuff)
            }
            if foodstuff_ids:
                found_ids = set(
                    session.scalars(
                        select(Foodstuff.id).where(Foodstuff.id.in_(foodstuff_ids))
                    )
                )
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
        with self._save_lock:
            self._proposals[proposal.proposalId] = StoredRecipeProposal(
                user_id, proposal
            )
        return result

    def get(self, proposal_id: UUID, *, user_id: int) -> RecipeProposalOut:
        with self._save_lock:
            proposal = self._proposals.get(proposal_id)
            if proposal is None or proposal.creator_id != user_id:
                raise NotFoundError(f"Recipe proposal with id {proposal_id} not found")
            return proposal.proposal.model_copy(deep=True)

    @contextmanager
    def saving(self, proposal_id: UUID, *, user_id: int) -> Iterator[None]:
        with self._save_lock:
            self.get(proposal_id, user_id=user_id)
            yield

    def saved_version_id(self, proposal_id: UUID, *, user_id: int) -> UUID | None:
        with self._save_lock:
            self.get(proposal_id, user_id=user_id)
            return self._saved_versions.get(proposal_id)

    def record_saved_version(
        self, proposal_id: UUID, version_id: UUID, *, user_id: int
    ) -> None:
        with self._save_lock:
            self.get(proposal_id, user_id=user_id)
            self._saved_versions[proposal_id] = version_id

    def clear(self) -> None:
        with self._save_lock:
            self._proposals.clear()
            self._saved_versions.clear()
