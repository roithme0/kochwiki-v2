from pydantic import BaseModel, ConfigDict


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: str


NOT_FOUND_RESPONSE = {404: {"model": ErrorResponse}}
CONFLICT_RESPONSE = {409: {"model": ErrorResponse}}
NOT_FOUND_AND_CONFLICT_RESPONSES = {**NOT_FOUND_RESPONSE, **CONFLICT_RESPONSE}
