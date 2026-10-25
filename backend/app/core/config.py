from functools import lru_cache

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.infrastructure.embeddings.config import MODEL
from app.infrastructure.storage.config import StorageConfig


class Settings(BaseSettings):
    openai_api_key: SecretStr | None = None
    embedding_model: str = MODEL
    app_version: str = "0.0.0"
    database_url: str = "postgresql+psycopg://user:password@localhost:5432/kochwiki"
    oidc_issuer: str | None = None
    oidc_client_id: str = "kochwiki"
    oidc_client_secret: SecretStr | None = None
    oidc_callback_url: str | None = None
    oidc_backchannel_url: str | None = None
    oidc_allow_insecure_http: bool = False
    storage_endpoint_url: str | None = None
    storage_public_origin: str | None = None
    storage_region: str | None = None
    storage_bucket_recipe_images: str | None = None
    storage_bucket_foodstuff_images: str | None = None
    storage_access_key_id: SecretStr | None = None
    storage_secret_access_key: SecretStr | None = None
    mcp_allowed_hosts: str = "localhost,localhost:*,127.0.0.1,127.0.0.1:*,[::1],[::1]:*,backend,backend:*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    @field_validator("oidc_issuer", "oidc_client_secret", "oidc_callback_url", "oidc_backchannel_url", mode="before")
    @classmethod
    def empty_oidc_value(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_oidc(self) -> "Settings":
        from app.identity.config import validate_oidc_settings

        validate_oidc_settings(self)
        return self

    @model_validator(mode="after")
    def validate_storage(self) -> "Settings":
        self.storage_config
        return self

    @property
    def storage_config(self) -> StorageConfig | None:
        values = {
            "endpoint_url": self.storage_endpoint_url,
            "public_origin": self.storage_public_origin,
            "region": self.storage_region,
            "bucket_recipe_images": self.storage_bucket_recipe_images,
            "bucket_foodstuff_images": self.storage_bucket_foodstuff_images,
            "access_key_id": self.storage_access_key_id,
            "secret_access_key": self.storage_secret_access_key,
        }
        if all(value is None for value in values.values()):
            return None
        if any(value is None for value in values.values()):
            raise ValueError("Storage configuration requires all seven STORAGE_* settings, including both image buckets")
        return StorageConfig.model_validate(values)

    @property
    def mcp_allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.mcp_allowed_hosts.split(",") if host.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
