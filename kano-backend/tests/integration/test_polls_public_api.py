"""Integration tests for the public respondent poll-read endpoint (Story 3.4).

Kept separate from ``test_polls_api.py`` because the auth model is
fundamentally different: no CSRF, no session cookie, UUIDv4 is the only
authentication. Tests assert that PM fields never leak (NFR8) and that the
``(project_id, epoch)`` snapshot stays frozen across subsequent PM edits.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine, text

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


def _csrf(client: FlaskClient) -> str:
    r = client.get("/api/v1/csrf-token")
    assert r.status_code == 200
    return json.loads(r.data)["csrf_token"]


def _create_project_with_features(
    client: FlaskClient,
    db_engine: Engine,
    *,
    feature_names: list[str],
) -> UUID:
    token = _csrf(client)
    r = client.post(
        "/api/v1/projects/",
        json={"name": "Public Test", "version": "1.0"},
        headers={"X-CSRF-Token": token},
    )
    assert r.status_code == 201, r.data
    project_id = UUID(json.loads(r.data)["id"])
    # Add features with controlled created_at ordering
    anchor = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    for offset, name in enumerate(feature_names):
        token = _csrf(client)
        r = client.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": name, "description": f"desc-{name}"},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201, r.data
        feature_key = UUID(json.loads(r.data)["feature_key"])
        ts = anchor + timedelta(minutes=offset)
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE features SET created_at = :ts "
                    "WHERE project_id = :pid AND feature_key = :fk"
                ),
                {"ts": ts, "pid": project_id, "fk": feature_key},
            )
    return project_id


def _seed_poll(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int,
    expires_at: datetime | None = None,
) -> UUID:
    poll_id = uuid4()
    expires = expires_at or (datetime.now(tz=UTC) + timedelta(days=7))
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, expires_at) "
                "VALUES (:id, :pid, :epoch, :expires)"
            ),
            {"id": poll_id, "pid": project_id, "epoch": epoch, "expires": expires},
        )
    return poll_id


class TestGetPollPublic:
    def test_success_returns_minimal_disclosure_body(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project_with_features(
            client_migrated,
            db_engine,
            feature_names=["Auto-save", "Dark mode", "Offline mode"],
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        # No CSRF token, no session cookie — pristine client.
        # Use a fresh test_client without first hitting /csrf-token.
        bare_client = client_migrated.application.test_client()
        response = bare_client.get(f"/api/v1/polls/{poll_id}")

        assert response.status_code == 200, response.data
        body = json.loads(response.data)
        # Exactly the public surface, no PM fields.
        assert set(body.keys()) == {"id", "expires_at", "features"}
        assert UUID(body["id"]) == poll_id
        assert len(body["features"]) == 3
        # Each feature is the public projection only
        for feature in body["features"]:
            assert set(feature.keys()) == {"feature_key", "name", "description"}
        # Ordered by created_at ascending (matches authoring order)
        assert [f["name"] for f in body["features"]] == [
            "Auto-save",
            "Dark mode",
            "Offline mode",
        ]

    def test_no_pm_fields_leak(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project_with_features(
            client_migrated, db_engine, feature_names=["F"]
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        bare = client_migrated.application.test_client()
        body = json.loads(bare.get(f"/api/v1/polls/{poll_id}").data)
        for forbidden in ("project_id", "project_name", "epoch", "response_count", "created_at"):
            assert forbidden not in body, f"PM field leaked: {forbidden}"
        for feature in body["features"]:
            for forbidden in ("project_id", "epoch", "id", "is_active", "created_at"):
                assert forbidden not in feature, (
                    f"PM field leaked on feature: {forbidden}"
                )

    def test_expired_returns_410_no_feature_list(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project_with_features(
            client_migrated, db_engine, feature_names=["F"]
        )
        poll_id = _seed_poll(
            db_engine,
            project_id=project_id,
            epoch=1,
            expires_at=datetime.now(tz=UTC) - timedelta(minutes=1),
        )

        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}")

        assert response.status_code == 410, response.data
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/poll-expired"
        assert body["status"] == 410
        assert "features" not in body

    def test_not_found_returns_404(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{uuid4()}")
        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"].endswith("/entity-not-found")

    def test_csrf_exempt(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        """No CSRF token + no session cookie → still returns 200."""

        project_id = _create_project_with_features(
            client_migrated, db_engine, feature_names=["F"]
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        # Fresh client, never touches /csrf-token, sends no X-CSRF-Token.
        bare = client_migrated.application.test_client()
        response = bare.get(f"/api/v1/polls/{poll_id}")
        assert response.status_code == 200, response.data

    def test_snapshot_frozen_after_epoch_bump(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # Project at epoch 1 with 1 feature → create poll → 1 feature on the wire.
        project_id = _create_project_with_features(
            client_migrated, db_engine, feature_names=["Original"]
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        bare = client_migrated.application.test_client()
        body = json.loads(bare.get(f"/api/v1/polls/{poll_id}").data)
        assert len(body["features"]) == 1
        assert body["features"][0]["name"] == "Original"

        # Trigger an epoch bump on the project by adding a feature with ack.
        token = _csrf(client_migrated)
        r = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "Added After", "description": None, "acknowledged": True},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201, r.data

        # Public read on the original poll: snapshot still 1 feature, "Original".
        body = json.loads(bare.get(f"/api/v1/polls/{poll_id}").data)
        assert len(body["features"]) == 1
        assert body["features"][0]["name"] == "Original"
