"""Kano categorization matrix — FR28's load-bearing correctness invariant.

PURE FUNCTION MODULE. No imports from ``kano.models``, ``kano.api``, ``flask``,
or ``sqlalchemy``. Depends only on the stdlib ``enum`` module. Importing this
module must not pull in any persistence or web framework — that property is
exercised by ``tests/unit/test_kano_matrix.py::test_module_is_pure``.

The 25-cell matrix is transcribed from ``initial-specification.md`` (root of
the repo) — the authoritative source. The eight rules in the spec exhaustively
cover 24 of the 25 cells; the remaining cell ``(fq=5, dq=1)`` is the most
strongly contradictory case (love-if-absent, hate-if-present) and resolves to
``CONTRADICTORY`` per standard Kano practice (Kano 1984), aligning with the
flatter "row 5 → C" pattern the spec already establishes for ``(5, 2..4)``.

The single-character ``.value`` of each enum member matches the ``CHAR(1)``
DB domain on ``responses.category`` (Story 1.2), so persisting a category is
``response.category = compute_category(fq, dq).value``.
"""

from __future__ import annotations

from enum import Enum


class Category(str, Enum):
    """Kano category. ``.value`` is the DB-side single-letter domain code."""

    MANDATORY = "M"
    LINEAR = "L"
    EXCITER = "E"
    INDIFFERENT = "I"
    CONTRADICTORY = "C"
    DOUBTFUL = "D"


_M = Category.MANDATORY
_L = Category.LINEAR
_E = Category.EXCITER
_I = Category.INDIFFERENT
_C = Category.CONTRADICTORY
_D = Category.DOUBTFUL


_MATRIX: dict[tuple[int, int], Category] = {
    # FQ = 1 (functional answer: "I love it")
    (1, 1): _D, (1, 2): _E, (1, 3): _E, (1, 4): _E, (1, 5): _L,
    # FQ = 2 (functional answer: "It is nice but expected")
    (2, 1): _C, (2, 2): _I, (2, 3): _I, (2, 4): _I, (2, 5): _M,
    # FQ = 3 (functional answer: "I am neutral")
    (3, 1): _C, (3, 2): _I, (3, 3): _I, (3, 4): _I, (3, 5): _M,
    # FQ = 4 (functional answer: "I dislike it but I can manage")
    (4, 1): _C, (4, 2): _I, (4, 3): _I, (4, 4): _I, (4, 5): _M,
    # FQ = 5 (functional answer: "I hate it")
    (5, 1): _C, (5, 2): _C, (5, 3): _C, (5, 4): _C, (5, 5): _D,
}  # fmt: skip


def compute_category(fq: int, dq: int) -> Category:
    """Map a (functional answer, dysfunctional answer) pair to a Kano category.

    Both ``fq`` and ``dq`` are 1..5 Likert answers. Out-of-range inputs raise
    ``ValueError`` as a defense-in-depth backstop — Pydantic already constrains
    the wire-level submission schema, so this branch should be unreachable in
    production yet still tested for safety.
    """

    if not (1 <= fq <= 5 and 1 <= dq <= 5):
        raise ValueError(f"fq and dq must be in 1..5, got fq={fq}, dq={dq}")
    return _MATRIX[(fq, dq)]


__all__ = ["Category", "compute_category"]
