from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from queue import Queue
from time import monotonic, sleep

import pytest
from pydantic import ValidationError
from sqlalchemy import text

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.foodstuffs.schemas.nutrition_enrichment import (
    FoodstuffIdentity,
    NutritionFill,
    NutritionFillResult,
)
from app.foodstuffs.services import foodstuffs
from app.foodstuffs.services.embeddings import foodstuff_refresh
from app.identity.schemas.user import UserOut
from app.infrastructure.database.session import SessionLocal


def identity() -> FoodstuffIdentity:
    return FoodstuffIdentity(details=None, name="Oats", brand="Mill", unit=Unit.G)


def create_oats(owner_id: int) -> int:
    with SessionLocal.begin() as session:
        return foodstuffs.create_foodstuff(
            session,
            FoodstuffCreate(name="Oats", brand="Mill", unit=Unit.G, fat=Decimal(0)),
            owner_id=owner_id,
        ).id


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"fiber": None},
        {"fiber": -1},
        {"fiber": True},
        {"fiber": "NaN"},
        {"fiber": "Infinity"},
        {"fiber": 100000000},
        {"fiber": "0.00001"},
        {"fiber": 1, "name": "Other"},
        {"fiber": 1, "unit": "ML"},
        {"fiber": "not a number"},
    ],
)
def test_fill_rejects_invalid_nutrition(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        NutritionFill.model_validate(payload)


def test_fill_preserves_known_values_and_is_idempotent(mcp_user: UserOut) -> None:
    foodstuff_id = create_oats(mcp_user.id)
    refreshed: list[int] = []
    subscriber = refreshed.append
    nutrition = NutritionFill.model_validate(
        {"kcal": 370, "carbs": 60, "protein": 12, "fat": 7, "fiber": 0}
    )
    foodstuff_refresh.subscribe(subscriber)
    try:
        with SessionLocal.begin() as session:
            result = foodstuffs.fill_foodstuff_nutrition(
                session, foodstuff_id, identity(), nutrition, owner_id=mcp_user.id
            )
        assert result.applied == ["kcal", "carbs", "protein", "fiber"]
        assert result.retained == ["fat"]
        assert result.foodstuff.fat == 0
        assert result.foodstuff.fiber == 0
        with SessionLocal.begin() as session:
            repeated = foodstuffs.fill_foodstuff_nutrition(
                session, foodstuff_id, identity(), nutrition, owner_id=mcp_user.id
            )
        assert repeated.applied == []
        assert repeated.retained == ["kcal", "carbs", "protein", "fat", "fiber"]
        assert repeated.foodstuff == result.foodstuff
        assert refreshed == []
    finally:
        foodstuff_refresh.unsubscribe(subscriber)


@pytest.mark.parametrize(
    "expected",
    [
        FoodstuffIdentity(details="raw", name="Oats", brand="Mill", unit=Unit.G),
        FoodstuffIdentity(details=None, name="Other", brand="Mill", unit=Unit.G),
        FoodstuffIdentity(details=None, name="Oats", brand=None, unit=Unit.G),
        FoodstuffIdentity(details=None, name="Oats", brand="Mill", unit=Unit.ML),
    ],
)
def test_fill_rejects_changed_identity(
    mcp_user: UserOut, expected: FoodstuffIdentity
) -> None:
    foodstuff_id = create_oats(mcp_user.id)
    with SessionLocal.begin() as session:
        with pytest.raises(ConflictError):
            foodstuffs.fill_foodstuff_nutrition(
                session,
                foodstuff_id,
                expected,
                NutritionFill(fiber=Decimal(10)),
                owner_id=mcp_user.id,
            )
        assert foodstuffs.get_foodstuff(session, foodstuff_id).fiber is None


def test_fill_enforces_ownership_and_missing_target(
    mcp_user: UserOut, provider_user: Callable[[str], UserOut]
) -> None:
    foodstuff_id = create_oats(mcp_user.id)
    other = provider_user("Other")
    with SessionLocal.begin() as session:
        with pytest.raises(ForbiddenError):
            foodstuffs.fill_foodstuff_nutrition(
                session,
                foodstuff_id,
                identity(),
                NutritionFill(fiber=Decimal(10)),
                owner_id=other.id,
            )
        with pytest.raises(NotFoundError):
            foodstuffs.fill_foodstuff_nutrition(
                session,
                999999,
                identity(),
                NutritionFill(fiber=Decimal(10)),
                owner_id=mcp_user.id,
            )
        assert foodstuffs.get_foodstuff(session, foodstuff_id).fiber is None


@pytest.mark.parametrize("identity_change", [False, True])
def test_fill_refreshes_stale_objects_after_waiting_for_concurrent_update(
    mcp_user: UserOut, identity_change: bool
) -> None:
    foodstuff_id = create_oats(mcp_user.id)
    worker_pid: Queue[int] = Queue()

    def enrich() -> NutritionFillResult:
        with SessionLocal.begin() as session:
            stale = foodstuffs.get_foodstuff(session, foodstuff_id)
            assert stale.fiber is None
            assert stale.unit == Unit.G
            pid = session.scalar(text("SELECT pg_backend_pid()"))
            assert isinstance(pid, int)
            worker_pid.put(pid)
            return foodstuffs.fill_foodstuff_nutrition(
                session,
                foodstuff_id,
                identity(),
                NutritionFill(fiber=Decimal(10), protein=Decimal(12)),
                owner_id=mcp_user.id,
            )

    with ThreadPoolExecutor(max_workers=1) as pool:
        with SessionLocal.begin() as updating:
            foodstuffs.update_foodstuff(
                updating,
                foodstuff_id,
                (
                    FoodstuffUpdate(unit=Unit.ML)
                    if identity_change
                    else FoodstuffUpdate(fiber=Decimal(0))
                ),
                owner_id=mcp_user.id,
            )
            pending = pool.submit(enrich)
            pid = worker_pid.get(timeout=5)
            deadline = monotonic() + 5
            with SessionLocal() as observer:
                while not observer.scalar(
                    text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": pid}
                ):
                    if monotonic() >= deadline:
                        pytest.fail("Enrichment did not wait for the row lock")
                    sleep(0.01)
            assert not pending.done()
        if identity_change:
            with pytest.raises(ConflictError):
                pending.result(timeout=5)
        else:
            result = pending.result(timeout=5)
            assert result.applied == ["protein"]
            assert result.retained == ["fiber"]
            assert result.foodstuff.fiber == 0
    with SessionLocal() as session:
        current = foodstuffs.get_foodstuff(session, foodstuff_id)
        if identity_change:
            assert current.unit == Unit.ML
            assert current.fiber is None
            assert current.protein is None
        else:
            assert current.fiber == 0
            assert current.protein == 12


def test_explicit_update_refreshes_stale_identity_and_preserves_enrichment(
    mcp_user: UserOut,
) -> None:
    foodstuff_id = create_oats(mcp_user.id)
    with SessionLocal.begin() as editing:
        stale = foodstuffs.get_foodstuff(editing, foodstuff_id)
        assert stale.fiber is None
        with SessionLocal.begin() as enriching:
            foodstuffs.fill_foodstuff_nutrition(
                enriching,
                foodstuff_id,
                identity(),
                NutritionFill(fiber=Decimal(10)),
                owner_id=mcp_user.id,
            )
        current = foodstuffs.update_foodstuff(
            editing,
            foodstuff_id,
            FoodstuffUpdate(protein=Decimal(12)),
            owner_id=mcp_user.id,
        )
        assert current.fiber == 10
        assert current.protein == 12
        assert current.unit == Unit.G
