"""Analysis aggregate service — single GROUP BY round-trip for poll analysis.

This module is the **NFR3 gate**: ``build_analysis(poll_id)`` is required by
construction to issue exactly one ``GROUP BY feature_id, category`` query
and assemble the result in pure Python. A reviewer who sees a per-feature
``.execute()`` loop in this file should reject the PR on sight — the single
GROUP BY is the defining property of the module (Story 5.1, architecture
§Data Architecture lines 260–270).

``total_submissions`` is derived from the grouped rows via the max-per-feature
strategy, which is correct under FR24 / FR25 (``record_full_submission``
guarantees every submission produces exactly one response per active feature).
See the module-level dev note in Story 5.1 for the proof and fallback
contract.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import Row, Select, func, select

from kano.db import db
from kano.exceptions import EntityNotFound
from kano.models.feature import Feature
from kano.models.poll import Poll
from kano.models.response import Response
from kano.models.submission import Submission
from kano.schemas.analysis import FeatureAnalysis, PollAnalysis
from kano.services.kano_matrix import Category

logger = structlog.get_logger(__name__)


def _build_analysis_stmt(poll: Poll) -> Select[Any]:
    """Build the single GROUP BY statement for one poll's analysis.

    Exposed as a private symbol so the query-plan test
    (``tests/integration/test_analysis_query_plan.py``) can EXPLAIN the
    exact statement the service issues — duplicating the statement in the
    test would let it silently drift if this query ever changes.
    """

    return (
        select(
            Feature.id,
            Feature.feature_key,
            Feature.name,
            Feature.description,
            Response.category,
            func.count().label("cnt"),
        )
        .select_from(Feature)
        .outerjoin(Submission, Submission.poll_id == poll.id)
        .outerjoin(
            Response,
            (Response.submission_id == Submission.id) & (Response.feature_id == Feature.id),
        )
        .where(
            Feature.project_id == poll.project_id,
            Feature.epoch == poll.epoch,
            Feature.is_active.is_(True),
        )
        .group_by(
            Feature.id,
            Feature.feature_key,
            Feature.name,
            Feature.description,
            Response.category,
        )
        .order_by(Feature.id, Response.category)
    )


def build_analysis(poll_id: UUID) -> PollAnalysis:
    """Compute the analysis snapshot for one poll in a single GROUP BY query.

    Raises:
        EntityNotFound: ``poll_id`` does not map to a row.

    Returns a fully-assembled :class:`PollAnalysis` whose every
    ``FeatureAnalysis.distribution`` carries all six :class:`Category`
    keys (zero-padded where unseen) — the frontend's stacked-bar
    component (Story 5.4) consumes that contract.

    NFR3 contract: this function issues **exactly one** GROUP BY query
    against the ``feature``/``submission``/``response`` join, plus the
    ``session.get(Poll, ...)`` lookup. A second query is a regression and
    is gated by ``tests/integration/test_analysis_service.py::
    test_build_analysis_single_group_by_query``.
    """

    poll = db.session.get(Poll, poll_id)
    if poll is None:
        raise EntityNotFound(f"Poll {poll_id} not found")

    rows = db.session.execute(_build_analysis_stmt(poll)).all()
    features, total = _shape_rows(rows)

    logger.info(
        "build_analysis",
        poll_id=str(poll.id),
        feature_count=len(features),
        total_submissions=total,
    )

    return PollAnalysis(
        poll_id=poll.id,
        epoch=poll.epoch,
        total_submissions=total,
        features=tuple(features),
    )


def _shape_rows(rows: Sequence[Row[Any]]) -> tuple[list[FeatureAnalysis], int]:
    """Fold grouped rows into ``FeatureAnalysis`` objects + the max per-feature total.

    The second tuple element is ``total_submissions`` — the max of per-feature
    response totals, computed in the same single pass over the rows so we
    don't iterate the assembled features twice (see Dev Notes on the
    max-per-feature strategy).

    Input rows are ordered by ``Feature.id`` then ``Response.category`` (see
    the ``order_by`` in :func:`_build_analysis_stmt`), so this walks the
    sequence once and accumulates a per-feature distribution as it goes —
    O(rows), no dict-of-lists regrouping. Changing the query's ORDER BY
    breaks this invariant.

    Rows whose ``category`` is ``None`` come from the LEFT OUTER JOIN with
    no matching response — they signal the feature exists but has zero
    response data for this poll. They contribute nothing to the
    distribution; the all-zeros distribution is then filled in by the
    six-key pad below.
    """

    features: list[FeatureAnalysis] = []
    max_total = 0
    current_id: UUID | None = None
    current_feature_key: UUID | None = None
    current_name: str | None = None
    current_description: str | None = None
    current_counts: dict[Category, int] = {}

    def _flush() -> None:
        nonlocal max_total
        if current_id is None:
            return
        distribution = {cat: current_counts.get(cat, 0) for cat in Category}
        total = sum(distribution.values())
        if total > max_total:
            max_total = total
        dominant, pct = _dominant(distribution, total)
        # Type narrowing — these three vars are set together with current_id
        # at the top of each new-feature iteration, so when current_id is not
        # None they are guaranteed not None too.
        assert current_feature_key is not None
        assert current_name is not None
        features.append(
            FeatureAnalysis(
                feature_key=current_feature_key,
                name=current_name,
                description=current_description,
                distribution=distribution,
                dominant_categories=dominant,
                dominant_percentage=pct,
            )
        )

    for row in rows:
        feature_id, feature_key, name, description, category, count = row
        if feature_id != current_id:
            _flush()
            current_id = feature_id
            current_feature_key = feature_key
            current_name = name
            current_description = description
            current_counts = {}
        if category is not None:
            current_counts[Category(category)] = count

    _flush()
    return features, max_total


def _dominant(
    distribution: dict[Category, int],
    total: int,
) -> tuple[list[Category], float]:
    """Pick the dominant category (or all tied winners) and the shared percentage.

    Tie handling (FR35): when 2+ categories share the max count, **all**
    are returned. The list is sorted by the enum's value (CHAR-1 code) so
    the wire output is deterministic across runs — `[L, M]`, not the random
    order Python dicts return on iteration.

    Zero-response features (``total == 0``) return ``([], 0.0)`` — the
    frontend's FR37 empty state pulls from this signal.

    Percentage rounding: 1 decimal place via plain ``round()``. The story's
    Dev Notes pin the edge cases — 33.3333… → 33.3, 66.6666… → 66.7.
    """

    if total == 0:
        return [], 0.0
    max_count = max(distribution.values())
    winners = sorted(
        (cat for cat, count in distribution.items() if count == max_count),
        key=lambda c: c.value,
    )
    pct = round(max_count / total * 100, 1)
    return winners, pct


__all__ = ["build_analysis"]
