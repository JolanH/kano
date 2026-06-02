"""Integration tests for :func:`kano.services.poll_service.record_full_submission`.

These exercise the real Postgres testcontainer + migration 0001 schema so
the all-or-nothing transactional contract holds against the actual
constraint set (foreign keys, CHECK ranges, ``CHAR(1)`` category, composite
PK on ``responses``).

Every failure path asserts zero leftover ``submission`` / ``response`` rows
to prove the rollback is end-to-end, not just an exception bubble.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from flask import Flask
from sqlalchemy import Engine, text

from kano import create_app
from kano.db import db as kano_db
from kano.exceptions import (
    EntityNotFound,
    PartialSubmission,
    PollExpired,
    SubmissionFailed,
)
from kano.schemas.submission import AnswerIn, PollSubmission
from kano.services.kano_matrix import Category, compute_category
from kano.services.poll_service import record_full_submission
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


def _seed_project(engine: Engine, *, name: str = "Kano test") -> UUID:
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
    engine: Engine,
    *,
    project_id: UUID,
    epoch: int = 1,
    name: str,
    is_active: bool = True,
) -> tuple[UUID, UUID]:
    feature_id = uuid4()
    feature_key = uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO features "
                "(id, feature_key, project_id, epoch, name, description, is_active) "
                "VALUES (:id, :key, :pid, :epoch, :name, NULL, :active)"
            ),
            {
                "id": feature_id,
                "key": feature_key,
                "pid": project_id,
                "epoch": epoch,
                "name": name,
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


def _row_counts(engine: Engine) -> tuple[int, int]:
    with engine.connect() as conn:
        s = conn.execute(text("SELECT COUNT(*) FROM submissions")).scalar_one()
        r = conn.execute(text("SELECT COUNT(*) FROM responses")).scalar_one()
    return int(s), int(r)


class TestRecordFullSubmissionHappyPath:
    def test_persists_one_submission_and_n_responses(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _, key_a = _seed_feature(db_engine, project_id=project_id, name="Auto-save")
        _, key_b = _seed_feature(db_engine, project_id=project_id, name="Dark mode")
        _, key_c = _seed_feature(db_engine, project_id=project_id, name="Exports")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=key_a, fq_answer=3, dq_answer=5),
                AnswerIn(feature_key=key_b, fq_answer=1, dq_answer=5),
                AnswerIn(feature_key=key_c, fq_answer=1, dq_answer=3),
            ]
        )

        with app_with_migrated_db.app_context():
            submission_id = record_full_submission(poll_id, body)

        assert isinstance(submission_id, UUID)
        assert submission_id.version == 4

        s, r = _row_counts(db_engine)
        assert s == 1
        assert r == 3

    def test_stored_category_matches_matrix(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # Three cells spanning distinct Kano categories — proves the service
        # is calling kano_matrix and not hard-coding a value.
        project_id = _seed_project(db_engine)
        _, key_m = _seed_feature(db_engine, project_id=project_id, name="Must-be")
        _, key_l = _seed_feature(db_engine, project_id=project_id, name="Performance")
        _, key_e = _seed_feature(db_engine, project_id=project_id, name="Attractive")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        pairs = [
            (key_m, 3, 5, Category.MUSTBE),
            (key_l, 1, 5, Category.PERFORMANCE),
            (key_e, 1, 3, Category.ATTRACTIVE),
        ]
        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=k, fq_answer=fq, dq_answer=dq)
                for k, fq, dq, _ in pairs
            ]
        )

        with app_with_migrated_db.app_context():
            record_full_submission(poll_id, body)

        with db_engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT f.feature_key, r.category "
                    "FROM responses r JOIN features f ON f.id = r.feature_id"
                )
            ).all()

        stored = {UUID(str(row[0])): row[1] for row in rows}
        for key, fq, dq, expected_category in pairs:
            assert stored[key] == expected_category.value
            assert stored[key] == compute_category(fq, dq).value

    @pytest.mark.parametrize(
        ("fq", "dq", "expected"),
        [
            (3, 5, Category.MUSTBE),
            (1, 5, Category.PERFORMANCE),
            (1, 3, Category.ATTRACTIVE),
            (5, 5, Category.QUESTIONABLE),
            (5, 3, Category.REVERSE),
            (3, 3, Category.INDIFFERENT),
        ],
    )
    def test_category_pinned_per_cell(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
        fq: int,
        dq: int,
        expected: Category,
    ) -> None:
        project_id = _seed_project(db_engine, name=f"Cell {fq}-{dq}")
        _, key = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        with app_with_migrated_db.app_context():
            record_full_submission(
                poll_id,
                PollSubmission(
                    answers=[AnswerIn(feature_key=key, fq_answer=fq, dq_answer=dq)]
                ),
            )

        with db_engine.connect() as conn:
            stored = conn.execute(text("SELECT category FROM responses")).scalar_one()
        assert stored == expected.value


class TestRecordFullSubmissionPartial:
    def test_missing_answer_raises_and_persists_nothing(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _, key_a = _seed_feature(db_engine, project_id=project_id, name="A")
        _, key_b = _seed_feature(db_engine, project_id=project_id, name="B")
        _, key_c = _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=key_a, fq_answer=1, dq_answer=5),
                AnswerIn(feature_key=key_b, fq_answer=1, dq_answer=3),
            ]
        )

        with app_with_migrated_db.app_context(), pytest.raises(PartialSubmission) as exc_info:
            record_full_submission(poll_id, body)

        assert key_c in exc_info.value.missing
        assert exc_info.value.unexpected == []
        assert exc_info.value.duplicates == []
        assert _row_counts(db_engine) == (0, 0)

    def test_extra_answer_raises_and_persists_nothing(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _, key_a = _seed_feature(db_engine, project_id=project_id, name="A")
        _, key_b = _seed_feature(db_engine, project_id=project_id, name="B")
        _, key_c = _seed_feature(db_engine, project_id=project_id, name="C")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        stray_key = uuid4()
        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=key_a, fq_answer=1, dq_answer=5),
                AnswerIn(feature_key=key_b, fq_answer=1, dq_answer=3),
                AnswerIn(feature_key=key_c, fq_answer=3, dq_answer=5),
                AnswerIn(feature_key=stray_key, fq_answer=2, dq_answer=4),
            ]
        )

        with app_with_migrated_db.app_context(), pytest.raises(PartialSubmission) as exc_info:
            record_full_submission(poll_id, body)

        assert stray_key in exc_info.value.unexpected
        assert exc_info.value.missing == []
        assert _row_counts(db_engine) == (0, 0)

    def test_duplicate_keys_raises_and_persists_nothing(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _, key_a = _seed_feature(db_engine, project_id=project_id, name="A")
        _, key_b = _seed_feature(db_engine, project_id=project_id, name="B")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=key_a, fq_answer=1, dq_answer=5),
                AnswerIn(feature_key=key_a, fq_answer=2, dq_answer=4),
                AnswerIn(feature_key=key_b, fq_answer=1, dq_answer=3),
            ]
        )

        with app_with_migrated_db.app_context(), pytest.raises(PartialSubmission) as exc_info:
            record_full_submission(poll_id, body)

        assert key_a in exc_info.value.duplicates
        assert _row_counts(db_engine) == (0, 0)

    def test_feature_key_from_other_project_treated_as_unexpected(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # Story 4.2 Dev Notes — InvalidFeatureReference collapsed into
        # PartialSubmission.unexpected. Pin that choice here.
        project_a = _seed_project(db_engine, name="A")
        project_b = _seed_project(db_engine, name="B")
        _, key_a = _seed_feature(db_engine, project_id=project_a, name="A1")
        _, key_b_other = _seed_feature(db_engine, project_id=project_b, name="B1")
        poll_id = _seed_poll(db_engine, project_id=project_a)

        body = PollSubmission(
            answers=[AnswerIn(feature_key=key_b_other, fq_answer=1, dq_answer=5)]
        )

        with app_with_migrated_db.app_context(), pytest.raises(PartialSubmission) as exc_info:
            record_full_submission(poll_id, body)

        assert key_b_other in exc_info.value.unexpected
        assert key_a in exc_info.value.missing
        assert _row_counts(db_engine) == (0, 0)


class TestRecordFullSubmissionRejectsClosedOrMissing:
    def test_expired_poll_raises_and_persists_nothing(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        project_id = _seed_project(db_engine)
        _, key = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(
            db_engine,
            project_id=project_id,
            expires_at=datetime.now(tz=UTC) - timedelta(minutes=1),
        )

        body = PollSubmission(
            answers=[AnswerIn(feature_key=key, fq_answer=1, dq_answer=5)]
        )

        with app_with_migrated_db.app_context(), pytest.raises(PollExpired):
            record_full_submission(poll_id, body)

        assert _row_counts(db_engine) == (0, 0)

    def test_unknown_poll_raises_and_persists_nothing(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        body = PollSubmission(
            answers=[AnswerIn(feature_key=uuid4(), fq_answer=1, dq_answer=5)]
        )

        with app_with_migrated_db.app_context(), pytest.raises(EntityNotFound):
            record_full_submission(uuid4(), body)

        assert _row_counts(db_engine) == (0, 0)


class TestRecordFullSubmissionWrapsDbFailures:
    def test_db_error_rolls_back_and_raises_submission_failed(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Force the second `session.add(Response(...))` to raise so the
        # transactional try/except converts the failure into the typed
        # SubmissionFailed envelope. Zero rows must remain.
        project_id = _seed_project(db_engine)
        _, key = _seed_feature(db_engine, project_id=project_id, name="Solo")
        poll_id = _seed_poll(db_engine, project_id=project_id)

        body = PollSubmission(
            answers=[AnswerIn(feature_key=key, fq_answer=3, dq_answer=5)]
        )

        with app_with_migrated_db.app_context():
            original_add = kano_db.session.add
            calls = {"n": 0}

            def boom_on_second(instance: object) -> None:
                calls["n"] += 1
                if calls["n"] >= 2:
                    raise RuntimeError("simulated DB driver failure")
                original_add(instance)

            monkeypatch.setattr(kano_db.session, "add", boom_on_second)

            with pytest.raises(SubmissionFailed) as exc_info:
                record_full_submission(poll_id, body)

        assert exc_info.value.poll_id == poll_id
        assert isinstance(exc_info.value.cause, RuntimeError)
        assert "simulated DB driver failure" in str(exc_info.value.cause)
        assert _row_counts(db_engine) == (0, 0)


class TestSnapshotFrozenAcrossEpochBump:
    def test_old_epoch_keys_still_succeed_after_bump(
        self,
        app_with_migrated_db: Flask,
        db_engine: Engine,
    ) -> None:
        # Pairs with the equivalent creation-side (3.2) and read-side (3.4)
        # tests — proves the poll stays pinned to its creation epoch for the
        # full lifecycle, even after the project's current_epoch advances.
        project_id = _seed_project(db_engine)
        _, key_a_e1 = _seed_feature(
            db_engine, project_id=project_id, epoch=1, name="A"
        )
        _, key_b_e1 = _seed_feature(
            db_engine, project_id=project_id, epoch=1, name="B"
        )
        poll_id = _seed_poll(db_engine, project_id=project_id, epoch=1)

        # Simulate epoch bump: project moves to epoch 2, fresh feature rows
        # land at epoch=2 (different feature_id), and the epoch-1 rows stay
        # in place — the poll's pinned snapshot must still resolve.
        with db_engine.begin() as conn:
            conn.execute(
                text("UPDATE projects SET current_epoch = 2 WHERE id = :pid"),
                {"pid": project_id},
            )
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="A")
        _seed_feature(db_engine, project_id=project_id, epoch=2, name="B")

        body = PollSubmission(
            answers=[
                AnswerIn(feature_key=key_a_e1, fq_answer=1, dq_answer=5),
                AnswerIn(feature_key=key_b_e1, fq_answer=2, dq_answer=4),
            ]
        )

        with app_with_migrated_db.app_context():
            record_full_submission(poll_id, body)

        # Each response.feature_id must point at the epoch-1 row, not epoch-2.
        with db_engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT f.epoch FROM responses r "
                    "JOIN features f ON f.id = r.feature_id"
                )
            ).all()
        assert all(row[0] == 1 for row in rows)
        assert _row_counts(db_engine) == (1, 2)
