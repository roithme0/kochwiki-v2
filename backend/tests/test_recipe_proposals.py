from datetime import datetime, timezone
from decimal import Decimal
from typing import cast
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from kochwiki_contract import Unit
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.main import create_app
from app.models.foodstuff import Foodstuff
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.models.recipe import Ingredient, RecipeVersion, Step
from app.models.recipe_embedding import RecipeEmbedding
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.schemas.recipe import RecipeVersionWrite
from app.schemas.recipe_proposal import RecipeProposalCreate, TemporaryProposalFoodstuff
from app.services.exceptions import ConflictError, NotFoundError
from app.services.foodstuff_refresh import foodstuff_refresh
from app.services.foodstuffs import create_foodstuff, delete_foodstuff, update_foodstuff
from app.services.recipe_proposals import RecipeProposalStore
from app.services.recipe_refresh import recipe_refresh
from app.services.recipes import (
    create_recipe,
    create_recipe_draft,
    delete_recipe_lineage,
    publish_active_recipe_edit,
    update_recipe_draft,
)


def recipe(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "name": "Proposal", "servings": 2,
        "ingredients": [], "steps": [{"index": 1, "description": "Cook"}],
    }
    result.update(overrides)
    return result


def existing(index: int = 1, foodstuff_id: int = 1) -> dict[str, object]:
    return {"index": index, "amount": 200, "foodstuff": {"kind": "existing", "foodstuffId": foodstuff_id}}


def temporary(index: int = 2, **definition: object) -> dict[str, object]:
    fields: dict[str, object] = {"name": "Chickpeas", "unit": "G"}
    fields.update(definition)
    return {"index": index, "amount": 150, "foodstuff": {"kind": "temporary", "definition": fields}}


def references() -> tuple[UUID, UUID, int]:
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=2))
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Oats", unit=Unit.G))
        return source.lineage_id, source.version_id, foodstuff.id


def payload(source: UUID, **recipe_fields: object) -> RecipeProposalCreate:
    return RecipeProposalCreate.model_validate({"sourceRecipeVersionId": source, "recipe": recipe(**recipe_fields)})


def counts(session: Session) -> list[int | None]:
    return [session.scalar(select(func.count()).select_from(model)) for model in (
        Foodstuff, RecipeVersion, Ingredient, Step, FoodstuffEmbedding, RecipeEmbedding,
    )]


def test_retention_is_detached_and_creates_no_records_or_refresh_work() -> None:
    _, source, foodstuff_id = references()
    store = RecipeProposalStore()
    submitted = payload(source, ingredients=[existing(foodstuff_id=foodstuff_id), temporary(kcal=0, brand="")])
    refreshed_foodstuffs: list[int] = []
    refreshed_recipes: list[UUID] = []
    foodstuff_refresh.subscribe(refreshed_foodstuffs.append)
    recipe_refresh.subscribe(refreshed_recipes.append)
    try:
        before = datetime.now(timezone.utc)
        with SessionLocal.begin() as session:
            original_counts = counts(session)
            proposal = store.create(session, submitted)
            assert counts(session) == original_counts
            assert not session.new and not session.dirty and not session.deleted
        assert refreshed_foodstuffs == [] and refreshed_recipes == []
    finally:
        foodstuff_refresh.unsubscribe(refreshed_foodstuffs.append)
        recipe_refresh.unsubscribe(refreshed_recipes.append)
    assert before <= proposal.createdAt <= datetime.now(timezone.utc)
    assert proposal.createdAt.tzinfo == timezone.utc
    assert proposal.sourceRecipeVersionId == source and proposal.baseProposalId is None
    assert proposal.recipe.preptime is None
    definition = proposal.recipe.ingredients[1].foodstuff
    assert isinstance(definition, TemporaryProposalFoodstuff)
    assert definition.definition.kcal == Decimal(0) and definition.definition.carbs is None
    assert definition.definition.brand is None
    retained = proposal.model_copy(deep=True)
    submitted.recipe.name = "Changed input"
    submitted.recipe.ingredients[1].amount = Decimal(1)
    submitted.recipe.steps[0].description = "Changed input step"
    proposal.recipe.name = "Changed output"
    definition.definition.name = "Changed definition"
    proposal.recipe.ingredients.clear()
    proposal.sourceRecipeVersionId = uuid4()
    retrieved = store.get(retained.proposalId)
    assert retrieved == retained
    retrieved.recipe.steps.clear()
    assert store.get(retained.proposalId) == retained


