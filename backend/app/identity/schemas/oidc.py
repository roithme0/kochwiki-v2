import unicodedata
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Discovery(BaseModel):
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str


class TokenResponse(BaseModel):
    id_token: str


def normalize_display_name(value: object) -> object:
    if not isinstance(value, str):
        return value
    if any(unicodedata.category(char) == "Cc" for char in value):
        raise ValueError("Invalid display name")
    return value.strip()


class Identity(BaseModel):
    model_config = ConfigDict(strict=True)

    iss: str
    sub: str = Field(min_length=1)
    email: str = Field(min_length=1)
    email_verified: bool
    display_name: str = Field(alias="displayName", min_length=1, max_length=50)
    nonce: str

    @field_validator("display_name", mode="before")
    @classmethod
    def validate_display_name(cls, value: object) -> object:
        return normalize_display_name(value)


@dataclass(frozen=True)
class LoginStart:
    url: str
    browser_binding: str
