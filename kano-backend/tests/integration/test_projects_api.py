"""Integration tests for the projects-management API (Epic 2 — Stories 2.2+).

Each test uses a hermetic Postgres 17 testcontainer with migrations applied,
mirroring production wiring. The shared ``_csrf_session`` helper primes a
session cookie + token pair so subsequent state-changing requests pass
through Flask-WTF's CSRF guard.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine, text

from kano import create_app
from tests.conftest import TestConfig


@pytest.fixture
def app_with_migrated_db(
    alembic_config: AlembicConfig,
    db_url: str,
) -> Iterator[Flask]:
    """Flask app whose ``db.session`` points at a freshly migrated testcontainer.

    The fixture composes ``alembic_config`` (migration runner wired to the
    testcontainer URL) with ``create_app``. Teardown disposes the engine
    *and* downgrades the schema so the next test starts from base.
    """

    command.upgrade(alembic_config, "head")

    class _DBConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI = db_url

    from kano.db import db as kano_db

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
    from kano.db import db as kano_db

    with app_with_migrated_db.app_context():
        return kano_db.engine


def _csrf_session(client: FlaskClient) -> str:
    """GET /api/v1/csrf-token; return the token (cookie is already on the jar)."""

    response = client.get("/api/v1/csrf-token")
    assert response.status_code == 200
    token = json.loads(response.data)["csrf_token"]
    assert isinstance(token, str)
    return token


class TestCreateProject:
    def test_create_project_success(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf_session(client_migrated)

        response = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Q3 Prioritization", "version": "1.0"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 201
        body = json.loads(response.data)
        # Response shape matches ProjectResponse
        assert set(body.keys()) == {
            "id",
            "name",
            "version",
            "current_epoch",
            "created_at",
            "updated_at",
        }
        assert body["name"] == "Q3 Prioritization"
        assert body["version"] == "1.0"
        assert body["current_epoch"] == 1
        # ID is a valid UUIDv4
        parsed_id = UUID(body["id"])
        assert parsed_id.version == 4

        # Location header points at the new resource
        assert response.headers.get("Location") == f"/api/v1/projects/{body['id']}"

        # Row actually persisted
        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, name, version, current_epoch FROM projects WHERE id = :id"),
                {"id": parsed_id},
            ).one()
        assert row.name == "Q3 Prioritization"
        assert row.version == "1.0"
        assert row.current_epoch == 1

    def test_create_project_validation_error_missing_name(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        token = _csrf_session(client_migrated)

        response = client_migrated.post(
            "/api/v1/projects/",
            json={"version": "1.0"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 400
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/validation-error"
        assert body["status"] == 400

    def test_create_project_validation_error_name_too_long(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        token = _csrf_session(client_migrated)

        response = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "x" * 201, "version": "1.0"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 400
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/validation-error"

    def test_create_project_without_csrf_returns_problem_details(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        # No GET /csrf-token, no X-CSRF-Token header
        response = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Stealth", "version": "1.0"},
        )

        assert response.status_code == 403
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/csrf-validation-failed"


class TestListProjects:
    def test_list_projects_empty(self, client_migrated: FlaskClient) -> None:
        response = client_migrated.get("/api/v1/projects/")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_list_projects_ordering_newest_first(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf_session(client_migrated)

        # Create three projects via the API, then pin their `created_at`
        # values via direct SQL so the ordering test does not depend on
        # `now()` resolution within rapid-fire transactions (which all share
        # `transaction_timestamp()` and can collapse to the same value on
        # batched inserts / fast machines).
        names = ["Alpha", "Beta", "Gamma"]
        ids: list[str] = []
        for name in names:
            r = client_migrated.post(
                "/api/v1/projects/",
                json={"name": name, "version": "1.0"},
                headers={"X-CSRF-Token": token},
            )
            assert r.status_code == 201
            ids.append(json.loads(r.data)["id"])

        anchor = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        with db_engine.begin() as conn:
            for offset_seconds, project_id in enumerate(ids):
                # Alpha → +0s, Beta → +1s, Gamma → +2s; so Gamma is newest.
                ts = anchor.replace(second=offset_seconds)
                conn.execute(
                    text("UPDATE projects SET created_at = :ts WHERE id = :id"),
                    {"ts": ts, "id": project_id},
                )

        response = client_migrated.get("/api/v1/projects/")
        assert response.status_code == 200
        body = json.loads(response.data)
        assert [p["name"] for p in body] == ["Gamma", "Beta", "Alpha"]

    def test_list_projects_summary_shape(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        token = _csrf_session(client_migrated)

        r = client_migrated.post(
            "/api/v1/projects/",
            json={"name": "Solo", "version": "1.0"},
            headers={"X-CSRF-Token": token},
        )
        assert r.status_code == 201

        response = client_migrated.get("/api/v1/projects/")
        body = json.loads(response.data)
        assert len(body) == 1
        # `updated_at` is omitted from list-item projection per ProjectSummary.
        assert set(body[0].keys()) == {"id", "name", "version", "current_epoch", "created_at"}


def _insert_feature(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int,
    feature_key: UUID,
    name: str,
    description: str | None = None,
    is_active: bool = True,
    created_at: datetime | None = None,
) -> UUID:
    """Insert a feature row directly via SQL. Returns the new feature's UUID.

    Bypasses any API path because feature-mutation endpoints are Story 2-7.
    Detail tests must seed the DB themselves.
    """

    feature_id = uuid4()
    with engine.begin() as conn:
        if created_at is None:
            conn.execute(
                text(
                    "INSERT INTO features "
                    "(id, project_id, epoch, feature_key, name, description, is_active) "
                    "VALUES (:id, :pid, :epoch, :fk, :name, :desc, :active)"
                ),
                {
                    "id": feature_id,
                    "pid": project_id,
                    "epoch": epoch,
                    "fk": feature_key,
                    "name": name,
                    "desc": description,
                    "active": is_active,
                },
            )
        else:
            conn.execute(
                text(
                    "INSERT INTO features "
                    "(id, project_id, epoch, feature_key, name, description, "
                    "is_active, created_at) "
                    "VALUES (:id, :pid, :epoch, :fk, :name, :desc, :active, :created)"
                ),
                {
                    "id": feature_id,
                    "pid": project_id,
                    "epoch": epoch,
                    "fk": feature_key,
                    "name": name,
                    "desc": description,
                    "active": is_active,
                    "created": created_at,
                },
            )
    return feature_id


def _create_project(client: FlaskClient, name: str = "Detail Project") -> dict[str, object]:
    token = _csrf_session(client)
    response = client.post(
        "/api/v1/projects/",
        json={"name": name, "version": "1.0"},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 201, response.data
    body: dict[str, object] = json.loads(response.data)
    return body


class TestGetProjectDetail:
    def test_detail_with_zero_features(self, client_migrated: FlaskClient) -> None:
        project = _create_project(client_migrated)

        response = client_migrated.get(f"/api/v1/projects/{project['id']}")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["id"] == project["id"]
        assert body["name"] == project["name"]
        assert body["current_epoch"] == 1
        assert body["active_features"] == []
        # ProjectDetailResponse keys = ProjectResponse keys + active_features
        assert set(body.keys()) == {
            "id",
            "name",
            "version",
            "current_epoch",
            "created_at",
            "updated_at",
            "active_features",
        }

    def test_detail_filters_to_current_epoch_and_active(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        project = _create_project(client_migrated)
        project_id = UUID(str(project["id"]))

        # Active features at epoch 1 (the current one) — these MUST appear.
        # Use controlled created_at timestamps so we can pin ordering.
        base = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
        _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name="Alpha",
            description="first",
            created_at=base.replace(minute=0),
        )
        _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name="Beta",
            description=None,
            created_at=base.replace(minute=1),
        )
        _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name="Gamma",
            description="third",
            created_at=base.replace(minute=2),
        )
        # Inactive at epoch 1 — MUST NOT appear.
        _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name="Soft-deleted",
            is_active=False,
        )
        # Past epoch — MUST NOT appear.
        _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=0,
            feature_key=uuid4(),
            name="Past",
        )

        response = client_migrated.get(f"/api/v1/projects/{project_id}")

        assert response.status_code == 200
        body = json.loads(response.data)
        names = [f["name"] for f in body["active_features"]]
        assert names == ["Alpha", "Beta", "Gamma"]
        # FeatureSummary key set:
        assert set(body["active_features"][0].keys()) == {
            "id",
            "feature_key",
            "name",
            "description",
            "created_at",
        }
        assert body["active_features"][1]["description"] is None

    def test_detail_404_on_unknown_uuid(self, client_migrated: FlaskClient) -> None:
        response = client_migrated.get(f"/api/v1/projects/{uuid4()}")

        assert response.status_code == 404
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"
        assert body["status"] == 404

    def test_detail_404_on_malformed_uuid_problem_details(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        # Flask's <uuid:> converter rejects at routing; the generic HTTPException
        # handler in api/errors.py wraps it as a Problem Details 404 envelope.
        response = client_migrated.get("/api/v1/projects/not-a-uuid")

        assert response.status_code == 404
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["status"] == 404
        assert body["type"].startswith("https://kano.example.com/problems/http-404")


class TestUpdateProject:
    def test_patch_name_only(self, client_migrated: FlaskClient) -> None:
        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated, name="Original")

        response = client_migrated.patch(
            f"/api/v1/projects/{project['id']}",
            json={"name": "Renamed"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["name"] == "Renamed"
        assert body["version"] == project["version"]
        assert body["current_epoch"] == project["current_epoch"]
        # updated_at must have advanced relative to the pre-patch timestamp.
        assert body["updated_at"] >= project["updated_at"]

    def test_patch_version_only(self, client_migrated: FlaskClient) -> None:
        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated)

        response = client_migrated.patch(
            f"/api/v1/projects/{project['id']}",
            json={"version": "2.0"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["version"] == "2.0"
        assert body["name"] == project["name"]
        assert body["current_epoch"] == project["current_epoch"]

    def test_patch_both_fields(self, client_migrated: FlaskClient) -> None:
        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated)

        response = client_migrated.patch(
            f"/api/v1/projects/{project['id']}",
            json={"name": "N2", "version": "V2"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["name"] == "N2"
        assert body["version"] == "V2"
        assert body["current_epoch"] == 1

    def test_patch_empty_body_rejected(self, client_migrated: FlaskClient) -> None:
        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated)

        response = client_migrated.patch(
            f"/api/v1/projects/{project['id']}",
            json={},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 400
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/validation-error"

    def test_patch_identity_still_refreshes_updated_at(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        """Story 2.5 AC #3 — identity PATCH still refreshes updated_at.

        Sending the same value back ("identity PATCH") leaves SQLAlchemy
        with zero dirty columns, so the model's ``onupdate=func.now()``
        does NOT fire. The service explicitly bumps ``updated_at`` so the
        AC promise "``updated_at`` is refreshed" holds unconditionally on
        a successful 200 response.
        """

        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated, name="SameName")

        response = client_migrated.patch(
            f"/api/v1/projects/{project['id']}",
            json={"name": "SameName"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["name"] == "SameName"
        # Strictly greater than the pre-PATCH timestamp — not merely equal.
        assert body["updated_at"] > project["updated_at"]

    def test_patch_unknown_uuid_returns_404(self, client_migrated: FlaskClient) -> None:
        token = _csrf_session(client_migrated)

        response = client_migrated.patch(
            f"/api/v1/projects/{uuid4()}",
            json={"name": "ghost"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"

    def test_patch_does_not_mutate_features_or_polls(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        """FR4 invariant: PATCH name/version must leave the epoch + feature/poll rows untouched.

        Seeds a feature and a poll for the project, snapshots their rows
        byte-for-byte, runs the PATCH, then re-reads. The snapshots must
        match exactly.
        """

        token = _csrf_session(client_migrated)
        project = _create_project(client_migrated, name="Pre-patch")
        project_id = UUID(str(project["id"]))

        feature_id = _insert_feature(
            db_engine,
            project_id=project_id,
            epoch=1,
            feature_key=uuid4(),
            name="Will-not-change",
            description="invariant",
        )
        # Insert a poll row directly (Poll model has more required cols; we
        # only need the row to *exist* and stay unchanged).
        poll_id = uuid4()
        with db_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO polls "
                    "(id, project_id, epoch, expires_at) "
                    "VALUES (:id, :pid, :epoch, NOW() + INTERVAL '7 days')"
                ),
                {"id": poll_id, "pid": project_id, "epoch": 1},
            )

        # Snapshot the feature + poll rows pre-PATCH.
        with db_engine.connect() as conn:
            feature_before = dict(
                conn.execute(
                    text("SELECT * FROM features WHERE id = :id"),
                    {"id": feature_id},
                )
                .mappings()
                .one()
            )
            poll_before = dict(
                conn.execute(
                    text("SELECT * FROM polls WHERE id = :id"),
                    {"id": poll_id},
                )
                .mappings()
                .one()
            )

        # Do the PATCH.
        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}",
            json={"name": "Post-patch", "version": "9.9"},
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 200
        assert json.loads(response.data)["current_epoch"] == 1

        # Re-snapshot. Byte-identical to the pre-PATCH state.
        with db_engine.connect() as conn:
            feature_after = dict(
                conn.execute(
                    text("SELECT * FROM features WHERE id = :id"),
                    {"id": feature_id},
                )
                .mappings()
                .one()
            )
            poll_after = dict(
                conn.execute(
                    text("SELECT * FROM polls WHERE id = :id"),
                    {"id": poll_id},
                )
                .mappings()
                .one()
            )

        assert feature_before == feature_after
        assert poll_before == poll_after
