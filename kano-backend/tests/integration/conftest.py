"""Shared fixtures for integration tests that need a migrated DB + Flask app.

These fixtures encapsulate the boilerplate every story's integration test file
has been re-defining locally:

* ``app_with_migrated_db`` — upgrades Alembic to ``head`` against the shared
  testcontainer DB, yields a Flask app wired to that DB, then tears down to
  ``base`` so the next test starts on a clean schema.
* ``client_migrated`` — a Flask test client bound to the above app.
* ``db_engine`` — the live SQLAlchemy ``Engine`` from inside the app context,
  for seed helpers that need raw SQL bypass.

The root ``tests/conftest.py`` already provides the session-scoped
``postgres_container``, ``db_url``, and ``alembic_config`` fixtures; this
module composes them. Older integration test files (``test_polls_public_api``,
``test_poll_submit_api``, ``test_analysis_service``) still define identical
locals — pytest fixture resolution prefers the local definition, so behavior
is unchanged. Future stories can lean on this conftest directly.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine

from kano import create_app
from kano.db import db as kano_db
from tests.conftest import TestConfig


@pytest.fixture
def app_with_migrated_db(
    alembic_config: AlembicConfig,
    db_url: str,
) -> Iterator[Flask]:
    command.upgrade(alembic_config, "head")

    class _DBConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = db_url

    app = create_app(_DBConfig)
    try:
        yield app
    finally:
        with app.app_context():
            kano_db.session.remove()
            kano_db.engine.dispose()
        command.downgrade(alembic_config, "base")


@pytest.fixture
def client_migrated(app_with_migrated_db: Flask) -> FlaskClient:
    return app_with_migrated_db.test_client()


@pytest.fixture
def db_engine(app_with_migrated_db: Flask) -> Engine:
    with app_with_migrated_db.app_context():
        return kano_db.engine
