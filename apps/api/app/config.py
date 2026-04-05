"""
Purpose: Centralized environment-based settings for the ClawaaS API.
TODO: Add validation for gateway URLs, sudo provisioner paths, and runtime timeouts.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    app_name: str = Field(default="ClawaaS API")
    environment: str = Field(default="development")
    database_url: str = Field(default="sqlite+aiosqlite:///./clawaas.db")
    jwt_secret: str = Field(default="change-me")
    project_root: str = Field(default="/home/de1030/workspace/ClawaaS")
    gateway_base_url: str = Field(default="http://127.0.0.1:18800")
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])

    model_config = {"env_prefix": "CLAWAAS_", "case_sensitive": False}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance for the current process."""
    return Settings()
