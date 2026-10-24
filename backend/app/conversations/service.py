from httpx2 import Client, RequestError, TimeoutException
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.conversations.schemas import ConversationCreated, RecipeConversationCreate
from app.core.exceptions import NotFoundError
from app.identity.dependencies import HEADERS
from app.recipes.models.recipe import RecipeVersion
from app.recipes.services.recipes import (
    get_recipe_version_by_id,
    recipe_version_out,
    require_recipe_lineage_owner,
)


def create_recipe_conversation(
    session: Session,
    payload: RecipeConversationCreate,
    *,
    user_id: int,
    upstream_url: str | None,
) -> ConversationCreated:
    source = session.get(RecipeVersion, payload.sourceRecipeVersionId)
    if source is None:
        raise NotFoundError("Recipe version not found")
    require_recipe_lineage_owner(session, source.lineage_id, user_id)
    context = recipe_version_out(
        get_recipe_version_by_id(session, source.lineage_id, source.version_id)
    )
    if upstream_url is None:
        raise HTTPException(503, "AI service is not configured.", headers=HEADERS)
    body = {
        "initial_context": {"source": context.model_dump(mode="json")},
        "artifact_capabilities": [
            capability.model_dump(mode="json", exclude_none=True)
            for capability in payload.artifact_capabilities
        ],
    }
    try:
        with Client(timeout=10, follow_redirects=False, trust_env=False) as client:
            response = client.post(
                f"{upstream_url}/api/v1/agents/kochwiki/sessions",
                headers={"X-Application-User": f"kochwiki:{user_id}"},
                json=body,
            )
    except TimeoutException:
        raise HTTPException(504, "AI service timed out.", headers=HEADERS) from None
    except RequestError:
        raise HTTPException(
            502, "AI service is unavailable.", headers=HEADERS
        ) from None
    if response.status_code == 503:
        raise HTTPException(503, "AI service is unavailable.", headers=HEADERS)
    if response.status_code != 201:
        raise HTTPException(502, "Invalid AI service response.", headers=HEADERS)
    try:
        return ConversationCreated.model_validate_json(response.content)
    except ValidationError:
        raise HTTPException(
            502, "Invalid AI service response.", headers=HEADERS
        ) from None
