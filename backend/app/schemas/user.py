from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    username: str
