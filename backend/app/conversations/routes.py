from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.conversations.schemas import ConversationCreated, RecipeConversationCreate
from app.conversations.service import create_recipe_conversation
from app.core.config import get_settings
from app.core.schemas.errors import (
    AUTHENTICATION_RESPONSES,
    ErrorResponse,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.identity.dependencies import require_current_user
from app.identity.models.user import User
from app.infrastructure.database.session import get_db

router = APIRouter()


@router.post(
    "/recipe-conversations",
    response_model=ConversationCreated,
    status_code=201,
    responses={
        **AUTHENTICATION_RESPONSES,
        **FORBIDDEN_RESPONSE,
        **NOT_FOUND_RESPONSE,
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse, "description": "Login or AI service unavailable"},
        504: {"model": ErrorResponse},
    },
)
def create_conversation(
    payload: RecipeConversationCreate,
    user: User = Depends(require_current_user, scope="function"),
    session: Session = Depends(get_db),
) -> ConversationCreated:
    return create_recipe_conversation(
        session, payload, user_id=user.id, upstream_url=get_settings().ai_gateway_url
    )
