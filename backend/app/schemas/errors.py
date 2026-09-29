from pydantic import BaseModel, ConfigDict


class RequestValidationErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    details: list[dict[str, object]]


VALIDATION_ERROR_RESPONSE = {422: {"model": RequestValidationErrorResponse}}
