from collections.abc import Sequence

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db, get_write_db
from app.schemas.errors import CONFLICT_RESPONSE, NOT_FOUND_AND_CONFLICT_RESPONSES, NOT_FOUND_RESPONSE
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import users

router = APIRouter()


@router.get("/users", response_model=list[UserOut])
def get_users(session: Session = Depends(get_db)) -> Sequence[UserOut]:
    return [UserOut.model_validate(user) for user in users.list_users(session)]


@router.get("/users/{user_id}", response_model=UserOut, responses=NOT_FOUND_RESPONSE)
def get_user(user_id: int, session: Session = Depends(get_db)) -> UserOut:
    return UserOut.model_validate(users.get_user(session, user_id))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, responses=CONFLICT_RESPONSE)
def post_user(payload: UserCreate, session: Session = Depends(get_write_db, scope="function")) -> UserOut:
    user = users.create_user(session, payload)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut, responses=NOT_FOUND_AND_CONFLICT_RESPONSES)
def patch_user(user_id: int, payload: UserUpdate, session: Session = Depends(get_write_db, scope="function")) -> UserOut:
    user = users.update_user(session, user_id, payload)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND_RESPONSE)
def delete_user(user_id: int, session: Session = Depends(get_write_db, scope="function")) -> Response:
    users.delete_user(session, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
