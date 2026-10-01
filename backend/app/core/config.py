from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_version: str = "0.0.0"
    database_url: str = "postgresql+psycopg://user:password@localhost:5432/kochwiki"
    mcp_allowed_hosts: str = "localhost,localhost:*,127.0.0.1,127.0.0.1:*,[::1],[::1]:*,backend,backend:*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def mcp_allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.mcp_allowed_hosts.split(",") if host.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
