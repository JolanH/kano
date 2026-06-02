"""Kano categorization matrix — FR28's load-bearing correctness invariant.

PURE FUNCTION MODULE. No imports from ``kano.models``, ``kano.api``, ``flask``,
or ``sqlalchemy``. Depends only on the stdlib ``enum`` module. Importing this
module must not pull in any persistence or web framework — that property is
exercised by ``tests/unit/test_kano_matrix.py::test_module_is_pure``.

The 25-cell matrix is the **standard Kano evaluation table**. Rows are the
respondent's *functional* answer (feature present), columns the *dysfunctional*
answer (feature absent); both run Like → Expect → Don't-care → Live-with-it →
Dislike, encoded as the 1..5 Likert integers ``fq`` / ``dq``. Each cell maps to
one of the six classic categories:

    A — Attractive    (delighter: present pleases, absent is fine)
    M — Must-be       (expected baseline: absent dissatisfies)
    O — Performance   (one-dimensional: satisfaction scales with fulfilment)
    I — Indifferent   (presence/absence does not move the respondent)
    R — Reverse       (respondent actively prefers the feature absent)
    Q — Questionable  (implausible / contradictory answer pair)

Human-reviewable grid (rows = fq 1..5, cols = dq 1..5):

          dq1  dq2  dq3  dq4  dq5
    fq1    Q    A    A    A    O
    fq2    R    Q    I    I    M
    fq3    R    I    I    I    M
    fq4    R    I    I    Q    M
    fq5    R    R    R    R    Q

The single-character ``.value`` of each enum member matches the ``CHAR(1)``
DB domain on ``responses.category`` (Story 1.2, migration 0002), so persisting
a category is ``response.category = compute_category(fq, dq).value``.
"""

from __future__ import annotations

from enum import Enum


class Category(str, Enum):
    """Kano category. ``.value`` is the DB-side single-letter domain code.

    Declared in the canonical scan order (M → O → A → I → R → Q) so that
    iterating ``Category`` yields that order everywhere the distribution is
    assembled or rendered.
    """

    MUSTBE = "M"
    PERFORMANCE = "O"
    ATTRACTIVE = "A"
    INDIFFERENT = "I"
    REVERSE = "R"
    QUESTIONABLE = "Q"


_M = Category.MUSTBE
_O = Category.PERFORMANCE
_A = Category.ATTRACTIVE
_I = Category.INDIFFERENT
_R = Category.REVERSE
_Q = Category.QUESTIONABLE


_MATRIX: dict[tuple[int, int], Category] = {
    # FQ = 1 (functional answer: "I like it")
    (1, 1): _Q, (1, 2): _A, (1, 3): _A, (1, 4): _A, (1, 5): _O,
    # FQ = 2 (functional answer: "I expect it")
    (2, 1): _R, (2, 2): _Q, (2, 3): _I, (2, 4): _I, (2, 5): _M,
    # FQ = 3 (functional answer: "I am neutral / don't care")
    (3, 1): _R, (3, 2): _I, (3, 3): _I, (3, 4): _I, (3, 5): _M,
    # FQ = 4 (functional answer: "I can live with it")
    (4, 1): _R, (4, 2): _I, (4, 3): _I, (4, 4): _Q, (4, 5): _M,
    # FQ = 5 (functional answer: "I dislike it")
    (5, 1): _R, (5, 2): _R, (5, 3): _R, (5, 4): _R, (5, 5): _Q,
}  # fmt: skip


def compute_category(fq: int, dq: int) -> Category:
    """Map a (functional answer, dysfunctional answer) pair to a Kano category.

    Both ``fq`` and ``dq`` are 1..5 Likert **integers**. Any other input —
    out-of-range, non-integer, ``bool`` (which is an ``int`` subclass and would
    silently hash to ``(1, 1)`` / ``(0, 0)`` otherwise), ``None``, ``str``,
    ``float`` — raises ``ValueError``. This is a defense-in-depth backstop;
    Pydantic constrains the wire-level submission schema upstream, so the
    branch should be unreachable in production yet stay testable for safety.
    """

    for label, value in (("fq", fq), ("dq", dq)):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(
                f"fq and dq must be ints in 1..5, got {label}={value!r} ({type(value).__name__})"
            )
    if not (1 <= fq <= 5 and 1 <= dq <= 5):
        raise ValueError(f"fq and dq must be in 1..5, got fq={fq}, dq={dq}")
    return _MATRIX[(fq, dq)]


__all__ = ["Category", "compute_category"]
