from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.infrastructure.database.session import get_db, get_write_db
from app.core.schemas.errors import (
    AUTHENTICATION_RESPONSES,
    NOT_FOUND_AND_CONFLICT_RESPONSES,
    NOT_FOUND_RESPONSE,
)
from app.foodstuffs.schemas.foodstuff import (
    FoodstuffCreate,
    FoodstuffOut,
    FoodstuffUpdate,
)
from app.foodstuffs.services import foodstuffs
from app.identity.dependencies import require_current_user

router = APIRouter(
    dependencies=[Depends(require_current_user, scope="function")],
    responses=AUTHENTICATION_RESPONSES,
)


@router.get("/foodstuffs", response_model=list[FoodstuffOut])
def get_foodstuffs(session: Session = Depends(get_db)) -> Sequence[FoodstuffOut]:
    return [
        foodstuffs.foodstuff_out(foodstuff)
        for foodstuff in foodstuffs.list_foodstuffs(session)
    ]


@router.get(
    "/foodstuffs/{foodstuff_id}",
    response_model=FoodstuffOut,
    responses=NOT_FOUND_RESPONSE,
)
def get_foodstuff(
    foodstuff_id: int, session: Session = Depends(get_db)
) -> FoodstuffOut:
    return foodstuffs.foodstuff_out(foodstuffs.get_foodstuff(session, foodstuff_id))


@router.post(
    "/foodstuffs",
    response_model=FoodstuffOut,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND_AND_CONFLICT_RESPONSES,
)
def post_foodstuff(
    payload: FoodstuffCreate, session: Session = Depends(get_write_db, scope="function")
) -> FoodstuffOut:
    foodstuff = foodstuffs.create_foodstuff(session, payload)
    return foodstuffs.foodstuff_out(foodstuff)


@router.patch(
    "/foodstuffs/{foodstuff_id}",
    response_model=FoodstuffOut,
    responses=NOT_FOUND_AND_CONFLICT_RESPONSES,
)
def patch_foodstuff(
    foodstuff_id: int,
    payload: FoodstuffUpdate,
    session: Session = Depends(get_write_db, scope="function"),
) -> FoodstuffOut:
    foodstuff = foodstuffs.update_foodstuff(session, foodstuff_id, payload)
    return foodstuffs.foodstuff_out(foodstuff)


@router.delete(
    "/foodstuffs/{foodstuff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND_AND_CONFLICT_RESPONSES,
)
def delete_foodstuff(
    foodstuff_id: int, session: Session = Depends(get_write_db, scope="function")
) -> None:
    foodstuffs.delete_foodstuff(session, foodstuff_id)
