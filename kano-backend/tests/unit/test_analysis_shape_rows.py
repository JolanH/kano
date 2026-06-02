"""Unit tests for :func:`kano.services.analysis._shape_rows`.

The shape step is a state-machine that walks the GROUP-BY rows once and
accumulates a per-feature distribution as it goes. The algorithm is O(rows)
**because** the rows arrive pre-sorted by ``Feature.id`` then
``Response.category`` (see the ``order_by`` in ``_build_analysis_stmt``).
If that ORDER BY ever drops or shuffles, the state machine produces wrong
output — a feature's rows interleaved with another feature's rows get split
into multiple ``FeatureAnalysis`` records with partial distributions.

This module pins the invariant. The post-review-flagged risk is that no
existing test would catch the regression where a refactor removes the
ORDER BY in the SQL builder; the algorithm is still O(rows) but silently
wrong.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from kano.services.analysis import _shape_rows


def _row(
    feature_id: UUID,
    feature_key: UUID,
    name: str,
    category: str | None,
    count: int,
) -> tuple[UUID, UUID, str, str | None, str | None, int]:
    return (feature_id, feature_key, name, None, category, count)


class TestShapeRowsOrderingInvariant:
    def test_correctly_groups_pre_sorted_rows(self) -> None:
        # Two features, rows arrive sorted by (feature_id, category) — the
        # invariant the SQL ORDER BY provides.
        fid_a, fkey_a = uuid4(), uuid4()
        fid_b, fkey_b = uuid4(), uuid4()
        # Ensure deterministic sort order for the assertion.
        if str(fid_a) > str(fid_b):
            fid_a, fid_b = fid_b, fid_a
            fkey_a, fkey_b = fkey_b, fkey_a

        rows: list[Any] = [
            _row(fid_a, fkey_a, "A", "M", 3),
            _row(fid_a, fkey_a, "A", "O", 2),
            _row(fid_b, fkey_b, "B", "M", 1),
            _row(fid_b, fkey_b, "B", "A", 4),
        ]

        features, total = _shape_rows(rows)

        assert len(features) == 2
        by_key = {f.feature_key: f for f in features}
        assert by_key[fkey_a].distribution["M"] == 3  # type: ignore[index]
        assert by_key[fkey_a].distribution["O"] == 2  # type: ignore[index]
        assert by_key[fkey_b].distribution["M"] == 1  # type: ignore[index]
        assert by_key[fkey_b].distribution["A"] == 4  # type: ignore[index]
        assert total == 5  # max-per-feature: B has 5, A has 5; both tie.

    def test_interleaved_rows_break_grouping_pin_the_invariant(self) -> None:
        # If the ORDER BY ever drops and rows interleave by feature, the
        # state-machine flushes prematurely and produces TWO entries per
        # feature instead of one. This test pins the failure mode so a
        # future refactor that removes the ORDER BY is caught.
        fid_a, fkey_a = uuid4(), uuid4()
        fid_b, fkey_b = uuid4(), uuid4()

        # Deliberately interleaved: A, B, A, B
        rows: list[Any] = [
            _row(fid_a, fkey_a, "A", "M", 3),
            _row(fid_b, fkey_b, "B", "M", 1),
            _row(fid_a, fkey_a, "A", "O", 2),
            _row(fid_b, fkey_b, "B", "A", 4),
        ]

        features, _ = _shape_rows(rows)

        # The bug manifests as four FeatureAnalysis records (one per
        # feature_id flip), not two. Asserting the count here documents
        # the contract: "rows MUST arrive sorted by feature_id". If a
        # future implementation relaxes this with internal dict-based
        # regrouping, update this test to assert correctness instead.
        assert len(features) == 4, (
            "shape_rows depends on rows arriving sorted by feature_id; "
            "if this assertion fails because len(features) == 2, the "
            "algorithm has been hardened to handle interleaved input — "
            "update this test to assert the new contract."
        )

    def test_null_category_rows_contribute_zero(self) -> None:
        # LEFT OUTER JOIN yields category=NULL when a feature has no
        # responses for this poll. _shape_rows skips those rows and the
        # six-key pad fills in zeros.
        fid, fkey = uuid4(), uuid4()
        rows: list[Any] = [
            _row(fid, fkey, "C", None, 0),  # the LEFT-JOIN-NULL row
        ]

        features, total = _shape_rows(rows)

        assert len(features) == 1
        assert features[0].distribution == {
            "M": 0,  # type: ignore[dict-item]
            "O": 0,  # type: ignore[dict-item]
            "A": 0,  # type: ignore[dict-item]
            "I": 0,  # type: ignore[dict-item]
            "R": 0,  # type: ignore[dict-item]
            "Q": 0,  # type: ignore[dict-item]
        }
        assert features[0].dominant_categories == []
        assert features[0].dominant_percentage == 0.0
        assert total == 0

    def test_unknown_category_value_logs_warning_and_skips_row(self) -> None:
        # CHECK constraint dropped / in-flight migration / manual SQL —
        # an out-of-set category value should not 500 the entire analysis;
        # the row is skipped and the surviving categories still render.
        fid, fkey = uuid4(), uuid4()
        rows: list[Any] = [
            _row(fid, fkey, "Z", "M", 3),
            _row(fid, fkey, "Z", "BOGUS", 99),  # not in A/M/O/I/R/Q
            _row(fid, fkey, "Z", "O", 2),
        ]

        features, total = _shape_rows(rows, poll_id=uuid4())

        assert len(features) == 1
        # BOGUS row dropped; M and O counted normally.
        assert features[0].distribution["M"] == 3  # type: ignore[index]
        assert features[0].distribution["O"] == 2  # type: ignore[index]
        assert total == 5
