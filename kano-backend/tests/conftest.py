"""Shared pytest fixtures for the Kano backend test suite.

The ``postgres_container`` / ``db_url`` / ``alembic_config`` / ``alembic_head``
fixture chain provides every integration test with a hermetic PostgreSQL 17
instance plus a fully migrated schema. Future stories add ORM-session and
Flask-app fixtures alongside these.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine
from testcontainers.postgres import PostgresContainer

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


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
def alembic_config(db_url: str, monkeypatch: pytest.MonkeyPatch) -> Config:
    """Alembic ``Config`` wired to the ephemeral DB.

    Each test gets a fresh Config bound to the test's ``DATABASE_URL`` env
    value; ``migrations/env.py`` resolves the URL from that env var at run
    time so this configuration matches production behavior exactly.
    """

    monkeypatch.setenv("DATABASE_URL", db_url)
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    return config


@pytest.fixture
def alembic_head(alembic_config: Config, db_url: str) -> Iterator[Engine]:
    """Yield an Engine bound to a freshly migrated schema; tear down to base."""

    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    try:
        yield engine
    finally:
        engine.dispose()
        command.downgrade(alembic_config, "base")
