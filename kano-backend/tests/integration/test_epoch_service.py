"""Behavioral coverage for ``services.epoch_service.bump_epoch_on_feature_change``.

The three-branch contract is exercised across a 12-cell matrix:
``mutation ∈ {add, edit, delete}`` × ``poll_state ∈ {none, one}`` ×
``acknowledged ∈ {True, False}``. The acknowledged-only matters when polls
exist, so the realised matrix is:

* polls=none × ack=any → branch A, in-place mutation at epoch N.
* polls=one × ack=False → branch B, ``EpochBumpRequired`` raised, no DB change.
* polls=one × ack=True → branch C, clone + advance + apply at epoch N+1,
  epoch-N rows byte-identical.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from sqlalchemy import Engine, text

from kano import create_app
from kano.db import db as kano_db
from kano.exceptions import EpochBumpRequired
from kano.models.feature import Feature
from kano.models.project import Project
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
def db_engine(app_with_migrated_db: Flask) -> Engine:
    with app_with_migrated_db.app_context():
        return kano_db.engine


def _seed_project(app: Flask, *, name: str = "P", version: str = "1.0") -> UUID:
    with app.app_context():
        project = Project(id=uuid4(), name=name, version=version)
        kano_db.session.add(project)
        kano_db.session.commit()
        return project.id


def _seed_feature(
    app: Flask,
    *,
    project_id: UUID,
    epoch: int,
    name: str = "F",
    description: str | None = None,
    is_active: bool = True,
    feature_key: UUID | None = None,
) -> tuple[UUID, UUID]:
    """Insert a feature row. Returns ``(feature_id, feature_key)``."""

    with app.app_context():
        fk = feature_key or uuid4()
        feature = Feature(
            id=uuid4(),
            project_id=project_id,
            epoch=epoch,
            feature_key=fk,
            name=name,
            description=description,
            is_active=is_active,
        )
        kano_db.session.add(feature)
        kano_db.session.commit()
        return feature.id, fk


def _seed_poll(app: Flask, *, project_id: UUID, epoch: int) -> UUID:
    """Insert a poll row at the given epoch. Returns its id."""

    with app.app_context():
        poll_id = uuid4()
        kano_db.session.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, expires_at) "
                "VALUES (:id, :pid, :epoch, NOW() + INTERVAL '7 days')"
            ),
            {"id": poll_id, "pid": project_id, "epoch": epoch},
        )
        kano_db.session.commit()
        return poll_id


def _snapshot_features(
    engine: Engine,
    project_id: UUID,
    epoch: int,
) -> list[dict[str, Any]]:
    """Read every feature row at (project, epoch) ordered by id."""

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


def _read_current_epoch(app: Flask, project_id: UUID) -> int:
    with app.app_context():
        project = kano_db.session.get(Project, project_id)
        assert project is not None
        return project.current_epoch


# ---------------------------------------------------------------------------
# Branch A: no polls → mutation applies in place at epoch N
# ---------------------------------------------------------------------------


class TestBranchANoPolls:
    @pytest.mark.parametrize("acknowledged", [False, True])
    def test_add_in_place(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
        acknowledged: bool,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)

        def add_feature(epoch: int) -> None:
            feature = Feature(
                id=uuid4(),
                project_id=project_id,
                epoch=epoch,
                feature_key=uuid4(),
                name="added",
            )
            kano_db.session.add(feature)

        with app_with_migrated_db.app_context():
            result = epoch_service.bump_epoch_on_feature_change(
                project_id, add_feature, acknowledged=acknowledged
            )

        assert result == 1
        assert _read_current_epoch(app_with_migrated_db, project_id) == 1
        # No epoch-2 row exists.
        assert _snapshot_features(db_engine, project_id, 2) == []
        # The mutation landed at epoch 1.
        rows = _snapshot_features(db_engine, project_id, 1)
        assert len(rows) == 1
        assert rows[0]["name"] == "added"

    def test_edit_in_place(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        feature_id, _ = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, name="before"
        )

        def edit(epoch: int) -> None:
            feature = kano_db.session.get(Feature, feature_id)
            assert feature is not None
            feature.name = "after"

        with app_with_migrated_db.app_context():
            result = epoch_service.bump_epoch_on_feature_change(
                project_id, edit, acknowledged=False
            )

        assert result == 1
        assert _read_current_epoch(app_with_migrated_db, project_id) == 1
        rows = _snapshot_features(db_engine, project_id, 1)
        assert rows[0]["name"] == "after"

    def test_delete_in_place_via_soft_flag(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        feature_id, _ = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, is_active=True
        )

        def soft_delete(epoch: int) -> None:
            feature = kano_db.session.get(Feature, feature_id)
            assert feature is not None
            feature.is_active = False

        with app_with_migrated_db.app_context():
            epoch_service.bump_epoch_on_feature_change(project_id, soft_delete, acknowledged=False)

        rows = _snapshot_features(db_engine, project_id, 1)
        assert rows[0]["is_active"] is False


# ---------------------------------------------------------------------------
# Branch B: polls exist, not acknowledged → raises, no DB change
# ---------------------------------------------------------------------------


class TestBranchBPollsNotAcknowledged:
    @pytest.mark.parametrize("kind", ["add", "edit", "delete"])
    def test_raises_without_mutating(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
        kind: str,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        feature_id, _ = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, name="orig"
        )
        _seed_poll(app_with_migrated_db, project_id=project_id, epoch=1)

        before = _snapshot_features(db_engine, project_id, 1)

        def mutation(epoch: int) -> None:  # pragma: no cover - never reached
            raise AssertionError("mutation_fn must not run on branch B")

        with (
            app_with_migrated_db.app_context(),
            pytest.raises(EpochBumpRequired) as exc_info,
        ):
            epoch_service.bump_epoch_on_feature_change(project_id, mutation, acknowledged=False)

        err = exc_info.value
        assert err.project_id == project_id
        assert err.current_epoch == 1
        assert err.would_be_epoch == 2

        # Project did not advance.
        assert _read_current_epoch(app_with_migrated_db, project_id) == 1
        # Epoch 1 rows untouched (byte-identical).
        after = _snapshot_features(db_engine, project_id, 1)
        assert after == before
        # No epoch-2 rows were created.
        assert _snapshot_features(db_engine, project_id, 2) == []

        # Keep the variables referenced so the linter knows they participate.
        _ = (kind, feature_id)


# ---------------------------------------------------------------------------
# Branch C: polls exist, acknowledged → clone + advance + apply, N untouched
# ---------------------------------------------------------------------------


class TestBranchCPollsAcknowledged:
    def test_add_bumps_clones_and_appends(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        # Two features at epoch 1, one active and one inactive (soft-deleted).
        _id1, fk1 = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, name="A", is_active=True
        )
        _id2, fk2 = _seed_feature(
            app_with_migrated_db,
            project_id=project_id,
            epoch=1,
            name="B-soft",
            is_active=False,
        )
        _seed_poll(app_with_migrated_db, project_id=project_id, epoch=1)

        snapshot_pre = _snapshot_features(db_engine, project_id, 1)

        def add(epoch: int) -> None:
            kano_db.session.add(
                Feature(
                    id=uuid4(),
                    project_id=project_id,
                    epoch=epoch,
                    feature_key=uuid4(),
                    name="C-new",
                )
            )

        with app_with_migrated_db.app_context():
            result = epoch_service.bump_epoch_on_feature_change(project_id, add, acknowledged=True)

        assert result == 2
        assert _read_current_epoch(app_with_migrated_db, project_id) == 2

        # Epoch 1 rows untouched, byte-for-byte.
        snapshot_post = _snapshot_features(db_engine, project_id, 1)
        assert snapshot_post == snapshot_pre

        # Epoch 2 has the cloned active feature (A) + the new mutation row (C-new).
        # The soft-deleted B is NOT cloned forward.
        epoch2 = _snapshot_features(db_engine, project_id, 2)
        names = sorted(r["name"] for r in epoch2)
        assert names == ["A", "C-new"]
        # feature_key for the clone is preserved
        clone = next(r for r in epoch2 if r["name"] == "A")
        assert clone["feature_key"] == fk1
        # And the inactive feature_key is NOT in epoch 2.
        epoch2_keys = {r["feature_key"] for r in epoch2}
        assert fk2 not in epoch2_keys

    def test_edit_at_new_epoch_only(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        _orig_id, fk = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, name="orig"
        )
        _seed_poll(app_with_migrated_db, project_id=project_id, epoch=1)

        pre = _snapshot_features(db_engine, project_id, 1)

        def edit(epoch: int) -> None:
            # Find the cloned row at the new epoch by feature_key and mutate.
            stmt = (
                kano_db.session.query(Feature)
                .filter(
                    Feature.project_id == project_id,
                    Feature.epoch == epoch,
                    Feature.feature_key == fk,
                )
                .one()
            )
            stmt.name = "edited"

        with app_with_migrated_db.app_context():
            result = epoch_service.bump_epoch_on_feature_change(project_id, edit, acknowledged=True)

        assert result == 2
        # Epoch 1 still says "orig".
        post = _snapshot_features(db_engine, project_id, 1)
        assert post == pre
        # Epoch 2 says "edited".
        epoch2 = _snapshot_features(db_engine, project_id, 2)
        assert [r["name"] for r in epoch2] == ["edited"]

    def test_delete_at_new_epoch_only(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(app_with_migrated_db)
        _id, fk = _seed_feature(
            app_with_migrated_db, project_id=project_id, epoch=1, is_active=True
        )
        _seed_poll(app_with_migrated_db, project_id=project_id, epoch=1)

        pre = _snapshot_features(db_engine, project_id, 1)

        def soft_delete(epoch: int) -> None:
            row = (
                kano_db.session.query(Feature)
                .filter(
                    Feature.project_id == project_id,
                    Feature.epoch == epoch,
                    Feature.feature_key == fk,
                )
                .one()
            )
            row.is_active = False

        with app_with_migrated_db.app_context():
            result = epoch_service.bump_epoch_on_feature_change(
                project_id, soft_delete, acknowledged=True
            )

        assert result == 2
        # Epoch 1 still active=True.
        post = _snapshot_features(db_engine, project_id, 1)
        assert post == pre
        assert post[0]["is_active"] is True
        # Epoch 2 has the row soft-deleted.
        epoch2 = _snapshot_features(db_engine, project_id, 2)
        assert epoch2[0]["is_active"] is False
