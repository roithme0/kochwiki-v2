from collections.abc import Sequence

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db, get_write_db
from app.models.enums import Unit
from app.schemas.errors import CONFLICT_RESPONSE, NOT_FOUND_AND_CONFLICT_RESPONSES, NOT_FOUND_RESPONSE
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffOut, FoodstuffUnitChoices, FoodstuffUpdate, FoodstuffVerboseNames
from app.services import foodstuffs

router = APIRouter()


@router.get("/foodstuffs", response_model=list[FoodstuffOut])
def get_foodstuffs(session: Session = Depends(get_db)) -> Sequence[FoodstuffOut]:
    return [foodstuffs.foodstuff_out(foodstuff) for foodstuff in foodstuffs.list_foodstuffs(session)]


@router.get("/foodstuffs/{foodstuff_id}", response_model=FoodstuffOut, responses=NOT_FOUND_RESPONSE)
def get_foodstuff(foodstuff_id: int, session: Session = Depends(get_db)) -> FoodstuffOut:
    return foodstuffs.foodstuff_out(foodstuffs.get_foodstuff(session, foodstuff_id))


@router.post("/foodstuffs", response_model=FoodstuffOut, status_code=status.HTTP_201_CREATED, responses=CONFLICT_RESPONSE)
def post_foodstuff(payload: FoodstuffCreate, session: Session = Depends(get_write_db, scope="function")) -> FoodstuffOut:
    foodstuff = foodstuffs.create_foodstuff(session, payload)
    return foodstuffs.foodstuff_out(foodstuff)


@router.patch("/foodstuffs/{foodstuff_id}", response_model=FoodstuffOut, responses=NOT_FOUND_AND_CONFLICT_RESPONSES)
def patch_foodstuff(
    foodstuff_id: int, payload: FoodstuffUpdate, session: Session = Depends(get_write_db, scope="function")
) -> FoodstuffOut:
    foodstuff = foodstuffs.update_foodstuff(session, foodstuff_id, payload)
    return foodstuffs.foodstuff_out(foodstuff)


@router.delete("/foodstuffs/{foodstuff_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND_AND_CONFLICT_RESPONSES)
def delete_foodstuff(foodstuff_id: int, session: Session = Depends(get_write_db, scope="function")) -> Response:
    foodstuffs.delete_foodstuff(session, foodstuff_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/foodstuffs-meta-data/verbose-names", response_model=FoodstuffVerboseNames)
def get_foodstuff_verbose_names() -> FoodstuffVerboseNames:
    return FoodstuffVerboseNames(
        name="Name",
        brand="Marke",
        unit="Einheit",
        unitVerbose="Einheit",
        kcal="Kalorien",
        carbs="Kohlenhydrate",
        protein="Proteine",
        fat="Fett",
    )


@router.get("/foodstuffs-meta-data/unit-choices", response_model=FoodstuffUnitChoices)
def get_foodstuff_unit_choices() -> FoodstuffUnitChoices:
    return FoodstuffUnitChoices({unit: unit.verbose_name for unit in Unit})
