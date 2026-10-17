from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator


class StorageConfig(BaseModel):
    model_config = ConfigDict(frozen=True, hide_input_in_errors=True)

    endpoint_url: str
    public_origin: str
    region: str = Field(min_length=1)
    bucket_recipe_images: str = Field(min_length=1)
    bucket_foodstuff_images: str = Field(min_length=1)
    access_key_id: SecretStr
    secret_access_key: SecretStr

    @model_validator(mode="after")
    def validate_distinct_buckets(self) -> "StorageConfig":
        if self.bucket_recipe_images == self.bucket_foodstuff_images:
            raise ValueError("Recipe and foodstuff image buckets must be distinct")
        return self

    @field_validator("endpoint_url", "public_origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or any(character.isspace() for character in value)
        ):
            raise ValueError("Storage addresses must be HTTP(S) origins without a path or credentials")
        try:
            parsed.port
        except ValueError:
            raise ValueError("Storage address has an invalid port") from None
        return value.rstrip("/")

    @field_validator("access_key_id", "secret_access_key")
    @classmethod
    def validate_credential(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("Storage credentials must not be empty")
        return value
