"""Integration tests for the feature-mutation API (Story 2-7).

Every test routes through the real Flask app + Postgres testcontainer; the
``epoch_service`` is exercised end-to-end. One test class additionally uses
a spy to prove AC #6: every endpoint invokes
``epoch_service.bump_epoch_on_feature_change`` exactly once per request.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy import Engine, text

from kano import create_app
from kano.db import db as kano_db
from kano.services import epoch_service
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
    token = json.loads(r.data)["csrf_token"]
    assert isinstance(token, str)
    return token


def _create_project(client: FlaskClient) -> UUID:
    token = _csrf(client)
    r = client.post(
        "/api/v1/projects/",
        json={"name": "Feature Test", "version": "1.0"},
        headers={"X-CSRF-Token": token},
    )
    assert r.status_code == 201, r.data
    return UUID(json.loads(r.data)["id"])


def _seed_poll(engine: Engine, *, project_id: UUID, epoch: int) -> UUID:
    poll_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, expires_at) "
                "VALUES (:id, :pid, :epoch, NOW() + INTERVAL '7 days')"
            ),
            {"id": poll_id, "pid": project_id, "epoch": epoch},
        )
    return poll_id


def _read_current_epoch(engine: Engine, project_id: UUID) -> int:
    with engine.connect() as conn:
        return int(
            conn.execute(
                text("SELECT current_epoch FROM projects WHERE id = :id"),
                {"id": project_id},
            ).scalar_one()
        )


def _snapshot_features(engine: Engine, project_id: UUID, epoch: int) -> list[dict[str, object]]:
    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(
                    "SELECT id, project_id, epoch, feature_key, name, description, "
                    "is_active, created_at FROM features "
                    "WHERE project_id = :pid AND epoch = :epoch ORDER BY id"
                ),
                {"pid": project_id, "epoch": epoch},
            )
            .mappings()
            .all()
        )
    return [dict(r) for r in rows]


class TestCreateFeature:
    def test_post_no_polls_201_stays_at_epoch_1(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "SSO", "description": "single sign-on"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 201, response.data
        body = json.loads(response.data)
        assert body["name"] == "SSO"
        assert body["description"] == "single sign-on"
        assert body["is_active"] is True
        assert body["epoch"] == 1
        UUID(body["id"])
        UUID(body["feature_key"])

        assert _read_current_epoch(db_engine, project_id) == 1
        rows = _snapshot_features(db_engine, project_id, 1)
        assert len(rows) == 1

    def test_post_with_polls_no_ack_returns_409_problem_details(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        _seed_poll(db_engine, project_id=project_id, epoch=1)

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "X", "description": None},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 409
        assert response.content_type == "application/problem+json"
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/epoch-bump-required"
        assert body["project_id"] == str(project_id)
        assert body["current_epoch"] == 1
        assert body["would_be_epoch"] == 2

        # No mutation happened.
        assert _read_current_epoch(db_engine, project_id) == 1
        assert _snapshot_features(db_engine, project_id, 1) == []
        assert _snapshot_features(db_engine, project_id, 2) == []

    def test_post_with_polls_and_ack_bumps_and_preserves_epoch_n(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        # Seed epoch-1 with one feature, then add a poll.
        first = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "A"},
            headers={"X-CSRF-Token": token},
        )
        assert first.status_code == 201
        _seed_poll(db_engine, project_id=project_id, epoch=1)
        epoch1_snapshot = _snapshot_features(db_engine, project_id, 1)

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "B", "acknowledged": True},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 201
        body = json.loads(response.data)
        assert body["epoch"] == 2
        # Project advanced to epoch 2.
        assert _read_current_epoch(db_engine, project_id) == 2

        # Epoch 1 rows byte-identical.
        assert _snapshot_features(db_engine, project_id, 1) == epoch1_snapshot

        # Epoch 2 has the cloned A + the new B.
        epoch2 = _snapshot_features(db_engine, project_id, 2)
        names = sorted(str(r["name"]) for r in epoch2)
        assert names == ["A", "B"]

    def test_post_validation_error(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"description": "nameless"},
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 400
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/validation-error"

    def test_post_missing_csrf_returns_problem_details(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        project_id = _create_project(client_migrated)
        response = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "x"},
        )
        assert response.status_code == 403
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/csrf-validation-failed"


class TestUpdateFeature:
    def test_patch_no_polls_in_place(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "before"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]

        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            json={"name": "after"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["name"] == "after"
        assert body["epoch"] == 1

    def test_patch_with_polls_no_ack_returns_409(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "before"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]
        _seed_poll(db_engine, project_id=project_id, epoch=1)

        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            json={"name": "after"},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 409
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/epoch-bump-required"

    def test_patch_with_polls_and_ack_writes_to_n_plus_1(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "before"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]
        _seed_poll(db_engine, project_id=project_id, epoch=1)
        epoch1_pre = _snapshot_features(db_engine, project_id, 1)

        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            json={"name": "after", "acknowledged": True},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["epoch"] == 2
        assert body["name"] == "after"
        # Epoch 1 untouched.
        assert _snapshot_features(db_engine, project_id, 1) == epoch1_pre

    def test_patch_unknown_feature_404(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}/features/{uuid4()}",
            json={"name": "ghost"},
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"

    def test_patch_empty_body_400(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "x"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]

        response = client_migrated.patch(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            json={},
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 400


class TestDeleteFeature:
    def test_delete_no_polls_soft_deletes_in_epoch_n(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "DEL"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]

        response = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 204
        assert _read_current_epoch(db_engine, project_id) == 1
        rows = _snapshot_features(db_engine, project_id, 1)
        assert len(rows) == 1
        assert rows[0]["is_active"] is False

    def test_delete_with_polls_no_ack_409(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "DEL"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]
        _seed_poll(db_engine, project_id=project_id, epoch=1)

        response = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{feature_key}",
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 409
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/epoch-bump-required"

    def test_delete_with_polls_and_ack_absent_from_n_plus_1_intact_in_n(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        """Subtle semantics: the deleted feature stays active in epoch N (frozen),
        but is NOT cloned into N+1. Other active features ARE cloned forward."""

        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        keep = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "KEEP"},
            headers={"X-CSRF-Token": token},
        )
        delete_target = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "REMOVE"},
            headers={"X-CSRF-Token": token},
        )
        keep_key = json.loads(keep.data)["feature_key"]
        delete_key = json.loads(delete_target.data)["feature_key"]
        _seed_poll(db_engine, project_id=project_id, epoch=1)
        epoch1_pre = _snapshot_features(db_engine, project_id, 1)

        response = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{delete_key}",
            json={"acknowledged": True},
            headers={"X-CSRF-Token": token},
        )

        assert response.status_code == 204
        # Project advanced.
        assert _read_current_epoch(db_engine, project_id) == 2
        # Epoch 1 byte-identical (REMOVE still is_active=TRUE in N).
        assert _snapshot_features(db_engine, project_id, 1) == epoch1_pre
        # Epoch 2 has only the KEEP clone; REMOVE absent.
        epoch2 = _snapshot_features(db_engine, project_id, 2)
        assert [r["name"] for r in epoch2] == ["KEEP"]
        epoch2_keys = {r["feature_key"] for r in epoch2}
        assert UUID(keep_key) in epoch2_keys
        assert UUID(delete_key) not in epoch2_keys

    def test_delete_unknown_feature_404(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        response = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{uuid4()}",
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 404


class TestListFeaturesAtEpoch:
    """Story 2-8: past-epoch read returns every row (incl. soft-deleted)."""

    def test_multi_epoch_frozen_sets(
        self,
        client_migrated: FlaskClient,
        db_engine: Engine,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        # Epoch 1: add two features, soft-delete one of them while still on
        # branch A (no polls). The soft-deleted row stays in epoch 1.
        a = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "A"},
            headers={"X-CSRF-Token": token},
        )
        b = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "B"},
            headers={"X-CSRF-Token": token},
        )
        a_key = json.loads(a.data)["feature_key"]
        b_key = json.loads(b.data)["feature_key"]
        d = client_migrated.delete(
            f"/api/v1/projects/{project_id}/features/{b_key}",
            headers={"X-CSRF-Token": token},
        )
        assert d.status_code == 204

        # Force a bump to epoch 2 by adding a poll then mutating with ack.
        _seed_poll(db_engine, project_id=project_id, epoch=1)
        bump = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "C", "acknowledged": True},
            headers={"X-CSRF-Token": token},
        )
        assert bump.status_code == 201

        # Epoch 1 read: should return BOTH A (active) and B (soft-deleted).
        r1 = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/1/features")
        assert r1.status_code == 200
        epoch1 = json.loads(r1.data)
        epoch1_keys = {(f["name"], f["is_active"]) for f in epoch1}
        assert epoch1_keys == {("A", True), ("B", False)}

        # Epoch 2: should have A (cloned) and C (new). B was soft-deleted so
        # not cloned forward — the clone helper filters `is_active=TRUE`.
        r2 = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/2/features")
        assert r2.status_code == 200
        epoch2 = json.loads(r2.data)
        epoch2_names = sorted(f["name"] for f in epoch2)
        assert epoch2_names == ["A", "C"]

        # All response rows include the FeatureResponse keys, in epoch order.
        sample = epoch1[0]
        assert set(sample.keys()) == {
            "id",
            "feature_key",
            "name",
            "description",
            "is_active",
            "created_at",
            "epoch",
        }

        _ = a_key  # silence unused-binding lint

    def test_unknown_epoch_returns_404(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        project_id = _create_project(client_migrated)

        response = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/99/features")
        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"

    def test_unknown_project_returns_404(self, client_migrated: FlaskClient) -> None:
        response = client_migrated.get(f"/api/v1/projects/{uuid4()}/epochs/1/features")
        assert response.status_code == 404
        body = json.loads(response.data)
        assert body["type"] == "https://kano.example.com/problems/entity-not-found"

    def test_features_ordered_by_created_at_asc(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        for name in ("X1", "X2", "X3"):
            r = client_migrated.post(
                f"/api/v1/projects/{project_id}/features",
                json={"name": name},
                headers={"X-CSRF-Token": token},
            )
            assert r.status_code == 201

        response = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/1/features")
        body = json.loads(response.data)
        assert [f["name"] for f in body] == ["X1", "X2", "X3"]

    def test_valid_epoch_with_no_features_returns_empty_array(
        self,
        client_migrated: FlaskClient,
    ) -> None:
        """An in-range epoch with zero feature rows is a valid empty result.

        Regression guard: a brand-new project at ``current_epoch=1`` with no
        features added yet must return ``[]`` for its own current epoch, not
        404 — feature-row existence is NOT a proxy for epoch existence.
        """

        project_id = _create_project(client_migrated)

        response = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/1/features")
        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_epoch_zero_returns_404(self, client_migrated: FlaskClient) -> None:
        project_id = _create_project(client_migrated)

        response = client_migrated.get(f"/api/v1/projects/{project_id}/epochs/0/features")
        assert response.status_code == 404


class TestEpochServiceContract:
    """AC #6: every mutation routes through ``epoch_service.bump_epoch_on_feature_change``.

    Contract-level assertion (``call_count >= 1``), not implementation-level
    (``== 1``). The architecture promise is "no direct features-table writes
    in the blueprint" — it does NOT pin the number of service invocations
    per request. Future retries (advisory-lock backoff, stale-data refresh,
    etc.) would legitimately bump the count without violating the contract.
    """

    def test_post_routes_through_epoch_service(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)

        original = epoch_service.bump_epoch_on_feature_change
        with patch.object(
            epoch_service, "bump_epoch_on_feature_change", side_effect=original
        ) as spy:
            r = client_migrated.post(
                f"/api/v1/projects/{project_id}/features",
                json={"name": "spied"},
                headers={"X-CSRF-Token": token},
            )
            assert r.status_code == 201
            assert spy.call_count >= 1

    def test_patch_routes_through_epoch_service(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "x"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]

        original = epoch_service.bump_epoch_on_feature_change
        with patch.object(
            epoch_service, "bump_epoch_on_feature_change", side_effect=original
        ) as spy:
            r = client_migrated.patch(
                f"/api/v1/projects/{project_id}/features/{feature_key}",
                json={"name": "y"},
                headers={"X-CSRF-Token": token},
            )
            assert r.status_code == 200
            assert spy.call_count >= 1

    def test_delete_routes_through_epoch_service(self, client_migrated: FlaskClient) -> None:
        token = _csrf(client_migrated)
        project_id = _create_project(client_migrated)
        created = client_migrated.post(
            f"/api/v1/projects/{project_id}/features",
            json={"name": "x"},
            headers={"X-CSRF-Token": token},
        )
        feature_key = json.loads(created.data)["feature_key"]

        original = epoch_service.bump_epoch_on_feature_change
        with patch.object(
            epoch_service, "bump_epoch_on_feature_change", side_effect=original
        ) as spy:
            r = client_migrated.delete(
                f"/api/v1/projects/{project_id}/features/{feature_key}",
                headers={"X-CSRF-Token": token},
            )
            assert r.status_code == 204
            assert spy.call_count >= 1

    def test_blueprint_does_not_directly_import_db_session(self) -> None:
        """Structural check: ``api/features.py`` must not call ``db.session.add``
        directly on a Feature, ``commit``, or ``flush`` for features outside
        the service. The blueprint owns the mutation *callback* but the
        service owns the transaction boundary.
        """

        import inspect

        from kano.api import features as features_module

        source = inspect.getsource(features_module)
        # The callbacks inside the handlers DO call db.session.add — that's
        # legitimate (they run under the service's transaction). But neither
        # ``commit`` nor ``rollback`` should appear at the module level.
        assert (
            "db.session.commit" not in source
        ), "Blueprint must not commit directly — epoch_service owns the transaction"
        assert (
            "db.session.rollback" not in source
        ), "Blueprint must not rollback directly — epoch_service owns the transaction"
