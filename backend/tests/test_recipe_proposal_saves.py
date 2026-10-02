from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from kochwiki_contract import Unit
from sqlalchemy import event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import RecipeVersionState
from app.models.foodstuff import Foodstuff
from app.models.recipe import Ingredient, RecipeVersion, Step
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.schemas.recipe import RecipeVersionOut, RecipeVersionWrite
from app.schemas.recipe_proposal import RecipeProposalCreate, RecipeProposalOut
from app.services.exceptions import ConflictError, NotFoundError
from app.services.foodstuff_refresh import foodstuff_refresh
from app.services.foodstuffs import create_foodstuff, delete_foodstuff, update_foodstuff
from app.services.recipe_proposal_saves import save_recipe_proposal
from app.services.recipe_proposals import RecipeProposalStore
from app.services.recipe_refresh import recipe_refresh
from app.services.recipes import (
    create_recipe, create_recipe_draft, delete_recipe_lineage, discard_recipe_draft,
    get_recipe_version_by_id, publish_active_recipe_edit, publish_recipe_draft,
    update_recipe_draft,
)


def prepare() -> tuple[RecipeProposalStore, RecipeProposalOut, UUID, int]:
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=1))
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Oats", unit=Unit.G, kcal=Decimal(100)))
        lineage_id, foodstuff_id = source.lineage_id, foodstuff.id
        proposal = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {
                "name": "Improved", "servings": 2, "preptime": 20,
                "ingredients": [
                    {"index": 2, "amount": 50, "foodstuff": {"kind": "existing", "foodstuffId": foodstuff_id}},
                    {"index": 1, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {
                        "name": "Beans", "unit": "G", "kcal": 200, "brand": "Farm",
                    }}},
                ],
                "steps": [{"index": 2, "description": "Serve"}, {"index": 1, "description": "Cook"}],
            },
        }))
    return store, proposal, lineage_id, foodstuff_id


def counts() -> list[int | None]:
    with SessionLocal() as session:
        return [session.scalar(select(func.count()).select_from(model)) for model in (
            Foodstuff, RecipeVersion, Ingredient, Step,
        )]


def test_atomic_save_and_repeat_returns_current_version() -> None:
    store, proposal, lineage_id, foodstuff_id = prepare()
    foods: list[int] = []
    recipes: list[UUID] = []
    foodstuff_refresh.subscribe(foods.append)
    recipe_refresh.subscribe(recipes.append)
    try:
        with SessionLocal.begin() as session:
            update_foodstuff(session, foodstuff_id, FoodstuffUpdate(kcal=Decimal(120)))
        result = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
        assert result.state == RecipeVersionState.DRAFT
        assert result.recipeLineageId == lineage_id
        assert result.name == "Improved" and result.servings == 2 and result.preptime == 20
        assert result.kcal == Decimal(130)
        assert [item.index for item in result.ingredients] == [1, 2]
        assert [item.description for item in result.steps] == ["Cook", "Serve"]
        created = result.ingredients[0].foodstuff
        assert created.name == "Beans" and created.brand == "Farm" and created.unit == Unit.G
        assert foods == [created.id] and recipes == [result.recipeVersionId]
        before_repeat = counts()
        assert save_recipe_proposal(SessionLocal, store, proposal.proposalId) == result
        assert counts() == before_repeat
        assert foods == [created.id] and recipes == [result.recipeVersionId]
        with SessionLocal.begin() as session:
            original = get_recipe_version_by_id(session, lineage_id, proposal.sourceRecipeVersionId)
            assert original.name == "Original" and original.state == RecipeVersionState.ACTIVE
            update_recipe_draft(session, lineage_id, result.recipeVersionId, RecipeVersionWrite(name="Edited", servings=3))
            publish_recipe_draft(session, lineage_id, result.recipeVersionId)
        repeated = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
        assert repeated.recipeVersionId == result.recipeVersionId
        assert repeated.name == "Edited" and repeated.state == RecipeVersionState.ACTIVE
        assert store.get(proposal.proposalId) == proposal
    finally:
        foodstuff_refresh.unsubscribe(foods.append)
        recipe_refresh.unsubscribe(recipes.append)


@pytest.mark.parametrize("failure", ["source", "foodstuff", "duplicate", "draft", "commit"])
def test_failure_rolls_back_and_keeps_proposal_unsaved(failure: str, monkeypatch: pytest.MonkeyPatch) -> None:
    store, proposal, lineage_id, foodstuff_id = prepare()
    expected: type[Exception] = SQLAlchemyError
    if failure == "source":
        with SessionLocal.begin() as session:
            delete_recipe_lineage(session, lineage_id)
        expected = NotFoundError
    elif failure == "foodstuff":
        with SessionLocal.begin() as session:
            delete_foodstuff(session, foodstuff_id)
        expected = NotFoundError
    elif failure == "duplicate":
        with SessionLocal.begin() as session:
            create_foodstuff(session, FoodstuffCreate(name="Beans", brand="Farm", unit=Unit.G))
        expected = ConflictError
    elif failure == "draft":
        def fail_draft(session: Session, lineage_id: UUID, payload: RecipeVersionWrite) -> None:
            create_recipe_draft(session, lineage_id, payload)
            raise SQLAlchemyError("Draft creation failed")
        monkeypatch.setattr("app.services.recipe_proposal_saves.create_recipe_draft", fail_draft)

    def fail_commit(session: Session) -> None:
        raise SQLAlchemyError("Commit failed")

    foods: list[int] = []
    recipes: list[UUID] = []
    foodstuff_refresh.subscribe(foods.append)
    recipe_refresh.subscribe(recipes.append)
    before = counts()
    if failure == "commit":
        event.listen(Session, "before_commit", fail_commit)
    try:
        with pytest.raises(expected):
            save_recipe_proposal(SessionLocal, store, proposal.proposalId)
        assert counts() == before
        assert store.saved_version_id(proposal.proposalId) is None
        assert store.get(proposal.proposalId) == proposal
        assert foods == [] and recipes == []
    finally:
        if failure == "commit":
            event.remove(Session, "before_commit", fail_commit)
        foodstuff_refresh.unsubscribe(foods.append)
        recipe_refresh.unsubscribe(recipes.append)
    if failure in ("draft", "commit"):
        monkeypatch.undo()
        assert save_recipe_proposal(SessionLocal, store, proposal.proposalId).state == RecipeVersionState.DRAFT


