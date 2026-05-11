"""Exhaustive unit tests for the Kano categorization matrix (FR28).

The 25 expected categories are spelled out **literally** here, not derived
from ``_MATRIX`` — that's the whole point. Deriving the expected value from
the implementation would make the test tautological and silently green if
someone copy-paste-corrupted the matrix. Each assertion is an independent
restatement of a spec rule.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from kano.services import kano_matrix
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
    [  _D,   _C,   _C,   _C,   _D  ],  # FQ = 5
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


@pytest.mark.parametrize(
    ("fq", "dq"),
    [
        # bool is an int subclass; True/False would otherwise silently hash to
        # (1,1)/(0,0) in the matrix dict and bypass the range check.
        (True, 3),
        (3, False),
        # Non-int numerics: floats inside [1,5] would pass the range check but
        # KeyError on the dict lookup; outside the range they'd hit range too.
        (2.5, 3),
        (3, 2.5),
        (1.0, 3),
        # Non-numeric: None / str raise TypeError on comparison without an
        # explicit type guard.
        (None, 3),
        (3, None),
        ("3", 3),
        (3, "3"),
    ],
)
def test_non_int_inputs_raise_value_error(fq: object, dq: object) -> None:
    """Type guard: any non-int input must raise ``ValueError``, not bubble up
    a ``TypeError`` / ``KeyError`` that downstream callers wouldn't expect.
    """

    with pytest.raises(ValueError, match=r"fq and dq must be ints in 1\.\.5"):
        compute_category(fq, dq)  # type: ignore[arg-type]


def test_category_value_is_single_uppercase_letter() -> None:
    """``Category.value`` must match the DB ``CHAR(1)`` domain (Story 1.2)."""

    expected = {"M", "L", "E", "I", "C", "D"}
    actual = {member.value for member in Category}
    assert actual == expected
    for member in Category:
        assert len(member.value) == 1
        assert member.value.isupper()


def test_module_is_pure() -> None:
    """``kano.services.kano_matrix.py`` source has no forbidden imports.

    The spec's original "snapshot ``sys.modules`` before/after" approach is
    vacuous: by the time any test runs, conftest has already imported
    ``kano`` (which itself imports ``kano.api`` and ``kano.db``), so flask
    and sqlalchemy are always present and a regression like
    ``from flask import current_app`` inside this module would not introduce
    a *new* sys.modules key.

    Static AST inspection of the source file is deterministic and catches the
    actual regression the spec cares about. A future pass that restructures
    ``kano/__init__.py`` to lazy-load its blueprints could re-introduce a
    runtime subprocess check on top of this one.
    """

    forbidden_prefixes = ("flask", "sqlalchemy", "kano.api", "kano.models")

    source = Path(kano_matrix.__file__).read_text()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert not alias.name.startswith(
                    forbidden_prefixes
                ), f"forbidden top-level import in kano_matrix.py: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            assert not module.startswith(
                forbidden_prefixes
            ), f"forbidden `from {module} import ...` in kano_matrix.py"
