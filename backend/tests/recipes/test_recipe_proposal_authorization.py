from collections.abc import Callable
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.core.exceptions import ForbiddenError, NotFoundError
from app.foodstuffs.models.foodstuff import Foodstuff
from app.identity.schemas.user import UserOut
from app.infrastructure.database.session import SessionLocal
from app.recipes.models.recipe import RecipeLineage, RecipeVersion
from app.recipes.schemas.proposal import RecipeProposalCreate
from app.recipes.schemas.recipe import RecipeVersionWrite
from app.recipes.services.proposal_presentations import resolve_recipe_proposal_presentation
from app.recipes.services.proposal_saves import save_recipe_proposal
from app.recipes.services.proposal_store import RecipeProposalStore
from app.recipes.services.recipes import create_recipe, create_recipe_draft, discard_recipe_draft


def payload(source: RecipeVersion) -> RecipeProposalCreate:
    return RecipeProposalCreate.model_validate({
        "sourceRecipeVersionId": source.version_id,
        "recipe": {
            "name": "Private improvement", "servings": 1, "steps": [],
            "ingredients": [{"index": 1, "amount": 10, "foodstuff": {
                "kind": "temporary", "definition": {"name": "Beans", "unit": "G"},
            }}],
        },
    })


@pytest.mark.parametrize("saved", [False, True])
def test_private_proposals_deny_all_cross_user_access_without_side_effects(
    provider_user: Callable[[str], UserOut], saved: bool,
) -> None:
    owner, other = provider_user("Owner"), provider_user("Other")
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=1), owner_id=owner.id)
        submitted = payload(source)
        proposal = store.create(session, submitted, user_id=owner.id)
    if saved:
        save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id)
    with SessionLocal() as session:
        before = [session.scalar(select(func.count()).select_from(model)) for model in (Foodstuff, RecipeVersion)]
        with pytest.raises(ForbiddenError):
            store.create(session, submitted, user_id=other.id)
        for proposal_id in (proposal.proposalId, uuid4()):
            with pytest.raises(NotFoundError):
                store.get(proposal_id, user_id=other.id)
            with pytest.raises(NotFoundError):
                resolve_recipe_proposal_presentation(session, store, proposal_id, user_id=other.id)
            with pytest.raises(NotFoundError):
                save_recipe_proposal(SessionLocal, store, proposal_id, user_id=other.id)
            with pytest.raises(NotFoundError):
                store.saved_version_id(proposal_id, user_id=other.id)
            with pytest.raises(NotFoundError):
                store.record_saved_version(proposal_id, uuid4(), user_id=other.id)
        assert [session.scalar(select(func.count()).select_from(model)) for model in (Foodstuff, RecipeVersion)] == before
    assert store.get(proposal.proposalId, user_id=owner.id) == proposal
    assert (store.saved_version_id(proposal.proposalId, user_id=owner.id) is not None) == saved


@pytest.mark.parametrize("saved", [False, True])
def test_source_ownership_is_rechecked_for_refinement_and_every_save(
    provider_user: Callable[[str], UserOut], saved: bool,
) -> None:
    owner, other = provider_user("Owner"), provider_user("Other")
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=1), owner_id=owner.id)
        lineage_id = source.lineage_id
        submitted = payload(source)
        proposal = store.create(session, submitted, user_id=owner.id)
    if saved:
        save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id)
    # Simulate a changed permission to verify the checks also cover repeat saves.
    with SessionLocal.begin() as session:
        lineage = session.get(RecipeLineage, lineage_id)
        assert lineage is not None
        lineage.owner_id = other.id
    refinement = submitted.model_copy(update={"baseProposalId": proposal.proposalId})
    with SessionLocal() as session:
        before = [session.scalar(select(func.count()).select_from(model)) for model in (Foodstuff, RecipeVersion)]
        with pytest.raises(ForbiddenError):
            store.create(session, refinement, user_id=owner.id)
        with pytest.raises(NotFoundError):
            store.create(session, refinement, user_id=other.id)
        with pytest.raises(ForbiddenError):
            save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id)
        assert [session.scalar(select(func.count()).select_from(model)) for model in (Foodstuff, RecipeVersion)] == before
    assert store.get(proposal.proposalId, user_id=owner.id) == proposal


def test_repeat_save_checks_saved_lineage_after_source_draft_is_discarded(
    provider_user: Callable[[str], UserOut],
) -> None:
    owner, other = provider_user("Owner"), provider_user("Other")
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        active = create_recipe(session, RecipeVersionWrite(name="Original", servings=1), owner_id=owner.id)
        source = create_recipe_draft(session, active.lineage_id, RecipeVersionWrite(name="Source draft", servings=1))
        proposal = store.create(session, payload(source), user_id=owner.id)
    saved = save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id)
    with SessionLocal.begin() as session:
        discard_recipe_draft(session, saved.recipeLineageId, proposal.sourceRecipeVersionId)
    assert save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id) == saved
    with SessionLocal.begin() as session:
        lineage = session.get(RecipeLineage, saved.recipeLineageId)
        assert lineage is not None
        lineage.owner_id = other.id
    with pytest.raises(ForbiddenError):
        save_recipe_proposal(SessionLocal, store, proposal.proposalId, user_id=owner.id)
