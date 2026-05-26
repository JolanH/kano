"""Unit tests for :func:`kano.services.analysis._dominant`.

Pure-function coverage of the dominant-category computation (Story 5.1 AC #4).
Exercises every branch — zero-total, single winner, 2-way / 3-way / 6-way tie,
all-same-category, and the rounding edge cases pinned in the story's Dev
Notes (``33.3333…`` → ``33.3``, ``66.6666…`` → ``66.7``).

The 100% branch-coverage gate for this module (PRD §Technical Success line 94,
architecture §Cross-Cutting Concerns item 10) is satisfied here — every code
path in ``_dominant`` is hit by at least one case below.
"""

from __future__ import annotations

from kano.services.analysis import _dominant
from kano.services.kano_matrix import Category

_M = Category.MANDATORY
_L = Category.LINEAR
_E = Category.EXCITER
_I = Category.INDIFFERENT
_C = Category.CONTRADICTORY
_D = Category.DOUBTFUL


def _zero_dist() -> dict[Category, int]:
    return dict.fromkeys(Category, 0)


def _dist(**overrides: int) -> dict[Category, int]:
    """Build a 6-key distribution where unspecified categories are 0."""
    dist = _zero_dist()
    name_to_cat = {
        "M": _M,
        "L": _L,
        "E": _E,
        "I": _I,
        "C": _C,
        "D": _D,
    }
    for key, value in overrides.items():
        dist[name_to_cat[key]] = value
    return dist


class TestZeroTotal:
    def test_total_zero_returns_empty(self) -> None:
        assert _dominant(_zero_dist(), total=0) == ([], 0.0)

    def test_total_zero_even_with_nonzero_values_returns_empty(self) -> None:
        # Defensive: contract says total==0 short-circuits before reading values.
        # This pins that promise — if someone reorders the guards, this test
        # catches it.
        weird = _dist(M=3)  # logically inconsistent (total=0 but a count exists)
        assert _dominant(weird, total=0) == ([], 0.0)


class TestSingleWinner:
    def test_strict_majority(self) -> None:
        # 7 M out of 10 → M wins, 70.0%
        dist = _dist(M=7, E=2, D=1)
        winners, pct = _dominant(dist, total=10)
        assert winners == [_M]
        assert pct == 70.0

    def test_full_dominance(self) -> None:
        # All 5 submissions land on Indifferent → I wins at 100.0%
        dist = _dist(I=5)
        winners, pct = _dominant(dist, total=5)
        assert winners == [_I]
        assert pct == 100.0

    def test_single_winner_with_only_two_categories(self) -> None:
        dist = _dist(M=4, L=1)
        winners, pct = _dominant(dist, total=5)
        assert winners == [_M]
        assert pct == 80.0


class TestTies:
    def test_two_way_tie_returns_both_sorted(self) -> None:
        # 2 M, 2 L, 1 E → tie between M and L at 40%
        dist = _dist(M=2, L=2, E=1)
        winners, pct = _dominant(dist, total=5)
        # Sorted in canonical Kano scan order (M → L → E → I → C → D):
        # M precedes L, so the M-L tie reads "M, L" everywhere on the page.
        assert winners == [_M, _L]
        assert pct == 40.0

    def test_three_way_tie_returns_all_three_sorted(self) -> None:
        # 1 M, 1 L, 1 E → tie at 33.3%
        dist = _dist(M=1, L=1, E=1)
        winners, pct = _dominant(dist, total=3)
        # Canonical Kano scan order: M → L → E.
        assert winners == [_M, _L, _E]
        assert pct == 33.3

    def test_six_way_tie_returns_all_six_sorted(self) -> None:
        # Degenerate but possible: 6 submissions, one each in every category.
        dist = _dist(M=1, L=1, E=1, I=1, C=1, D=1)
        winners, pct = _dominant(dist, total=6)
        # All 6 categories in canonical Kano scan order:
        # M → L → E → I → C → D.
        assert winners == [_M, _L, _E, _I, _C, _D]
        # 1/6 = 16.6666… → 16.7
        assert pct == 16.7

    def test_max_zero_with_nonzero_total_returns_empty(self) -> None:
        # Defensive guard: logically impossible under the FR24 invariant but
        # reachable via partial seeding or a future refactor that decouples
        # `total` from `sum(distribution.values())`. Should NOT return a
        # 6-way tie at 0% — return the same empty signal as `total == 0`.
        winners, pct = _dominant(_zero_dist(), total=5)
        assert winners == []
        assert pct == 0.0


class TestRounding:
    def test_one_third_rounds_down(self) -> None:
        # 33.3333… → 33.3
        winners, pct = _dominant(_dist(M=1, L=1, E=1), total=3)
        assert pct == 33.3
        # Canonical Kano scan order: M → L → E.
        assert winners == [_M, _L, _E]

    def test_two_thirds_rounds_up(self) -> None:
        # 66.6666… → 66.7
        winners, pct = _dominant(_dist(M=2, L=1), total=3)
        assert pct == 66.7
        assert winners == [_M]

    def test_exact_half_stays_exact(self) -> None:
        # 50.0 stays 50.0 (2:2 tie)
        winners, pct = _dominant(_dist(M=2, L=2), total=4)
        assert pct == 50.0
        # Canonical Kano scan order: M precedes L.
        assert winners == [_M, _L]

    def test_majority_4_of_7_rounds_down(self) -> None:
        # 4/7 = 57.142857… → 57.1
        # 7 total: 4 M (max), 3 L. M wins uniquely.
        winners, pct = _dominant(_dist(M=4, L=3), total=7)
        assert winners == [_M]
        assert pct == 57.1

    def test_majority_5_of_7_rounds_up(self) -> None:
        # 5/7 = 71.428571… → 71.4
        winners, pct = _dominant(_dist(M=5, L=2), total=7)
        assert winners == [_M]
        assert pct == 71.4

    def test_majority_6_of_7_rounds_up(self) -> None:
        # 6/7 = 85.714285… → 85.7
        winners, pct = _dominant(_dist(M=6, L=1), total=7)
        assert winners == [_M]
        assert pct == 85.7