def test_application_instance_retention_and_shutdown_cleanup() -> None:
    _, source, _ = references()
    application = create_app()
    store = cast(RecipeProposalStore, application.state.recipe_proposals)
    with TestClient(application) as client:
        assert client.get("/").status_code == 200
        with SessionLocal() as session:
            proposal = store.create(session, payload(source))
        assert client.get("/").status_code == 200
        assert store.get(proposal.proposalId) == proposal
        other = cast(RecipeProposalStore, create_app().state.recipe_proposals)
        with pytest.raises(NotFoundError):
            other.get(proposal.proposalId)
        assert {path for path in client.get("/api/openapi.json").json()["paths"] if "proposal" in path} == {
            "/recipe-proposals/{proposal_id}/save",
        }
    with pytest.raises(NotFoundError):
        store.get(proposal.proposalId)


def test_reference_validation_does_not_autoflush_pending_records() -> None:
    _, source, _ = references()
    store = RecipeProposalStore()
    with SessionLocal() as session:
        pending = Foodstuff(name="Pending", unit=Unit.G)
        session.add(pending)
        proposal = store.create(session, payload(source))
        assert pending.id is None and pending in session.new
        assert store.get(proposal.proposalId) == proposal


def test_refinement_is_complete_separate_and_keeps_original_source() -> None:
    _, source, _ = references()
    store = RecipeProposalStore()
    with SessionLocal() as session:
        base = store.create(session, payload(source, ingredients=[temporary()]))
        refinement_input = RecipeProposalCreate(
            sourceRecipeVersionId=source, baseProposalId=base.proposalId,
            recipe=payload(source, name="Refined", ingredients=[], steps=[]).recipe,
        )
        refinement = store.create(session, refinement_input)
        assert refinement.proposalId != base.proposalId
        assert refinement.baseProposalId == base.proposalId and refinement.sourceRecipeVersionId == source
        assert refinement.recipe.name == "Refined" and refinement.recipe.ingredients == [] and refinement.recipe.steps == []
        assert store.get(base.proposalId) == base
        refinement_input.sourceRecipeVersionId = uuid4()
        with pytest.raises(ConflictError, match="original source"):
            store.create(session, refinement_input)


def test_all_source_states_and_later_dependency_changes_and_deletion() -> None:
    lineage, active, foodstuff_id = references()
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="Draft", servings=2)).version_id
        current = publish_active_recipe_edit(session, lineage, RecipeVersionWrite(name="Current", servings=2)).version_id
    store = RecipeProposalStore()
    with SessionLocal() as session:
        proposals = [store.create(session, payload(source, ingredients=[existing(foodstuff_id=foodstuff_id)]))
                     for source in (active, draft, current)]
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="Renamed", kcal=Decimal(1)))
        update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Changed draft", servings=3))
    for proposal in proposals:
        assert store.get(proposal.proposalId) == proposal
    with SessionLocal.begin() as session:
        delete_recipe_lineage(session, lineage)
        delete_foodstuff(session, foodstuff_id)
    for proposal in proposals:
        assert store.get(proposal.proposalId) == proposal


@pytest.mark.parametrize("missing", ["source", "base", "foodstuff", "database"])
def test_creation_failures_leave_no_entry(missing: str, monkeypatch: pytest.MonkeyPatch) -> None:
    _, source, _ = references()
    issued_id = uuid4()
    monkeypatch.setattr("app.services.recipe_proposals.uuid4", lambda: issued_id)
    submitted = payload(source)
    expected: type[Exception] = NotFoundError
    if missing == "source":
        submitted.sourceRecipeVersionId = uuid4()
    elif missing == "base":
        submitted.baseProposalId = uuid4()
    elif missing == "foodstuff":
        submitted = payload(source, ingredients=[existing(foodstuff_id=999999)])
    else:
        def fail_query(self: Session, statement: object) -> None:
            raise SQLAlchemyError("Unavailable")
        monkeypatch.setattr(Session, "scalar", fail_query)
        expected = SQLAlchemyError
    store = RecipeProposalStore()
    with SessionLocal() as session:
        with pytest.raises(expected):
            store.create(session, submitted)
    with pytest.raises(NotFoundError):
        store.get(issued_id)


