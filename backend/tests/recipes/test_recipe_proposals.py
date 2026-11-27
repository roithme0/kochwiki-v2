from datetime import datetime, timezone
from decimal import Decimal
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import ORMExecuteState, Session

from app.core.exceptions import ConflictError, NotFoundError
from app.foodstuffs.models.embedding import FoodstuffEmbedding
from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.foodstuffs.services.embeddings import foodstuff_refresh
from app.foodstuffs.services.foodstuffs import (
    create_foodstuff,
    delete_foodstuff,
    update_foodstuff,
)
from app.infrastructure.database.session import SessionLocal
from app.main import create_app
from app.recipes.models.embedding import RecipeEmbedding
from app.recipes.models.recipe import Ingredient, RecipeVersion, Step
from app.recipes.schemas.proposal import ProposalIngredient, RecipeProposalCreate
from app.recipes.schemas.recipe import RecipeVersionWrite
from app.recipes.services.embeddings import recipe_refresh
from app.recipes.services.proposal_store import RecipeProposalStore
from app.recipes.services.recipes import (
    create_recipe,
    create_recipe_draft,
    delete_recipe_lineage,
    update_recipe_draft,
)
from tests.recipes.helpers import fixture_owner_id


def recipe(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "name": "Proposal",
        "servings": 2,
        "ingredients": [],
        "steps": [{"index": 1, "description": "Cook"}],
    }
    result.update(overrides)
    return result


def existing(index: int = 1, foodstuff_id: int = 1) -> dict[str, object]:
    return {
        "index": index,
        "amount": 200,
        "foodstuff": {"kind": "existing", "foodstuffId": foodstuff_id},
    }


def temporary(index: int = 2, **definition: object) -> dict[str, object]:
    fields: dict[str, object] = {"name": "Chickpeas", "unit": "G"}
    fields.update(definition)
    return {
        "index": index,
        "amount": 150,
        "foodstuff": {"kind": "temporary", "definition": fields},
    }


@pytest.fixture
def source_recipe() -> tuple[UUID, UUID, int]:
    with SessionLocal.begin() as session:
        user_id = fixture_owner_id(session)
        source = create_recipe(
            session, RecipeVersionWrite(name="Original", servings=2), owner_id=user_id
        )
        return source.lineage_id, source.version_id, user_id


def create_reference_foodstuff(user_id: int) -> int:
    with SessionLocal.begin() as session:
        foodstuff = create_foodstuff(
            session,
            FoodstuffCreate(name="Oats", unit=Unit.G),
            owner_id=user_id,
        )
        return foodstuff.id


def payload(source: UUID, **recipe_fields: object) -> RecipeProposalCreate:
    return RecipeProposalCreate.model_validate(
        {"sourceRecipeVersionId": source, "recipe": recipe(**recipe_fields)}
    )


def counts(session: Session) -> list[int | None]:
    return [
        session.scalar(select(func.count()).select_from(model))
        for model in (
            Foodstuff,
            RecipeVersion,
            Ingredient,
            Step,
            FoodstuffEmbedding,
            RecipeEmbedding,
        )
    ]


