from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy.orm import Session

from app.identity.dependencies import require_current_user
from app.identity.models.user import User
from app.infrastructure.database.session import get_write_db
from app.recipes.services.recipes import require_recipe_lineage_owner


def require_lineage_owner(
    lineage_id: UUID,
    user: Annotated[User, Depends(require_current_user)],
    session: Annotated[Session, Depends(get_write_db, scope="function")],
) -> None:
    require_recipe_lineage_owner(session, lineage_id, user.id)
