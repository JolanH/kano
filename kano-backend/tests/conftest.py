"""Shared pytest fixtures for the Kano backend test suite.

The ``postgres_container`` / ``db_url`` / ``alembic_config`` / ``alembic_head``
fixture chain provides every integration test with a hermetic PostgreSQL 17
instance plus a fully migrated schema. The ``app`` / ``client`` fixtures (added
in Story 1.3) yield a configured Flask app and its test client.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine, create_engine
from testcontainers.postgres import PostgresContainer

from kano import create_app
from kano.config import Config as KanoConfig

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


class TestConfig(KanoConfig):
    """Deterministic ``Config`` for the test suite.

    Tests need a stable ``SECRET_KEY`` (so signed session cookies don't drift
    across runs) and explicit CORS origins. Other tests subclass this when they
    need to flip e.g. ``FLASK_ENV`` to exercise production-mode branches.
    """

    TESTING = True
    SECRET_KEY = "test-secret-key-deterministic"  # noqa: S105 - test fixture
    WTF_CSRF_ENABLED = True
    CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
    SESSION_COOKIE_SECURE = False
    FLASK_ENV = "development"


@pytest.fixture(scope="session")
def postgres_container() -> Iterator[PostgresContainer]:
    """Session-scoped Postgres 17 container for all integration tests."""

    with PostgresContainer("postgres:17") as container:
        yield container


@pytest.fixture(scope="session")
def db_url(postgres_container: PostgresContainer) -> str:
    """SQLAlchemy URL pointing at the ephemeral Postgres container."""

    return str(postgres_container.get_connection_url())


@pytest.fixture
def alembic_config(db_url: str, monkeypatch: pytest.MonkeyPatch) -> AlembicConfig:
    """Alembic ``Config`` wired to the ephemeral DB.

    Each test gets a fresh Config bound to the test's ``DATABASE_URL`` env
    value; ``migrations/env.py`` resolves the URL from that env var at run
    time so this configuration matches production behavior exactly.
    """

    monkeypatch.setenv("DATABASE_URL", db_url)
    config = AlembicConfig(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    return config


@pytest.fixture
def alembic_head(alembic_config: AlembicConfig, db_url: str) -> Iterator[Engine]:
    """Yield an Engine bound to a freshly migrated schema; tear down to base."""

    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    try:
        yield engine
    finally:
        engine.dispose()
        command.downgrade(alembic_config, "base")


@pytest.fixture
def app() -> Flask:
    """Flask app built from :class:`TestConfig` for middleware/integration tests."""

    return create_app(TestConfig)


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Test client for the ``app`` fixture."""

    return app.test_client()


@pytest.fixture
def app_with_db(db_url: str) -> Flask:
    """Flask app whose ``db.session`` points at the live testcontainer.

    Used by tests that exercise the database round-trip (e.g. ``/api/v1/health``
    happy path). No migrations are applied; trivial probes like ``SELECT 1``
    succeed against an empty schema.
    """

    class _DBConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = db_url

    return create_app(_DBConfig)


@pytest.fixture
def client_with_db(app_with_db: Flask) -> FlaskClient:
    """Test client bound to :func:`app_with_db`."""

    return app_with_db.test_client()