def test_retention_is_detached_and_creates_no_records_or_refresh_work(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    _, source, user_id = source_recipe
    foodstuff_id = create_reference_foodstuff(user_id)
    store = RecipeProposalStore()
    submitted = payload(
        source,
        ingredients=[existing(foodstuff_id=foodstuff_id), temporary(kcal=0, brand="")],
    )
    refreshed_foodstuffs: list[int] = []
    refreshed_recipes: list[UUID] = []
    foodstuff_refresh.subscribe(refreshed_foodstuffs.append)
    recipe_refresh.subscribe(refreshed_recipes.append)
    try:
        before = datetime.now(timezone.utc)
        with SessionLocal.begin() as session:
            before_counts = counts(session)
            proposal = store.create(session, submitted, user_id=user_id)
        with SessionLocal() as session:
            assert counts(session) == before_counts
    finally:
        foodstuff_refresh.unsubscribe(refreshed_foodstuffs.append)
        recipe_refresh.unsubscribe(refreshed_recipes.append)
    assert refreshed_foodstuffs == []
    assert refreshed_recipes == []
    assert before <= proposal.createdAt <= datetime.now(timezone.utc)
    assert proposal.createdAt.tzinfo == timezone.utc
    assert proposal.sourceRecipeVersionId == source and proposal.baseProposalId is None
    assert proposal.recipe == submitted.recipe
    retained = proposal.model_copy(deep=True)
    submitted.recipe.ingredients[1].amount = Decimal(1)
    proposal.recipe.steps[0].description = "Changed step"
    retrieved = store.get(retained.proposalId, user_id=user_id)
    assert retrieved == retained
    retrieved.recipe.steps.clear()
    assert store.get(retained.proposalId, user_id=user_id) == retained


def test_application_shutdown_clears_retained_proposals(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    _, source, user_id = source_recipe
    application = create_app()
    store = cast(RecipeProposalStore, application.state.recipe_proposals)
    with TestClient(application):
        with SessionLocal() as session:
            proposal = store.create(session, payload(source), user_id=user_id)
        assert store.get(proposal.proposalId, user_id=user_id) == proposal
    with pytest.raises(NotFoundError):
        store.get(proposal.proposalId, user_id=user_id)


def test_save_is_the_only_http_proposal_operation() -> None:
    paths = create_app().openapi()["paths"]
    assert {
        path: set(operations)
        for path, operations in paths.items()
        if path == "/recipe-proposals" or path.startswith("/recipe-proposals/")
    } == {"/recipe-proposals/{proposal_id}/save": {"post"}}


def test_reference_validation_does_not_autoflush_pending_records(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    _, source, user_id = source_recipe
    store = RecipeProposalStore()
    with SessionLocal(autoflush=True) as session:
        pending = Foodstuff(name="Pending", unit=Unit.G, owner_id=user_id)
        session.add(pending)
        store.create(session, payload(source), user_id=user_id)
        assert pending.id is None and pending in session.new


def test_refinement_replaces_the_recipe_and_preserves_the_base(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    _, source, user_id = source_recipe
    store = RecipeProposalStore()
    with SessionLocal() as session:
        base = store.create(
            session,
            payload(source, ingredients=[temporary()]),
            user_id=user_id,
        )
        refinement_input = RecipeProposalCreate(
            sourceRecipeVersionId=source,
            baseProposalId=base.proposalId,
            recipe=payload(source, name="Refined", ingredients=[], steps=[]).recipe,
        )
        refinement = store.create(session, refinement_input, user_id=user_id)
        retained = store.get(refinement.proposalId, user_id=user_id)
        assert retained.recipe == refinement_input.recipe
        assert refinement.sourceRecipeVersionId == source
        assert store.get(base.proposalId, user_id=user_id) == base


def test_refinement_cannot_change_the_source_version(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    lineage, source, user_id = source_recipe
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(
            session, lineage, RecipeVersionWrite(name="Draft", servings=2)
        ).version_id
        base = store.create(session, payload(source), user_id=user_id)
        refinement = payload(draft)
        refinement.baseProposalId = base.proposalId
        with pytest.raises(ConflictError, match="original source"):
            store.create(session, refinement, user_id=user_id)


def test_retained_proposal_survives_dependency_changes_and_deletion(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    lineage, _, user_id = source_recipe
    foodstuff_id = create_reference_foodstuff(user_id)
    store = RecipeProposalStore()
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(
            session, lineage, RecipeVersionWrite(name="Draft", servings=2)
        ).version_id
        proposal = store.create(
            session,
            payload(draft, ingredients=[existing(foodstuff_id=foodstuff_id)]),
            user_id=user_id,
        )
    with SessionLocal.begin() as session:
        update_foodstuff(
            session,
            foodstuff_id,
            FoodstuffUpdate(name="Renamed", kcal=Decimal(1)),
            owner_id=user_id,
        )
        update_recipe_draft(
            session,
            lineage,
            draft,
            RecipeVersionWrite(name="Changed draft", servings=3),
        )
    assert store.get(proposal.proposalId, user_id=user_id) == proposal
    with SessionLocal.begin() as session:
        delete_recipe_lineage(session, lineage)
        delete_foodstuff(session, foodstuff_id, owner_id=user_id)
    assert store.get(proposal.proposalId, user_id=user_id) == proposal


def test_creation_rejects_a_missing_foodstuff(
    source_recipe: tuple[UUID, UUID, int],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, source, user_id = source_recipe
    foodstuff_id = create_reference_foodstuff(user_id)
    with SessionLocal.begin() as session:
        delete_foodstuff(session, foodstuff_id, owner_id=user_id)
    submitted = payload(source, ingredients=[existing(foodstuff_id=foodstuff_id)])
    issued_id = uuid4()
    monkeypatch.setattr("app.recipes.services.proposal_store.uuid4", lambda: issued_id)
    store = RecipeProposalStore()
    with SessionLocal() as session, pytest.raises(NotFoundError, match="Foodstuff"):
        store.create(session, submitted, user_id=user_id)
    with pytest.raises(NotFoundError):
        store.get(issued_id, user_id=user_id)


def test_creation_can_be_retried_after_a_database_failure(
    source_recipe: tuple[UUID, UUID, int],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, source, user_id = source_recipe
    submitted = payload(source)
    issued_id = uuid4()
    monkeypatch.setattr("app.recipes.services.proposal_store.uuid4", lambda: issued_id)

    def fail_query(_state: ORMExecuteState) -> None:
        raise SQLAlchemyError("Unavailable")

    store = RecipeProposalStore()
    with SessionLocal() as session:
        event.listen(session, "do_orm_execute", fail_query, once=True)
        with pytest.raises(SQLAlchemyError, match="Unavailable"):
            store.create(session, submitted, user_id=user_id)
    with pytest.raises(NotFoundError):
        store.get(issued_id, user_id=user_id)
    with SessionLocal() as session:
        proposal = store.create(session, submitted, user_id=user_id)
    assert store.get(proposal.proposalId, user_id=user_id) == proposal


def test_mutated_invalid_payload_is_revalidated_before_retention(
    source_recipe: tuple[UUID, UUID, int],
) -> None:
    _, source, user_id = source_recipe
    store = RecipeProposalStore()
    submitted = payload(source)
    submitted.recipe.servings = 0
    with SessionLocal() as session, pytest.raises(ValidationError):
        store.create(session, submitted, user_id=user_id)


@pytest.mark.parametrize("field", ["ingredients", "steps"])
def test_proposal_requires_complete_recipe_content(field: str) -> None:
    content = recipe()
    del content[field]

    with pytest.raises(ValidationError) as error:
        RecipeProposalCreate.model_validate(
            {"sourceRecipeVersionId": uuid4(), "recipe": content}
        )
    assert [(item["loc"], item["type"]) for item in error.value.errors()] == [
        (("recipe", field), "missing")
    ]


@pytest.mark.parametrize(
    ("field", "value", "error_type"),
    [
        ("name", "", "string_too_short"),
        ("name", "x" * 201, "string_too_long"),
        ("servings", 0, "greater_than_equal"),
        ("servings", 100, "less_than_equal"),
        ("preptime", 0, "greater_than_equal"),
        ("preptime", 1000, "less_than_equal"),
        ("imageId", None, "extra_forbidden"),
    ],
)
def test_proposal_recipe_validation(field: str, value: object, error_type: str) -> None:
    with pytest.raises(ValidationError) as error:
        payload(uuid4(), **{field: value})
    assert [(item["loc"], item["type"]) for item in error.value.errors()] == [
        (("recipe", field), error_type)
    ]


def test_proposal_rejects_duplicate_ingredient_indexes() -> None:
    with pytest.raises(ValidationError, match="ingredient indexes must be unique"):
        payload(uuid4(), ingredients=[existing(), temporary(index=1)])


def test_proposal_rejects_duplicate_existing_foodstuffs() -> None:
    with pytest.raises(ValidationError, match="foodstuffs must be unique"):
        payload(uuid4(), ingredients=[existing(), existing(index=2)])


def test_proposal_rejects_duplicate_step_indexes() -> None:
    with pytest.raises(ValidationError, match="step indexes must be unique"):
        payload(
            uuid4(),
            steps=[{"index": 1, "description": "A"}, {"index": 1, "description": "B"}],
        )


@pytest.mark.parametrize(
    ("field", "value", "error_type"),
    [
        ("amount", 0, "greater_than"),
        ("amount", 10000, "less_than_equal"),
        ("amount", "200", "value_error"),
        ("index", True, "int_type"),
        ("index", 100, "less_than_equal"),
        ("extra", 1, "extra_forbidden"),
    ],
)
def test_proposal_ingredient_validation(
    field: str, value: object, error_type: str
) -> None:
    with pytest.raises(ValidationError) as error:
        ProposalIngredient.model_validate({**existing(), field: value})
    assert [(item["loc"], item["type"]) for item in error.value.errors()] == [
        ((field,), error_type)
    ]


@pytest.mark.parametrize(
    ("foodstuff", "location", "error_type"),
    [
        ({"foodstuffId": 1}, (), "union_tag_not_found"),
        ({"kind": "unknown"}, (), "union_tag_invalid"),
        (
            {"kind": "existing", "foodstuffId": 1, "definition": {}},
            ("existing", "definition"),
            "extra_forbidden",
        ),
        (
            {
                "kind": "temporary",
                "foodstuffId": 1,
                "definition": {"name": "Bean", "unit": "G"},
            },
            ("temporary", "foodstuffId"),
            "extra_forbidden",
        ),
        (
            {"kind": "existing", "foodstuffId": 0},
            ("existing", "foodstuffId"),
            "greater_than",
        ),
        (
            {"kind": "temporary", "definition": {"name": "Bean"}},
            ("temporary", "definition", "unit"),
            "missing",
        ),
        (
            {"kind": "temporary", "definition": {"unit": "G"}},
            ("temporary", "definition", "name"),
            "missing",
        ),
    ],
)
def test_proposal_foodstuff_validation(
    foodstuff: dict[str, object], location: tuple[str, ...], error_type: str
) -> None:
    with pytest.raises(ValidationError) as error:
        ProposalIngredient.model_validate({**existing(), "foodstuff": foodstuff})
    assert [(item["loc"], item["type"]) for item in error.value.errors()] == [
        (("foodstuff", *location), error_type)
    ]


@pytest.mark.parametrize(
    ("field", "value"),
    [("details", "cooked"), ("unit", "ML"), ("kcal", 5), ("brand", "")],
)
def test_temporary_foodstuff_identity_uses_only_name_and_normalized_brand(
    field: str, value: object
) -> None:
    with pytest.raises(ValidationError, match="names and brands"):
        payload(uuid4(), ingredients=[temporary(1), temporary(2, **{field: value})])


def test_temporary_identity_uses_exact_name_and_brand() -> None:
    ingredients = [
        existing(),
        temporary(name="Oats"),
        temporary(index=3, name="oats"),
        temporary(index=4, name="Oats "),
        temporary(index=5, name="Oats", brand="Farm"),
    ]
    assert len(payload(uuid4(), ingredients=ingredients).recipe.ingredients) == len(
        ingredients
    )