def test_deleted_saved_version_is_not_recreated() -> None:
    store, proposal, lineage_id, _ = prepare()
    result = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    with SessionLocal.begin() as session:
        discard_recipe_draft(session, lineage_id, result.recipeVersionId)
    before = counts()
    with pytest.raises(NotFoundError, match=str(result.recipeVersionId)):
        save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    assert counts() == before
    assert store.saved_version_id(proposal.proposalId) == result.recipeVersionId


def test_concurrent_saves_create_one_draft_and_foodstuff() -> None:
    store, proposal, _, _ = prepare()
    barrier = Barrier(2)

    def save() -> RecipeVersionOut:
        barrier.wait(timeout=10)
        return save_recipe_proposal(SessionLocal, store, proposal.proposalId)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(save) for _ in range(2)]
        results = [future.result(timeout=20) for future in futures]
    assert results[0] == results[1]
    assert counts() == [2, 2, 2, 2]


@pytest.mark.parametrize("source_state", ["draft", "historical"])
def test_saves_in_original_lineage_from_any_source_state(source_state: str) -> None:
    store, proposal, lineage_id, _ = prepare()
    with SessionLocal.begin() as session:
        if source_state == "draft":
            source_id = create_recipe_draft(session, lineage_id, RecipeVersionWrite(name="Source draft", servings=1)).version_id
        else:
            source_id = proposal.sourceRecipeVersionId
            publish_active_recipe_edit(session, lineage_id, RecipeVersionWrite(name="New active", servings=1))
        proposal = store.create(session, RecipeProposalCreate(sourceRecipeVersionId=source_id, recipe=proposal.recipe))
    result = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    assert result.recipeLineageId == lineage_id and result.state == RecipeVersionState.DRAFT


def test_unknown_proposal_and_store_clear() -> None:
    store, proposal, _, _ = prepare()
    with pytest.raises(NotFoundError):
        save_recipe_proposal(SessionLocal, store, uuid4())
    save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    store.clear()
    with pytest.raises(NotFoundError):
        save_recipe_proposal(SessionLocal, store, proposal.proposalId)


def test_later_temporary_conflict_rolls_back_earlier_foodstuff() -> None:
    store, proposal, _, _ = prepare()
    with SessionLocal.begin() as session:
        create_foodstuff(session, FoodstuffCreate(name="Beans", brand="Farm", unit=Unit.G))
    with SessionLocal() as session:
        submitted = proposal.recipe.model_dump()
        submitted["ingredients"] = [
            {"index": 1, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {"name": "New beans", "unit": "G"}}},
            {"index": 2, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {"name": "Beans", "brand": "Farm", "unit": "G"}}},
        ]
        conflicting = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": proposal.sourceRecipeVersionId, "recipe": submitted,
        }))
    before = counts()
    with pytest.raises(ConflictError):
        save_recipe_proposal(SessionLocal, store, conflicting.proposalId)
    assert counts() == before
    assert store.saved_version_id(conflicting.proposalId) is None
    with SessionLocal() as session:
        assert session.scalar(select(Foodstuff).where(Foodstuff.name == "New beans")) is None


def test_refinement_has_its_own_save_association_without_temporary_foodstuffs() -> None:
    store, proposal, lineage_id, foodstuff_id = prepare()
    base_result = save_recipe_proposal(SessionLocal, store, proposal.proposalId)
    with SessionLocal() as session:
        refinement = store.create(session, RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": proposal.sourceRecipeVersionId,
            "baseProposalId": proposal.proposalId,
            "recipe": {
                "name": "Refinement", "servings": 1, "steps": [],
                "ingredients": [{"index": 1, "amount": 100, "foodstuff": {"kind": "existing", "foodstuffId": foodstuff_id}}],
            },
        }))
    result = save_recipe_proposal(SessionLocal, store, refinement.proposalId)
    assert result.recipeVersionId != base_result.recipeVersionId
    assert result.recipeLineageId == lineage_id and result.name == "Refinement"
    assert store.saved_version_id(proposal.proposalId) == base_result.recipeVersionId
    assert store.saved_version_id(refinement.proposalId) == result.recipeVersionId
    assert counts() == [2, 3, 3, 2]
