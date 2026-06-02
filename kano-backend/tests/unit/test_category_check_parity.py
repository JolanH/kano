"""Parity guard: ``Category`` enum values must match the migration's CHECK constraint.

These are two independent representations of the same six-letter domain:

* ``kano.services.kano_matrix.Category`` — Python-side enum returned by
  ``compute_category()``; ``.value`` is what gets persisted to ``responses.category``.
* ``migrations/versions/0002_kano_category_standard_amoirq.py`` — the head
  migration that establishes the current ``CHECK (category IN (...))`` domain
  (``A/M/O/I/R/Q``). Migration 0001 holds the superseded ``M/L/E/I/C/D`` domain
  and is intentionally not consulted here — it is history, not the live schema.

Adding a member to one without the other ships a runtime CHECK violation on
the first INSERT. This test is the cheap, table-free guard that ties them
together at the source-file level.
"""

from __future__ import annotations

import re
from pathlib import Path

from kano.services.kano_matrix import Category

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "versions"
    / "0002_kano_category_standard_amoirq.py"
)

# Matches the CHECK body for the ``category`` column. Single-quoted single
# letters separated by commas, e.g. ``'A', 'M', 'O', 'I', 'R', 'Q'``. The
# first match in 0002 is the new (upgrade) domain ``_NEW``, which is declared
# before the ``_OLD`` downgrade-target domain.
_CATEGORY_CHECK_BODY = re.compile(r"category\s+IN\s+\(\s*((?:'[A-Z]'\s*(?:,\s*)?)+)\)")
_LETTER = re.compile(r"'([A-Z])'")


def _letters_from_migration() -> set[str]:
    source = _MIGRATION_PATH.read_text(encoding="utf-8")
    match = _CATEGORY_CHECK_BODY.search(source)
    assert match is not None, (
        f"Could not locate `category IN (...)` CHECK constraint in "
        f"{_MIGRATION_PATH}. Did the migration get reformatted?"
    )
    return set(_LETTER.findall(match.group(1)))


def test_category_enum_letters_match_migration_check_constraint() -> None:
    enum_letters = {member.value for member in Category}
    db_letters = _letters_from_migration()
    assert enum_letters == db_letters, (
        f"Category enum ↔ migration CHECK drift detected.\n"
        f"  Python enum has: {sorted(enum_letters)}\n"
        f"  Migration CHECK has: {sorted(db_letters)}\n"
        f"  Only in enum: {sorted(enum_letters - db_letters)}\n"
        f"  Only in CHECK: {sorted(db_letters - enum_letters)}\n"
        f"If you add or rename a Kano category, ship a new Alembic migration "
        f"that updates the CHECK constraint in the same PR."
    )
