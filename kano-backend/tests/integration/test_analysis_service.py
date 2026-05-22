"""Integration tests for :func:`kano.services.analysis.build_analysis`.

These exercise the real Postgres testcontainer + migration 0001 schema so the
single-GROUP-BY contract (NFR3, Story 5.1) and the per-scenario shape contract
(FR31–FR37) hold against the actual constraint set.

The query-count gate (AC #8) is implemented via SQLAlchemy's
``before_cursor_execute`` event — counting statements that contain
``GROUP BY``, which is unique to the analysis statement (the ``session.get``
``SELECT polls WHERE id = …`` lookup does not match). That filter is the
documented separation between the in-scope query and the orthogonal poll
lookup.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from sqlalchemy import Engine, event, text

from kano import create_app
from kano.db import db as kano_db
from kano.exceptions import EntityNotFound
from kano.services.analysis import build_analysis
from kano.services.kano_matrix import Category, compute_category
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


# --- Seed helpers (mirror the Story 4.2 test suite for cross-test parity) ----


def _seed_project(engine: Engine, *, name: str = "Kano test", epoch: int = 1) -> UUID:
    project_id = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, version, current_epoch) "
                "VALUES (:id, :name, '1.0', :epoch)"
            ),
            {"id": project_id, "name": name, "epoch": epoch},
        )
    return project_id


def _seed_feature(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int = 1,
    name: str,
    description: str | None = None,
    is_active: bool = True,
) -> tuple[UUID, UUID]:
    feature_id = uuid4()
    feature_key = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO features "
                "(id, feature_key, project_id, epoch, name, description, is_active) "
                "VALUES (:id, :key, :pid, :epoch, :name, :desc, :active)"
            ),
            {
                "id": feature_id,
                "key": feature_key,
                "pid": project_id,
                "epoch": epoch,
                "name": name,
                "desc": description,
                "active": is_active,
            },
        )
    return feature_id, feature_key


def _seed_poll(
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int = 1,
    expires_at: datetime | None = None,
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


def _seed_submission_with_responses(
    engine: Engine,
    *,
    poll_id: UUID,
    responses: list[tuple[UUID, int, int]],
) -> UUID:
    """Insert one submission + one response per ``(feature_id, fq, dq)`` triple.

    The category column is derived from the (fq, dq) pair via
    :func:`compute_category` — same path :func:`record_full_submission`
    takes in production. ``compute_category``'s correctness is exhaustively
    tested in :mod:`tests.unit.test_kano_matrix`, so this helper trusts it.
    """

    submission_id = uuid4()
    now = datetime.now(tz=UTC)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO submissions (id, poll_id, submitted_at) VALUES (:id, :pid, :ts)"),
            {"id": submission_id, "pid": poll_id, "ts": now},
        )
        for feature_id, fq, dq in responses:
            conn.execute(
                text(
                    "INSERT INTO responses "
                    "(submission_id, feature_id, fq_answer, dq_answer, category) "
                    "VALUES (:sid, :fid, :fq, :dq, :cat)"
                ),
                {
                    "sid": submission_id,
                    "fid": feature_id,
                    "fq": fq,
                    "dq": dq,
                    "cat": compute_category(fq, dq).value,
                },
            )
    return submission_id


# --- Query-count gate (AC #8) ------------------------------------------------


@pytest.fixture
def query_recorder(db_engine: Engine) -> Iterator[list[str]]:
    """Capture every cursor-level statement during a build_analysis call.

    Listening at the Engine level (not the Session level) is the official
    SQLAlchemy pattern for query counting; ``before_cursor_execute`` fires
    once per actual round-trip — exactly the granularity NFR3 cares about.
    """

    captured: list[str] = []

    def before_cursor(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        captured.append(statement)

    event.listen(db_engine, "before_cursor_execute", before_cursor)
    try:
        yield captured
    finally:
        event.remove(db_engine, "before_cursor_execute", before_cursor)


class TestSingleGroupByQueryGate:
    """AC #1, #8 — the NFR3 single-round-trip enforcement."""

    def test_build_analysis_emits_exactly_one_group_by_query(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
        query_recorder: list[str],
    ) -> None:
        project_id = _seed_project(db_engine)
        fid_a, _ = _seed_feature(db_engine, project_id=project_id, name="A")
        fid_b, _ = _seed_feature(db_engine, project_id=project_id, name="B")
        fid_c, _ = _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)
        # 5 submissions, each with 3 responses (M / L / E across the 3 features)
        for _ in range(5):
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[
                    (fid_a, 3, 5),
                    (fid_b, 1, 5),
                    (fid_c, 1, 3),
                ],
            )

        with app_with_migrated_db.app_context():
            build_analysis(poll_id)

        # Filter to the analysis statement: only it contains "GROUP BY".
        # The poll-lookup `SELECT polls WHERE id = …` and any other
        # session metadata round-trips are correctly discounted by this
        # filter — that's the documented test pattern from Story 5.1 AC #8.
        group_by_queries = [q for q in query_recorder if "GROUP BY" in q.upper()]
        assert (
            len(group_by_queries) == 1
        ), f"Expected exactly 1 GROUP BY query, got {len(group_by_queries)}: {group_by_queries}"


