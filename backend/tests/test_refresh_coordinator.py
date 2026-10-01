from uuid import UUID

import pytest

from app.db.session import SessionLocal
from app.services.foodstuff_refresh import foodstuff_refresh, mark_foodstuff_refresh
from app.services.recipe_refresh import mark_recipe_refresh, recipe_refresh


def test_independent_domains_savepoints_rollback_and_unsubscribe() -> None:
    foodstuff_ids: list[int] = []
    recipe_ids: list[UUID] = []
    version_id = UUID(int=1)
    foodstuff_refresh.subscribe(foodstuff_ids.append)
    recipe_refresh.subscribe(recipe_ids.append)
    try:
        with SessionLocal() as session:
            session.begin()
            mark_foodstuff_refresh(session, 1)
            mark_foodstuff_refresh(session, 1)
            with session.begin_nested():
                mark_recipe_refresh(session, version_id)
            nested = session.begin_nested()
            mark_foodstuff_refresh(session, 2)
            mark_recipe_refresh(session, UUID(int=2))
            nested.rollback()
            assert foodstuff_ids == [] and recipe_ids == []
            session.commit()
        assert foodstuff_ids == [1] and recipe_ids == [version_id]
        with SessionLocal() as session:
            session.begin()
            with session.begin_nested():
                mark_foodstuff_refresh(session, 3)
                mark_recipe_refresh(session, UUID(int=3))
            session.rollback()
        assert foodstuff_ids == [1] and recipe_ids == [version_id]
        foodstuff_refresh.unsubscribe(foodstuff_ids.append)
        with SessionLocal.begin() as session:
            mark_foodstuff_refresh(session, 4)
            mark_recipe_refresh(session, UUID(int=4))
        assert foodstuff_ids == [1] and recipe_ids == [version_id, UUID(int=4)]
    finally:
        foodstuff_refresh.unsubscribe(foodstuff_ids.append)
        recipe_refresh.unsubscribe(recipe_ids.append)


def test_subscriber_failure_does_not_fail_commit_or_other_subscribers(caplog: pytest.LogCaptureFixture) -> None:
    captured: list[int] = []
    def fail(record_id: int) -> None:
        raise RuntimeError("private diagnostic")
    foodstuff_refresh.subscribe(fail)
    foodstuff_refresh.subscribe(captured.append)
    try:
        with SessionLocal.begin() as session:
            mark_foodstuff_refresh(session, 42)
        assert captured == [42]
        assert "Foodstuff refresh scheduling failed (RuntimeError)" in caplog.text
        assert "private diagnostic" not in caplog.text
    finally:
        foodstuff_refresh.unsubscribe(fail)
        foodstuff_refresh.unsubscribe(captured.append)


def test_mark_requires_transaction() -> None:
    with SessionLocal() as session:
        with pytest.raises(RuntimeError, match="active write transaction"):
            mark_foodstuff_refresh(session, 1)
        with pytest.raises(RuntimeError, match="active write transaction"):
            mark_recipe_refresh(session, UUID(int=1))
