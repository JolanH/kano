"""Exhaustive unit tests for the Kano categorization matrix (FR28).

The 25 expected categories are spelled out **literally** here, not derived
from ``_MATRIX`` — that's the whole point. Deriving the expected value from
the implementation would make the test tautological and silently green if
someone copy-paste-corrupted the matrix. Each assertion is an independent
restatement of a spec rule.
"""

from __future__ import annotations

import sys

import pytest

from kano.services.kano_matrix import Category, compute_category

# Cells laid out as a literal 5×5 grid for human review against the spec:
# rows = FQ (1..5), columns = DQ (1..5). Short aliases keep each row on one
# line so the human-reviewable grid stays visually rectangular.
_M = Category.MANDATORY
_L = Category.LINEAR
_E = Category.EXCITER
_I = Category.INDIFFERENT
_C = Category.CONTRADICTORY
_D = Category.DOUBTFUL

_EXPECTED_GRID: list[list[Category]] = [
    # DQ=1  DQ=2  DQ=3  DQ=4  DQ=5
    [  _D,   _E,   _E,   _E,   _L  ],  # FQ = 1
    [  _C,   _I,   _I,   _I,   _M  ],  # FQ = 2
    [  _C,   _I,   _I,   _I,   _M  ],  # FQ = 3
    [  _C,   _I,   _I,   _I,   _M  ],  # FQ = 4
    [  _C,   _C,   _C,   _C,   _D  ],  # FQ = 5
]  # fmt: skip

_ALL_CELLS: list[tuple[int, int, Category]] = [
    (fq, dq, _EXPECTED_GRID[fq - 1][dq - 1]) for fq in range(1, 6) for dq in range(1, 6)
]


@pytest.mark.parametrize(("fq", "dq", "expected"), _ALL_CELLS)
def test_cell(fq: int, dq: int, expected: Category) -> None:
    assert compute_category(fq, dq) is expected


def test_all_25_cells_covered() -> None:
    """Sanity: the parametrized list really has 25 entries (catches grid edits)."""

    assert len(_ALL_CELLS) == 25


@pytest.mark.parametrize(
    ("fq", "dq"),
    [
        (0, 3),
        (6, 3),
        (3, 0),
        (3, 6),
        (-1, 3),
        (3, -1),
    ],
)
def test_out_of_range_inputs_raise_value_error(fq: int, dq: int) -> None:
    with pytest.raises(ValueError, match=r"fq and dq must be in 1\.\.5"):
        compute_category(fq, dq)


def test_category_value_is_single_uppercase_letter() -> None:
    """``Category.value`` must match the DB ``CHAR(1)`` domain (Story 1.2)."""

    expected = {"M", "L", "E", "I", "C", "D"}
    actual = {member.value for member in Category}
    assert actual == expected
    for member in Category:
        assert len(member.value) == 1
        assert member.value.isupper()


def test_module_is_pure() -> None:
    """``kano.services.kano_matrix`` does not depend on flask / sqlalchemy.

    Re-importing inside this test guarantees we observe the module's import
    side-effects in isolation — the assertion is on what *this module* drags
    in, not on whatever else the test session has already loaded.
    """

    target = "kano.services.kano_matrix"
    if target in sys.modules:
        del sys.modules[target]

    forbidden_prefixes = ("flask", "sqlalchemy")
    forbidden_before = {name for name in sys.modules if name.startswith(forbidden_prefixes)}

    import kano.services.kano_matrix  # noqa: F401  - import for side-effect inspection

    forbidden_after = {name for name in sys.modules if name.startswith(forbidden_prefixes)}

    newly_loaded = forbidden_after - forbidden_before
    assert not newly_loaded, (
        "kano.services.kano_matrix must be a pure function module — "
        f"importing it pulled in: {sorted(newly_loaded)}"
    )
