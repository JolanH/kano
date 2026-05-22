"""Backend-only perf smoke for ``GET /api/v1/polls/:uuid/analysis`` (Story 5.2 AC #8).

Seeds a 20-feature × 500-submission dataset (10 000 ``responses`` rows) and
times 20 consecutive GETs through the Flask test client. The 95th percentile
must come in under 500 ms — the working ceiling against the NFR1 3-second
total budget (Story 5.2 Dev Notes "Performance headroom for NFR1").

Sample count is 20 so the 95th-percentile sample is the genuine
``floor(0.95 * 20) - 1 = 18`` index after sorting — a sample size of 10 only
yields a p90 by that rule, and labelling it p95 would mask a single-sample
regression.

This is the **server-side** gate; the full end-to-end navigation-timing gate
is Story 5.8 via Playwright. If this smoke breaks 500 ms, the 3 s total is
unreachable and a query / index review is required before 5.8 lands.

Marked ``@pytest.mark.slow`` so the fast local feedback loop can skip it;
CI runs the full suite (no skip-by-default in conftest).
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from flask.testing import FlaskClient
from sqlalchemy import Engine, text

from kano.services.kano_matrix import compute_category

# app_with_migrated_db / client_migrated / db_engine come from
# tests/integration/conftest.py.

pytestmark = pytest.mark.slow


def _seed_20x500(engine: Engine) -> UUID:
    """Seed one poll with 20 features × 500 submissions × 20 responses each.

    Bulk-inserts via raw SQL ``executemany``; bypassing the service layer
    keeps the seed time predictable on developer machines.

    Category mix per submission is deliberately uneven — every feature gets
    a different distribution across the six categories so the GROUP BY has
    a representative key cardinality (~6 categories × 20 features = 120
    groups) rather than degenerating to a single hot key.
    """

    project_id = uuid4()
    poll_id = uuid4()
    now = datetime.now(tz=UTC)
    expires = now + timedelta(days=7)

    feature_ids: list[UUID] = [uuid4() for _ in range(20)]
    feature_keys: list[UUID] = [uuid4() for _ in range(20)]

    # Cells: (3, 5) → M; (1, 5) → L; (1, 3) → E; (3, 3) → I; (2, 1) → C;
    # (1, 1) → D. Sweep them so the distribution per feature varies.
    cells = [(3, 5), (1, 5), (1, 3), (3, 3), (2, 1), (1, 1)]

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, version, current_epoch) "
                "VALUES (:id, 'Perf 20x500', '1.0', 1)"
            ),
            {"id": project_id},
        )
        conn.execute(
            text(
                "INSERT INTO features "
                "(id, feature_key, project_id, epoch, name, description, is_active) "
                "VALUES (:id, :key, :pid, 1, :name, NULL, TRUE)"
            ),
            [
                {
                    "id": feature_ids[i],
                    "key": feature_keys[i],
                    "pid": project_id,
                    "name": f"F{i:02d}",
                }
                for i in range(20)
            ],
        )
        conn.execute(
            text(
                "INSERT INTO polls (id, project_id, epoch, created_at, expires_at) "
                "VALUES (:id, :pid, 1, :created, :expires)"
            ),
            {"id": poll_id, "pid": project_id, "created": now, "expires": expires},
        )

        # 500 submissions; one INSERT per submission, then one batch of 20
        # response rows. executemany() keeps this O(500) round-trips instead
        # of O(10 000).
        submission_ids = [uuid4() for _ in range(500)]
        conn.execute(
            text(
                "INSERT INTO submissions (id, poll_id, submitted_at) "
                "VALUES (:id, :pid, :ts)"
            ),
            [
                {"id": sid, "pid": poll_id, "ts": now}
                for sid in submission_ids
            ],
        )

        response_rows: list[dict[str, object]] = []
        for s_idx, sid in enumerate(submission_ids):
            for f_idx, fid in enumerate(feature_ids):
                # Stable per-(submission, feature) cell pick so the
                # distribution is reproducible across runs.
                fq, dq = cells[(s_idx + f_idx) % len(cells)]
                response_rows.append(
                    {
                        "sid": sid,
                        "fid": fid,
                        "fq": fq,
                        "dq": dq,
                        "cat": compute_category(fq, dq).value,
                    }
                )

        conn.execute(
            text(
                "INSERT INTO responses "
                "(submission_id, feature_id, fq_answer, dq_answer, category) "
                "VALUES (:sid, :fid, :fq, :dq, :cat)"
            ),
            response_rows,
        )

    return poll_id


def test_get_analysis_under_500ms_p95_on_20x500(
    client_migrated: FlaskClient,
    db_engine: Engine,
) -> None:
    poll_id = _seed_20x500(db_engine)

    bare = client_migrated.application.test_client()

    # Warm the connection pool + Pydantic class machinery with one untimed
    # call so the perf samples reflect steady state, not first-touch cost.
    warmup = bare.get(f"/api/v1/polls/{poll_id}/analysis")
    assert warmup.status_code == 200, warmup.data

    sample_count = 20
    timings_ms: list[float] = []
    for _ in range(sample_count):
        start = time.perf_counter()
        response = bare.get(f"/api/v1/polls/{poll_id}/analysis")
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert response.status_code == 200, response.data
        timings_ms.append(elapsed_ms)

    timings_ms.sort()
    # floor(0.95 * 20) = 19, so the 95th-percentile sample is at 0-based
    # sorted index 18. 500 ms is the budget per AC #8.
    p95 = timings_ms[18]
    assert p95 < 500.0, (
        f"P95 = {p95:.1f} ms exceeds the 500 ms ceiling. "
        f"Samples (ms): {[round(t, 1) for t in timings_ms]}. "
        "If this persists, the Story 5.8 end-to-end NFR1 gate is unreachable "
        "— escalate query/index review before 5.8 lands."
    )
