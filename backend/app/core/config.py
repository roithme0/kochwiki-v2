from functools import lru_cache

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.embedding import MODEL


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
    mcp_allowed_hosts: str = "localhost,localhost:*,127.0.0.1,127.0.0.1:*,[::1],[::1]:*,backend,backend:*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    @field_validator("oidc_issuer", "oidc_client_secret", "oidc_callback_url", "oidc_backchannel_url", mode="before")
    @classmethod
    def empty_oidc_value(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_oidc(self) -> "Settings":
        from app.core.oidc_urls import validate_oidc_settings

        validate_oidc_settings(self)
        return self

    @property
    def mcp_allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.mcp_allowed_hosts.split(",") if host.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
