from collections.abc import Sequence

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.infrastructure.database.session import get_db, get_write_db
from app.core.schemas.errors import NOT_FOUND_RESPONSE
from app.identity.schemas.user import UserOut
from app.identity.services import users

router = APIRouter()


@router.get("/users", response_model=list[UserOut])
def get_users(session: Session = Depends(get_db)) -> Sequence[UserOut]:
    return [UserOut.model_validate(user) for user in users.list_users(session)]


@router.get("/users/{user_id}", response_model=UserOut, responses=NOT_FOUND_RESPONSE)
def get_user(user_id: int, session: Session = Depends(get_db)) -> UserOut:
    return UserOut.model_validate(users.get_user(session, user_id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND_RESPONSE)
def delete_user(user_id: int, session: Session = Depends(get_write_db, scope="function")) -> Response:
    users.delete_user(session, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