def test_mutated_invalid_payload_is_revalidated_before_retention() -> None:
    _, source, _ = references()
    store = RecipeProposalStore()
    submitted = payload(source)
    submitted.recipe.servings = 0
    with SessionLocal() as session, pytest.raises(ValidationError):
        store.create(session, submitted)


@pytest.mark.parametrize("fields", [
    {"name": ""}, {"name": "x" * 201}, {"servings": 0}, {"servings": 100},
    {"preptime": 0}, {"preptime": 1000}, {"originName": "Home"}, {"originUrl": "https://example.org/recipe"},
    {"unknown": True}, {"ingredients": [existing(), existing(index=2)]},
    {"ingredients": [temporary(), temporary(index=3, unit="ML", kcal=5)]},
    {"ingredients": [temporary(brand=""), temporary(index=3, brand=None)]},
    {"ingredients": [existing(), temporary(index=1)]},
    {"ingredients": [{**existing(), "amount": 0}]}, {"ingredients": [{**existing(), "amount": 10000}]},
    {"ingredients": [{**existing(), "amount": "200"}]}, {"ingredients": [{**existing(), "index": True}]},
    {"ingredients": [{**existing(), "index": 100}]}, {"ingredients": [{**existing(), "extra": 1}]},
    {"ingredients": [{"index": 1, "amount": 1, "foodstuff": {"foodstuffId": 1}}]},
    {"ingredients": [{"index": 1, "amount": 1, "foodstuff": {"kind": "unknown"}}]},
    {"ingredients": [{"index": 1, "amount": 1, "foodstuff": {"kind": "existing", "foodstuffId": 1, "definition": {}}}]},
    {"ingredients": [{"index": 1, "amount": 1, "foodstuff": {"kind": "temporary", "foodstuffId": 1, "definition": {"name": "Bean", "unit": "G"}}}]},
    {"ingredients": [{"index": 1, "amount": 1, "foodstuff": {"kind": "existing", "foodstuffId": 0}}]},
    {"ingredients": [temporary(name="")]}, {"ingredients": [temporary(name="x" * 51)]},
    {"ingredients": [temporary(unit=None)]}, {"ingredients": [temporary(kcal=-1)]},
    {"ingredients": [temporary(brand="x" * 101)]}, {"ingredients": [temporary(unknown=1)]},
    {"steps": [{"index": 1, "description": ""}]}, {"steps": [{"index": 1, "description": "x" * 201}]},
    {"steps": [{"index": 1, "description": "A"}, {"index": 1, "description": "B"}]},
    {"steps": [{"index": 1, "description": "A", "unknown": 1}]},
])
def test_proposal_recipe_validation(fields: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        payload(uuid4(), **fields)


def test_required_content_and_nested_fields_and_exact_temporary_identity() -> None:
    source = uuid4()
    for missing in ("ingredients", "steps"):
        content = recipe()
        del content[missing]
        with pytest.raises(ValidationError):
            RecipeProposalCreate.model_validate({"sourceRecipeVersionId": source, "recipe": content})
    for definition in ({"name": "Bean"}, {"unit": "G"}):
        with pytest.raises(ValidationError):
            payload(source, ingredients=[{"index": 1, "amount": 1, "foodstuff": {"kind": "temporary", "definition": definition}}])
    with pytest.raises(ValidationError):
        RecipeProposalCreate.model_validate({"sourceRecipeVersionId": source, "recipe": recipe(), "unknown": 1})
    valid = payload(source, ingredients=[
        existing(), temporary(name="Oats"), temporary(index=3, name="oats"),
        temporary(index=4, name="Oats "), temporary(index=5, name="Oats", brand="Farm"),
    ])
    assert len(valid.recipe.ingredients) == 5
