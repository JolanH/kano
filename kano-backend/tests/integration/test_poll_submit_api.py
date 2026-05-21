"""Integration tests for ``POST /api/v1/polls/:uuid/submit`` (Story 4.3).

Kept separate from ``test_polls_api.py`` (PM CSRF-protected create/list) and
``test_polls_public_api.py`` (public GET) because the auth model differs:
this endpoint accepts un-authenticated POSTs with neither session cookie nor
CSRF token. Tests assert that no PII column exists on the submission tables,
that the structlog event carries IDs/counts only, and that every Problem
Details failure path leaves zero rows behind.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import structlog
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine, inspect, text

from kano import create_app
from kano.db import db as kano_db
from kano.services.kano_matrix import compute_category
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


def _seed_project(engine: Engine, name: str = "Submit Test") -> UUID:
    project_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, version, current_epoch) "
                "VALUES (:id, :name, '1.0', 1)"
            ),
            {"id": project_id, "name": name},
        )
    return project_id


def _seed_feature(
    engine: Engine, *, project_id: UUID, name: str, epoch: int = 1
) -> UUID:
    feature_id = uuid4()
    feature_key = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO features "
                "(id, feature_key, project_id, epoch, name, description, is_active) "
                "VALUES (:id, :key, :pid, :epoch, :name, NULL, TRUE)"
            ),
            {
                "id": feature_id,
                "key": feature_key,
                "pid": project_id,
                "epoch": epoch,
                "name": name,
            },
        )
    return feature_key


def _seed_poll(
    engine: Engine,
    *,
    project_id: UUID,
    expires_at: datetime | None = None,
    epoch: int = 1,
) -> UUID:
    poll_id = uuid4()
    now = datetime.now(tz=UTC)
    expires = expires_at if expires_at is not None else now + timedelta(days=7)
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
                "created": now,
                "expires": expires,
            },
        )
    return poll_id


def _row_counts(engine: Engine) -> tuple[int, int]:
    with engine.connect() as conn:
        s = conn.execute(text("SELECT COUNT(*) FROM submissions")).scalar_one()
        r = conn.execute(text("SELECT COUNT(*) FROM responses")).scalar_one()
    return int(s), int(r)


def _problem(response_data: bytes) -> dict[str, object]:
    return json.loads(response_data)


class TestSubmitPollHappyPath:
    def test_returns_204_with_no_csrf_or_session(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        key_a = _seed_feature(db_engine, project_id=project_id, name="A")
        key_b = _seed_feature(db_engine, project_id=project_id, name="B")
        key_c = _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = {
            "answers": [
                {"feature_key": str(key_a), "fq_answer": 3, "dq_answer": 5},
                {"feature_key": str(key_b), "fq_answer": 1, "dq_answer": 5},
                {"feature_key": str(key_c), "fq_answer": 1, "dq_answer": 3},
            ]
        }
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)

        assert r.status_code == 204, r.data
        assert r.data == b""

        s, n = _row_counts(db_engine)
        assert s == 1
        assert n == 3

        with db_engine.connect() as conn:
            stored = conn.execute(
                text(
                    "SELECT f.feature_key, r.category, r.fq_answer, r.dq_answer "
                    "FROM responses r JOIN features f ON f.id = r.feature_id"
                )
            ).all()

        stored_by_key = {UUID(str(row[0])): row for row in stored}
        for key, fq, dq in [(key_a, 3, 5), (key_b, 1, 5), (key_c, 1, 3)]:
            row = stored_by_key[key]
            assert row[1] == compute_category(fq, dq).value
            assert row[2] == fq
            assert row[3] == dq

    def test_emits_structured_log_without_answer_values(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        key = _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = {
            "answers": [
                {"feature_key": str(key), "fq_answer": 3, "dq_answer": 5},
            ]
        }

        with structlog.testing.capture_logs() as captured:
            r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)
        assert r.status_code == 204

        recorded = [e for e in captured if e.get("event") == "submission_recorded"]
        assert len(recorded) == 1
        entry = recorded[0]
        assert entry["poll_id"] == str(poll_id)
        assert "submission_id" in entry
        assert entry["answer_count"] == 1

        # NFR8 — no answer payload in logs
        for event in captured:
            serialized = json.dumps(event, default=str)
            assert "fq_answer" not in serialized
            assert "dq_answer" not in serialized
            assert str(key) not in serialized


class TestSubmitPollRejectsBadShape:
    def _seed_three_feature_poll(self, engine: Engine) -> tuple[UUID, list[UUID]]:
        project_id = _seed_project(engine)
        keys = [
            _seed_feature(engine, project_id=project_id, name=n) for n in ("A", "B", "C")
        ]
        poll_id = _seed_poll(engine, project_id=project_id)
        return poll_id, keys

    def test_partial_missing_returns_422(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, keys = self._seed_three_feature_poll(db_engine)
        body = {
            "answers": [
                {"feature_key": str(keys[0]), "fq_answer": 3, "dq_answer": 5},
                {"feature_key": str(keys[1]), "fq_answer": 1, "dq_answer": 5},
            ]
        }
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)

        assert r.status_code == 422
        payload = _problem(r.data)
        assert payload["type"].endswith("/partial-submission")
        assert payload["status"] == 422
        assert str(keys[2]) in payload["missing"]
        assert payload["unexpected"] == []
        assert _row_counts(db_engine) == (0, 0)

    def test_partial_extra_returns_422(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, keys = self._seed_three_feature_poll(db_engine)
        stray = uuid4()
        body = {
            "answers": [
                {"feature_key": str(keys[0]), "fq_answer": 3, "dq_answer": 5},
                {"feature_key": str(keys[1]), "fq_answer": 1, "dq_answer": 5},
                {"feature_key": str(keys[2]), "fq_answer": 1, "dq_answer": 3},
                {"feature_key": str(stray), "fq_answer": 2, "dq_answer": 4},
            ]
        }
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)

        assert r.status_code == 422
        payload = _problem(r.data)
        assert payload["type"].endswith("/partial-submission")
        assert str(stray) in payload["unexpected"]
        assert _row_counts(db_engine) == (0, 0)

    def test_duplicate_keys_returns_422(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, keys = self._seed_three_feature_poll(db_engine)
        body = {
            "answers": [
                {"feature_key": str(keys[0]), "fq_answer": 3, "dq_answer": 5},
                {"feature_key": str(keys[0]), "fq_answer": 1, "dq_answer": 5},
                {"feature_key": str(keys[1]), "fq_answer": 1, "dq_answer": 3},
                {"feature_key": str(keys[2]), "fq_answer": 2, "dq_answer": 4},
            ]
        }
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)

        assert r.status_code == 422
        payload = _problem(r.data)
        assert str(keys[0]) in payload["duplicates"]
        assert _row_counts(db_engine) == (0, 0)

    def test_invalid_range_returns_400(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, keys = self._seed_three_feature_poll(db_engine)
        body = {
            "answers": [
                {"feature_key": str(keys[0]), "fq_answer": 0, "dq_answer": 5},
            ]
        }
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)
        assert r.status_code == 400
        payload = _problem(r.data)
        assert payload["type"].endswith("/validation-error")
        assert _row_counts(db_engine) == (0, 0)

    def test_empty_answers_returns_400(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, _ = self._seed_three_feature_poll(db_engine)
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json={"answers": []})
        assert r.status_code == 400
        assert _row_counts(db_engine) == (0, 0)

    def test_missing_answers_field_returns_400(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        poll_id, _ = self._seed_three_feature_poll(db_engine)
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json={})
        assert r.status_code == 400
        assert _row_counts(db_engine) == (0, 0)


class TestSubmitPollRejectsExpiredOrMissing:
    def test_expired_returns_410(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        key = _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(
            db_engine,
            project_id=project_id,
            expires_at=datetime.now(tz=UTC) - timedelta(minutes=1),
        )
        body = {"answers": [{"feature_key": str(key), "fq_answer": 3, "dq_answer": 5}]}
        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)

        assert r.status_code == 410
        payload = _problem(r.data)
        assert payload["type"].endswith("/poll-expired")
        assert _row_counts(db_engine) == (0, 0)

    def test_unknown_uuid_returns_404(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        body = {
            "answers": [{"feature_key": str(uuid4()), "fq_answer": 3, "dq_answer": 5}]
        }
        r = client_migrated.post(f"/api/v1/polls/{uuid4()}/submit", json=body)

        assert r.status_code == 404
        payload = _problem(r.data)
        assert payload["type"].endswith("/entity-not-found")
        assert _row_counts(db_engine) == (0, 0)


class TestSubmitPollPublicSurfaceContract:
    def test_csrf_exempt_no_token_no_cookie(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        # No prior call to /api/v1/csrf-token, no cookie jar manipulation —
        # just an unauthenticated POST. Should reach the handler.
        project_id = _seed_project(db_engine)
        key = _seed_feature(db_engine, project_id=project_id, name="A")
        poll_id = _seed_poll(db_engine, project_id=project_id)
        body = {"answers": [{"feature_key": str(key), "fq_answer": 3, "dq_answer": 5}]}

        r = client_migrated.post(f"/api/v1/polls/{poll_id}/submit", json=body)
        assert r.status_code == 204, r.data

    def test_no_pii_columns_on_submission_tables(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # AC #8 — static schema assertion guards against a future migration
        # accidentally adding e.g. `email` to `submissions`.
        with app_with_migrated_db.app_context():
            inspector = inspect(db_engine)
            for table in ("submissions", "responses"):
                columns = {col["name"] for col in inspector.get_columns(table)}
                forbidden = {"email", "name", "ip", "user_agent", "user_id", "user"}
                leaked = forbidden & columns
                assert not leaked, (
                    f"NFR8: table `{table}` carries PII-shaped columns: {leaked}"
                )