# --- Correctness matrix (AC #5, #7, #9) --------------------------------------


class TestShapeMatrix:
    def test_zero_submissions_yields_zeroed_distributions(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _seed_feature(db_engine, project_id=project_id, name="A")
        _seed_feature(db_engine, project_id=project_id, name="B")
        _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 0
        assert len(result.features) == 3
        for feature in result.features:
            assert feature.distribution == {
                Category.MANDATORY: 0,
                Category.LINEAR: 0,
                Category.EXCITER: 0,
                Category.INDIFFERENT: 0,
                Category.CONTRADICTORY: 0,
                Category.DOUBTFUL: 0,
            }
            assert feature.dominant_categories == []
            assert feature.dominant_percentage == 0.0

    def test_single_dominant_category(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # 1 feature, 10 submissions: 7 MANDATORY, 2 LINEAR, 1 DOUBTFUL.
        # Map (fq, dq) cells to those categories: 3,5 → M; 1,5 → L; 5,5 → D.
        project_id = _seed_project(db_engine)
        fid, fkey = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # (fq, dq) cells: (3, 5) → MANDATORY; (1, 5) → LINEAR; (5, 5) → DOUBTFUL.
        cells: list[tuple[int, int]] = [(3, 5)] * 7 + [(1, 5)] * 2 + [(5, 5)] * 1
        for fq, dq in cells:
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[(fid, fq, dq)],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 10
        assert len(result.features) == 1
        feature = result.features[0]
        assert feature.feature_key == fkey
        assert feature.distribution == {
            Category.MANDATORY: 7,
            Category.LINEAR: 2,
            Category.EXCITER: 0,
            Category.INDIFFERENT: 0,
            Category.CONTRADICTORY: 0,
            Category.DOUBTFUL: 1,
        }
        assert feature.dominant_categories == [Category.MANDATORY]
        assert feature.dominant_percentage == 70.0

    def test_two_way_tie(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # 5 submissions: 2 M, 2 L, 1 E
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # (3, 5) → MANDATORY; (1, 5) → LINEAR; (1, 3) → EXCITER. Tie at M / L.
        cells: list[tuple[int, int]] = [(3, 5)] * 2 + [(1, 5)] * 2 + [(1, 3)] * 1
        for fq, dq in cells:
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[(fid, fq, dq)],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 5
        feature = result.features[0]
        # Sorted by CHAR-1 value: "L" < "M"
        assert feature.dominant_categories == [Category.LINEAR, Category.MANDATORY]
        assert feature.dominant_percentage == 40.0

    def test_three_way_tie(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # 3 submissions: 1 M, 1 L, 1 E → tie at 33.3%
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # (3, 5) → MANDATORY; (1, 5) → LINEAR; (1, 3) → EXCITER. 3-way tie.
        for fq, dq in [(3, 5), (1, 5), (1, 3)]:
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[(fid, fq, dq)],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 3
        feature = result.features[0]
        # Sorted by value: "E" < "L" < "M"
        assert feature.dominant_categories == [
            Category.EXCITER,
            Category.LINEAR,
            Category.MANDATORY,
        ]
        assert feature.dominant_percentage == 33.3

    def test_all_same_category(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # 5 submissions all INDIFFERENT (3, 3) → I wins at 100.0%
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # (3, 3) → INDIFFERENT.
        for _ in range(5):
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[(fid, 3, 3)],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 5
        feature = result.features[0]
        assert feature.distribution == {
            Category.MANDATORY: 0,
            Category.LINEAR: 0,
            Category.EXCITER: 0,
            Category.INDIFFERENT: 5,
            Category.CONTRADICTORY: 0,
            Category.DOUBTFUL: 0,
        }
        assert feature.dominant_categories == [Category.INDIFFERENT]
        assert feature.dominant_percentage == 100.0

    def test_zero_responses_for_some_features_via_direct_db_insert(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        """LEFT JOIN correctness: feature with zero responses still appears.

        Outside the FR24 contract (which would force a response per active
        feature per submission), so we craft this scenario by inserting
        responses for only a subset of features directly. This exercises
        the LEFT-JOIN-with-NULL-category code path in `_shape_rows`.
        """

        project_id = _seed_project(db_engine)
        fid_a, fkey_a = _seed_feature(db_engine, project_id=project_id, name="A")
        fid_b, fkey_b = _seed_feature(db_engine, project_id=project_id, name="B")
        _, fkey_c = _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        # 2 submissions, but only feature A and B get responses (C is skipped).
        # (3, 5) → MANDATORY for A; (1, 5) → LINEAR for B.
        for _ in range(2):
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[
                    (fid_a, 3, 5),
                    (fid_b, 1, 5),
                ],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        by_key = {f.feature_key: f for f in result.features}
        assert fkey_a in by_key
        assert fkey_b in by_key
        assert fkey_c in by_key

        # A: 2 M
        assert by_key[fkey_a].distribution[Category.MANDATORY] == 2
        assert by_key[fkey_a].dominant_categories == [Category.MANDATORY]
        # B: 2 L
        assert by_key[fkey_b].distribution[Category.LINEAR] == 2
        assert by_key[fkey_b].dominant_categories == [Category.LINEAR]
        # C: all zeros, empty dominants
        assert by_key[fkey_c].distribution == {
            Category.MANDATORY: 0,
            Category.LINEAR: 0,
            Category.EXCITER: 0,
            Category.INDIFFERENT: 0,
            Category.CONTRADICTORY: 0,
            Category.DOUBTFUL: 0,
        }
        assert by_key[fkey_c].dominant_categories == []
        assert by_key[fkey_c].dominant_percentage == 0.0

        # total_submissions: max-per-feature strategy picks 2 (A and B's total)
        # because C has 0 responses. Per Dev Notes: "max picks the correct
        # ceiling from the healthy features."
        assert result.total_submissions == 2


# --- Boundary & lifecycle (AC #6, #7) ----------------------------------------


class TestPollLifecycle:
    def test_unknown_poll_raises_entity_not_found(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,  # noqa: ARG002 — fixture ensures DB is alive
    ) -> None:
        random_id = uuid4()
        with app_with_migrated_db.app_context(), pytest.raises(EntityNotFound) as exc:
            build_analysis(random_id)
        assert "poll" in str(exc.value).lower()
        assert str(random_id) in str(exc.value)

    def test_expired_poll_returns_full_analysis_per_fr32(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # Expired polls are read-blocked for submission + public read, but
        # analysis remains readable (Story 5.1 AC #7, FR32).
        project_id = _seed_project(db_engine)
        fid, _ = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(
            db_engine,
            project_id=project_id,
            expires_at=datetime.now(tz=UTC) - timedelta(days=1),
        )

        # (3, 5) → MANDATORY.
        for _ in range(3):
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[(fid, 3, 5)],
            )

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        assert result.total_submissions == 3
        assert len(result.features) == 1
        assert result.features[0].distribution[Category.MANDATORY] == 3


class TestSnapshotFrozenAfterEpochBump:
    def test_analysis_uses_pinned_epoch_features_only(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        """Mirrors Stories 3.2 / 3.4 / 4.2 snapshot-frozen tests: a poll
        pinned to epoch N continues to see the epoch-N feature set even
        after the project bumps to epoch N+1 with a new feature.
        """

        project_id = _seed_project(db_engine)
        fid_a_e1, fkey_a_e1 = _seed_feature(db_engine, project_id=project_id, epoch=1, name="A")
        fid_b_e1, fkey_b_e1 = _seed_feature(db_engine, project_id=project_id, epoch=1, name="B")
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        # (3, 5) → MANDATORY for A; (1, 5) → LINEAR for B.
        for _ in range(3):
            _seed_submission_with_responses(
                db_engine,
                poll_id=poll_id,
                responses=[
                    (fid_a_e1, 3, 5),
                    (fid_b_e1, 1, 5),
                ],
            )

        # Bump the project to epoch 2 and add a third feature (epoch 2 only).
        with db_engine.begin() as conn:
            conn.execute(
                text("UPDATE projects SET current_epoch = 2 WHERE id = :pid"),
                {"pid": project_id},
            )
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="A")
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="B")
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="C")

        with app_with_migrated_db.app_context():
            result = build_analysis(poll_id)

        # Only the 2 epoch-1 features appear — the epoch-2 features are not
        # in the poll's snapshot.
        assert result.epoch == 1
        assert len(result.features) == 2
        keys = {f.feature_key for f in result.features}
        assert keys == {fkey_a_e1, fkey_b_e1}
        assert result.total_submissions == 3
