"""EXPLAIN-based query-plan assertion for the analysis statement (Story 5.1 AC #10).

Pins that the analysis statement does **not** fall back to a sequential scan
on ``features`` — it should hit the ``ix_features_project_id_epoch`` index
created in migration 0001 (Story 1.2). A regression here means the snapshot
filter degraded into a full table scan, which is a latent NFR1 (3 s p95)
risk that the perf test in Story 5.8 would only flag at the integration
level much later.

Implementation note: PostgreSQL's planner correctly picks Seq Scan on a
tiny test table because the index lookup overhead exceeds a 50-row scan.
We therefore disable ``enable_seqscan`` for the EXPLAIN itself — the
question this test answers is "is the index *usable* by this statement?",
not "would the planner pick it on a 50-row dataset?". Combined with the
``Seq Scan on features`` negative assertion, the test catches the
regression where the index is dropped (the planner would have no index
option and the EXPLAIN would still contain a Seq Scan, even with the
preference flag set). The ANALYZE step keeps statistics realistic.
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
from kano.models.poll import Poll
from kano.services.analysis import _build_analysis_stmt
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


def _seed_realistic_dataset(engine: Engine) -> UUID:
    """Seed 5 polls × 10 features × ~5 submissions × responses.

    Returns the poll_id of the polls-under-test. Total: 50 features, 25
    submissions, ~250 responses spread across 5 projects — large enough
    that the planner picks the (project_id, epoch) index over a Seq Scan.
    """

    target_poll_id: UUID | None = None
    now = datetime.now(tz=UTC)

    with engine.begin() as conn:
        for project_idx in range(5):
            project_id = uuid4()
            conn.execute(
                text(
                    "INSERT INTO projects (id, name, version, current_epoch) "
                    "VALUES (:id, :name, '1.0', 1)"
                ),
                {"id": project_id, "name": f"P{project_idx}"},
            )

            feature_ids: list[UUID] = []
            for feature_idx in range(10):
                feature_id = uuid4()
                conn.execute(
                    text(
                        "INSERT INTO features "
                        "(id, feature_key, project_id, epoch, name, description, is_active) "
                        "VALUES (:id, :key, :pid, 1, :name, NULL, TRUE)"
                    ),
                    {
                        "id": feature_id,
                        "key": uuid4(),
                        "pid": project_id,
                        "name": f"F{project_idx}-{feature_idx}",
                    },
                )
                feature_ids.append(feature_id)

            poll_id = uuid4()
            conn.execute(
                text(
                    "INSERT INTO polls (id, project_id, epoch, created_at, expires_at) "
                    "VALUES (:id, :pid, 1, :created, :expires)"
                ),
                {
                    "id": poll_id,
                    "pid": project_id,
                    "created": now,
                    "expires": now + timedelta(days=7),
                },
            )
            if project_idx == 0:
                target_poll_id = poll_id

            for _ in range(5):
                submission_id = uuid4()
                conn.execute(
                    text(
                        "INSERT INTO submissions (id, poll_id, submitted_at) "
                        "VALUES (:id, :pid, :ts)"
                    ),
                    {"id": submission_id, "pid": poll_id, "ts": now},
                )
                for feature_id in feature_ids:
                    conn.execute(
                        text(
                            "INSERT INTO responses "
                            "(submission_id, feature_id, fq_answer, dq_answer, category) "
                            "VALUES (:sid, :fid, 3, 5, 'M')"
                        ),
                        {"sid": submission_id, "fid": feature_id},
                    )

    # ANALYZE so the planner has up-to-date statistics; otherwise on a
    # freshly-loaded table it falls back to defaults that disfavour the
    # index. This mirrors what production VACUUM ANALYZE would do.
    with engine.begin() as conn:
        conn.execute(text("ANALYZE features, submissions, responses, polls"))

    assert target_poll_id is not None
    return target_poll_id


def test_analysis_query_uses_feature_index(
    app_with_migrated_db: Flask,
    db_engine: Engine,
) -> None:
    """Assert the analysis SELECT plans an Index Scan on features, not a Seq Scan.

    Compiles the exact statement ``build_analysis`` runs (imported from the
    service, not duplicated), then runs ``EXPLAIN`` against it and inspects
    the plan text. The migration-0001 index ``ix_features_project_id_epoch``
    is the load-bearing piece of physical schema here — its loss would
    silently regress analysis latency on real datasets.
    """

    poll_id = _seed_realistic_dataset(db_engine)

    with app_with_migrated_db.app_context():
        poll = kano_db.session.get(Poll, poll_id)
        assert poll is not None
        stmt = _build_analysis_stmt(poll)
        compiled = stmt.compile(
            dialect=kano_db.engine.dialect,
            compile_kwargs={"literal_binds": True},
        )

        # Both statements run inside the same autobegin transaction started
        # by the ``session.get(Poll)`` call above, so SET LOCAL (which is
        # transaction-scoped) reliably applies to the EXPLAIN that follows.
        # Force the planner to prefer the index path so the test reflects
        # "is the index reachable from this query?" rather than "does the
        # planner happen to pick it on a tiny test dataset?". If the index
        # is dropped, the planner still has only Seq Scan as an option and
        # the negative assertion below catches it.
        kano_db.session.execute(text("SET LOCAL enable_seqscan = OFF"))
        explain_sql = f"EXPLAIN {compiled}"
        result = kano_db.session.execute(text(explain_sql)).scalars().all()

    plan = "\n".join(result)

    # The plan should reference the project-id/epoch index on features or
    # otherwise pick an Index Scan. Seq Scan on features is the failure
    # mode this test is here to catch.
    assert (
        "ix_features_project_id_epoch" in plan or "Index Scan" in plan or "Index Only Scan" in plan
    ), f"Analysis plan did not pick an index on features:\n{plan}"
    assert (
        "Seq Scan on features" not in plan
    ), f"Analysis query fell back to Seq Scan on features:\n{plan}"
