"""Integration tests for the polls API (Story 3.2 — create endpoint).

Each test routes through the real Flask app + Postgres testcontainer so the
``polls`` table state and migration 0001 schema are exercised end-to-end.
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
from sqlalchemy import Engine, event, text

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


def _create_project(client: FlaskClient) -> UUID:
    token = _csrf(client)
    r = client.post(
        "/api/v1/projects/",
        json={"name": "Poll Test", "version": "1.0"},
        headers={"X-CSRF-Token": token},
    )
    assert r.status_code == 201, r.data
    return UUID(json.loads(r.data)["id"])


def _add_active_feature(client: FlaskClient, project_id: UUID, name: str) -> UUID:
    token = _csrf(client)
    r = client.post(
        f"/api/v1/projects/{project_id}/features",
        json={"name": name, "description": None},
        headers={"X-CSRF-Token": token},
    )
    assert r.status_code == 201, r.data
    return UUID(json.loads(r.data)["feature_key"])


def _seed_poll(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int,
    created_at: datetime,
    expires_at: datetime,
) -> UUID:
    """Insert a poll row directly via SQL with explicit timestamps.

    Necessary because the API path always sets created_at = now(); these
    tests need controlled ordering and expiry windows.
    """

    poll_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, created_at, expires_at) "
                "VALUES (:id, :pid, :epoch, :created, :expires)"
            ),
            {
                "id": poll_id,
                "pid": project_id,
                "epoch": epoch,
                "created": created_at,
                "expires": expires_at,
            },
        )
    return poll_id


def _seed_submissions(engine: Engine, *, poll_id: UUID, count: int) -> None:
    with engine.begin() as conn:
        for _ in range(count):
            conn.execute(
                text("INSERT INTO submissions (id, poll_id) VALUES (:id, :pid)"),
                {"id": uuid4(), "pid": poll_id},
            )


class TestCreatePoll:
    def test_create_poll_success(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "Auto-save")
        _add_active_feature(client_migrated, project_id, "Dark mode")

        token = _csrf(client_migrated)
        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/polls",
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 201, response.data
        body = json.loads(response.data)

        assert set(body.keys()) == {
            "id",
            "project_id",
            "epoch",
            "created_at",
            "expires_at",
            "response_count",
            "is_expired",
        }
        poll_id = UUID(body["id"])
        assert poll_id.version == 4
        assert body["project_id"] == str(project_id)
        assert body["epoch"] == 1
        assert body["response_count"] == 0
        assert body["is_expired"] is False

        # expires_at - created_at ≈ 7 days
        created = datetime.fromisoformat(body["created_at"])
        expires = datetime.fromisoformat(body["expires_at"])
        delta = (expires - created).total_seconds()
        assert abs(delta - 7 * 24 * 3600) < 1

        # Location header
        assert response.headers.get("Location") == f"/api/v1/polls/{poll_id}"

        # Row persisted
        with db_engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT id, project_id, epoch FROM polls WHERE id = :id"
                ),
                {"id": poll_id},
            ).one()
        assert row.project_id == project_id
        assert row.epoch == 1

    def test_create_poll_zero_features_returns_422(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        project_id = _create_project(client_migrated)
        token = _csrf(client_migrated)

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/polls",
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 422, response.data
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/poll-requires-features"
        assert body["status"] == 422
        assert "no active features" in body["detail"]

    def test_create_poll_after_soft_delete_returns_422(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        # Add a feature then soft-delete it — the project still exists but
        # has zero active features on the current epoch.
        project_id = _create_project(client_migrated)
        feature_key = _add_active_feature(client_migrated, project_id, "Auto-save")
        token = _csrf(client_migrated)
        r = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 204, r.data

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/polls",
            headers={"X-CSRF-Token": _csrf(client_migrated)},
        )
        assert response.status_code == 422, response.data
        body = json.loads(response.data)
        assert body["type"].endswith("/poll-requires-features")

    def test_create_poll_nonexistent_project_returns_404(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        token = _csrf(client_migrated)
        ghost = uuid4()
        response = client_migrated.post(
            f"/api/v1/projects/{ghost}/polls",
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 404, response.data
        body = json.loads(response.data)
        assert body["type"].endswith("/entity-not-found")

    def test_create_poll_without_csrf_returns_403(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        # Need a project but skip CSRF on the POST /polls call.
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "Auto-save")

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/polls",
        )
        assert response.status_code == 403
        body = json.loads(response.data)
        assert body["type"].endswith("/csrf-validation-failed")

    def test_poll_epoch_does_not_drift_after_subsequent_bump(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # Project at epoch 1 → create poll → poll.epoch == 1.
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "Auto-save")

        token = _csrf(client_migrated)
        r = client_migrated.post(
            f"/api/v1/projects/{project_id}/polls",
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201, r.data
        poll_id = UUID(json.loads(r.data)["id"])

        # Bump the epoch by adding a feature with `acknowledged=true`.
        # Project's current_epoch flips to 2; poll.epoch must stay 1.
        token = _csrf(client_migrated)
        r = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "Dark mode", "description": None, "acknowledged": True},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201, r.data

        with db_engine.connect() as conn:
            project_epoch = int(
                conn.execute(
                    text("SELECT current_epoch FROM projects WHERE id = :id"),
                    {"id": project_id},
                ).scalar_one()
            )
            poll_epoch = int(
                conn.execute(
                    text("SELECT epoch FROM polls WHERE id = :id"),
                    {"id": poll_id},
                ).scalar_one()
            )
        assert project_epoch == 2
        assert poll_epoch == 1


class TestListPollsForProject:
    def test_sorted_newest_first(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "F")
        now = datetime.now(tz=UTC)
        ids = [
            _seed_poll(
                db_engine,
                project_id=project_id,
                epoch=1,
                created_at=now - timedelta(minutes=m),
                expires_at=now + timedelta(days=7),
            )
            for m in (3, 2, 1)
        ]

        response = client_migrated.get(f"/api/v1/projects/{project_id}/polls")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 3
        # Newest-first: the poll created 1 minute ago should come first.
        assert [UUID(p["id"]) for p in body] == [ids[2], ids[1], ids[0]]

    def test_includes_expired_with_correct_flag(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "F")
        now = datetime.now(tz=UTC)
        active = _seed_poll(
            db_engine,
            project_id=project_id,
            epoch=1,
            created_at=now - timedelta(hours=1),
            expires_at=now + timedelta(days=7),
        )
        expired = _seed_poll(
            db_engine,
            project_id=project_id,
            epoch=1,
            created_at=now - timedelta(days=10),
            expires_at=now - timedelta(days=3),
        )

        response = client_migrated.get(f"/api/v1/projects/{project_id}/polls")
        assert response.status_code == 200
        body = json.loads(response.data)
        by_id = {UUID(p["id"]): p for p in body}
        assert by_id[active]["is_expired"] is False
        assert by_id[expired]["is_expired"] is True

    def test_response_counts(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _create_project(client_migrated)
        _add_active_feature(client_migrated, project_id, "F")
        now = datetime.now(tz=UTC)
        empty = _seed_poll(
            db_engine,
            project_id=project_id,
            epoch=1,
            created_at=now - timedelta(hours=2),
            expires_at=now + timedelta(days=7),
        )
        with_three = _seed_poll(
            db_engine,
            project_id=project_id,
            epoch=1,
            created_at=now - timedelta(hours=1),
            expires_at=now + timedelta(days=7),
        )
        _seed_submissions(db_engine, poll_id=with_three, count=3)

        response = client_migrated.get(f"/api/v1/projects/{project_id}/polls")
        assert response.status_code == 200
        by_id = {UUID(p["id"]): p for p in json.loads(response.data)}
        assert by_id[empty]["response_count"] == 0
        assert by_id[with_three]["response_count"] == 3

    def test_returns_404_for_missing_project(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        response = client_migrated.get(f"/api/v1/projects/{uuid4()}/polls")
        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"].endswith("/entity-not-found")

    def test_returns_empty_array_when_no_polls(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        project_id = _create_project(client_migrated)
        response = client_migrated.get(f"/api/v1/projects/{project_id}/polls")
        assert response.status_code == 200
        assert json.loads(response.data) == []


class TestListPollsAllProjects:
    def test_empty_returns_empty_array(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        response = client_migrated.get("/api/v1/polls")
        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_enriched_with_project_fields_and_sorted_desc(
        self,
        client_migrated: FlaskClient,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # Two projects, two polls each, distinct created_at values
        token = _csrf(client_migrated)
        r = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Alpha", "version": "1.0"},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201
        alpha_id = UUID(json.loads(r.data)["id"])
        r = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Beta", "version": "2.0"},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201
        beta_id = UUID(json.loads(r.data)["id"])

        now = datetime.now(tz=UTC)
        polls: list[tuple[str, str, UUID]] = []
        for i, project_id in enumerate([alpha_id, alpha_id, beta_id, beta_id]):
            name = "Alpha" if project_id == alpha_id else "Beta"
            version = "1.0" if project_id == alpha_id else "2.0"
            polls.append(
                (
                    name,
                    version,
                    _seed_poll(
                        db_engine,
                        project_id=project_id,
                        epoch=1,
                        created_at=now - timedelta(minutes=10 - i),
                        expires_at=now + timedelta(days=7),
                    ),
                )
            )

        response = client_migrated.get("/api/v1/polls")
        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 4
        for row in body:
            assert {
                "id",
                "project_id",
                "epoch",
                "created_at",
                "expires_at",
                "response_count",
                "is_expired",
                "project_name",
                "project_version",
            }.issubset(row.keys())
        # Newest first → reverse order of insertion (i=3 created last)
        assert [UUID(p["id"]) for p in body] == [p[2] for p in reversed(polls)]
        # Project enrichment correct
        for row in body:
            if UUID(row["project_id"]) == alpha_id:
                assert row["project_name"] == "Alpha"
                assert row["project_version"] == "1.0"
            else:
                assert row["project_name"] == "Beta"
                assert row["project_version"] == "2.0"

    def test_single_round_trip_no_n_plus_one(
        self,
        client_migrated: FlaskClient,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        """AC #6: response_count aggregation must not scale linearly with poll count.

        We snapshot the SELECT-statement count for one project's worth of
        polls + submissions, then add more rows and assert the second call
        does not issue more queries than the first.
        """

        token = _csrf(client_migrated)
        r = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Solo", "version": "1.0"},
            headers={"X-CSRF-Token": token},
        )
        project_id = UUID(json.loads(r.data)["id"])

        now = datetime.now(tz=UTC)

        def seed(n_polls: int, subs_per_poll: int) -> None:
            for i in range(n_polls):
                poll_id = _seed_poll(
                    db_engine,
                    project_id=project_id,
                    epoch=1,
                    created_at=now - timedelta(minutes=i),
                    expires_at=now + timedelta(days=7),
                )
                _seed_submissions(db_engine, poll_id=poll_id, count=subs_per_poll)

        select_counts: list[int] = []

        def make_listener(counter: list[int]):
            def _on_execute(
                conn: object,
                cursor: object,
                statement: str,
                params: object,
                context: object,
                executemany: bool,
            ) -> None:
                if statement.lstrip().upper().startswith("SELECT"):
                    counter[0] += 1

            return _on_execute

        engine = db_engine

        # First call: 3 polls, 2 submissions each
        seed(3, 2)
        counter = [0]
        listener = make_listener(counter)
        event.listen(engine, "before_cursor_execute", listener)
        try:
            response = client_migrated.get("/api/v1/polls")
            assert response.status_code == 200
            assert len(json.loads(response.data)) == 3
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        select_counts.append(counter[0])

        # Second call: 6 polls, 4 submissions each
        seed(3, 4)
        counter = [0]
        listener = make_listener(counter)
        event.listen(engine, "before_cursor_execute", listener)
        try:
            response = client_migrated.get("/api/v1/polls")
            assert response.status_code == 200
            assert len(json.loads(response.data)) == 6
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        select_counts.append(counter[0])

        # Identical SELECT-statement count proves no N+1: aggregation is
        # one query regardless of poll volume.
        assert select_counts[0] == select_counts[1], (
            f"N+1 regression: {select_counts[0]} queries with 3 polls, "
            f"{select_counts[1]} with 6 polls"
        )
