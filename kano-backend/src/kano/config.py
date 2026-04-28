"""Env-driven application configuration for the Flask app factory.

The class is read by ``app.config.from_object(Config)`` inside ``create_app``;
every attribute below resolves at module import time so ``RuntimeError`` is
raised early when a production deploy is missing a required variable.

Tests inherit from ``Config`` (or override ``app.config`` after creation) to
swap in deterministic values without going through the environment.
"""

from __future__ import annotations

import os

_DEFAULT_DEV_SECRET = "dev-secret-key-not-for-production-do-not-use"  # noqa: S105
_DEFAULT_DEV_DB_URL = "postgresql+psycopg2://kano:kano@localhost:5432/kano"
_DEFAULT_DEV_ORIGINS = "http://localhost:5173"

_FLASK_ENV = os.environ.get("FLASK_ENV", "development")
_IS_DEV = _FLASK_ENV == "development"


def _split_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Config:
    """Application configuration loaded from environment variables."""

    FLASK_ENV: str = _FLASK_ENV

    DATABASE_URL: str = os.environ.get("DATABASE_URL", _DEFAULT_DEV_DB_URL if _IS_DEV else "")
    SQLALCHEMY_DATABASE_URI: str = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    SECRET_KEY: str = os.environ.get("SECRET_KEY", _DEFAULT_DEV_SECRET if _IS_DEV else "")

    CORS_ALLOWED_ORIGINS: list[str] = _split_origins(
        os.environ.get("CORS_ALLOWED_ORIGINS", _DEFAULT_DEV_ORIGINS if _IS_DEV else "")
    )

    SESSION_COOKIE_SECURE: bool = not _IS_DEV
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "Lax"

    WTF_CSRF_TIME_LIMIT: int | None = None

    KANO_VERSION: str = os.environ.get("KANO_VERSION", "dev")


def _validate_required_env() -> None:
    """Fail fast at import time when a non-development deploy is misconfigured."""

    if _IS_DEV:
        return

    missing: list[str] = []
    if not Config.SECRET_KEY:
        missing.append("SECRET_KEY")
    if not Config.DATABASE_URL:
        missing.append("DATABASE_URL")
    if not Config.CORS_ALLOWED_ORIGINS:
        missing.append("CORS_ALLOWED_ORIGINS")

    if missing:
        raise RuntimeError(
            "Required environment variables are missing for "
            f"FLASK_ENV={_FLASK_ENV}: {', '.join(missing)}"
        )


_validate_required_env()


__all__ = ["Config"]
