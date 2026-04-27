"""AC #6: ``alembic upgrade head && alembic downgrade -1 && alembic upgrade head``
must complete without error against a clean Postgres 17 database.

This is the CI-gated proof that migration ``0001_initial_schema`` is reversible
and idempotent — the safety net for the most irreversible artifact in the
project.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_alembic_upgrade_head(alembic_config: Config, db_url: str) -> None:
    """``alembic upgrade head`` produces all 5 tables and required indexes."""

    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert tables.issuperset(
            {"projects", "features", "polls", "submissions", "responses"}
        ), f"Missing domain tables; got {tables}"

        feature_index_cols = {tuple(ix["column_names"]) for ix in inspector.get_indexes("features")}
        assert ("project_id", "epoch") in feature_index_cols, (
            f"features missing composite index on (project_id, epoch); "
            f"indexes: {feature_index_cols}"
        )

        poll_index_names = {ix["name"] for ix in inspector.get_indexes("polls")}
        assert (
            "ix_polls_expires_at" in poll_index_names
        ), f"polls missing index ix_polls_expires_at; indexes: {poll_index_names}"

        submission_index_cols = {
            tuple(ix["column_names"]) for ix in inspector.get_indexes("submissions")
        }
        assert ("poll_id",) in submission_index_cols
    finally:
        engine.dispose()
        command.downgrade(alembic_config, "base")


def test_alembic_roundtrip_completes(alembic_config: Config, db_url: str) -> None:
    """upgrade head → downgrade -1 → upgrade head completes without error."""

    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "-1")

    # After downgrading the only migration, no domain tables remain.
    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert "projects" not in tables
        assert "features" not in tables
        assert "polls" not in tables
        assert "submissions" not in tables
        assert "responses" not in tables
    finally:
        engine.dispose()

    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert tables.issuperset({"projects", "features", "polls", "submissions", "responses"})
    finally:
        engine.dispose()
        command.downgrade(alembic_config, "base")


def test_response_check_constraints_block_invalid_data(alembic_config: Config, db_url: str) -> None:
    """The response CHECK constraints reject out-of-range answers and bad categories."""

    command.upgrade(alembic_config, "head")
    engine = create_engine(db_url)
    try:
        project_id = uuid4()
        feature_id = uuid4()
        poll_id = uuid4()
        submission_id = uuid4()
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO projects (id, name, version, current_epoch) "
                    "VALUES (:id, 'p', '0.1', 1)"
                ),
                {"id": project_id},
            )
            conn.execute(
                text(
                    "INSERT INTO features "
                    "(id, project_id, epoch, feature_key, name) "
                    "VALUES (:id, :pid, 1, :fk, 'f')"
                ),
                {"id": feature_id, "pid": project_id, "fk": uuid4()},
            )
            conn.execute(
                text(
                    "INSERT INTO polls (id, project_id, epoch, expires_at) "
                    "VALUES (:id, :pid, 1, now() + interval '7 days')"
                ),
                {"id": poll_id, "pid": project_id},
            )
            conn.execute(
                text("INSERT INTO submissions (id, poll_id) VALUES (:id, :poll)"),
                {"id": submission_id, "poll": poll_id},
            )

        # Out-of-range answers — both bounds (0 below, 6 above) and both
        # columns (fq_answer, dq_answer) must be rejected.
        invalid_answer_cases = [
            (0, 3, "M"),  # fq_answer below range
            (6, 3, "M"),  # fq_answer above range
            (3, 0, "M"),  # dq_answer below range
            (3, 6, "M"),  # dq_answer above range
        ]
        for fq, dq, cat in invalid_answer_cases:
            with pytest.raises(IntegrityError), engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO responses "
                        "(submission_id, feature_id, fq_answer, dq_answer, category) "
                        "VALUES (:s, :f, :fq, :dq, :cat)"
                    ),
                    {"s": submission_id, "f": feature_id, "fq": fq, "dq": dq, "cat": cat},
                )

        # Category enum is case-sensitive; lowercase, unknown letters, and
        # the empty/space-padded value must all be rejected.
        invalid_category_cases = ["X", "m", "", " "]
        for bad_category in invalid_category_cases:
            with pytest.raises(IntegrityError), engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO responses "
                        "(submission_id, feature_id, fq_answer, dq_answer, category) "
                        "VALUES (:s, :f, 3, 3, :cat)"
                    ),
                    {"s": submission_id, "f": feature_id, "cat": bad_category},
                )

        # A valid row at the upper boundary inserts cleanly.
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO responses "
                    "(submission_id, feature_id, fq_answer, dq_answer, category) "
                    "VALUES (:s, :f, 5, 1, 'M')"
                ),
                {"s": submission_id, "f": feature_id},
            )
    finally:
        engine.dispose()
        command.downgrade(alembic_config, "base")
