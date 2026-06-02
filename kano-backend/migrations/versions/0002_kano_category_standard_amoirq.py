"""Swap responses.category domain to the standard Kano model (A/M/O/I/R/Q).

The product moved from a bespoke 6-category matrix (M/L/E/I/C/D —
Mandatory/Linear/Exciter/Indifferent/Contradictory/Doubtful) to the standard
Kano evaluation table (A=Attractive, M=Must-be, O=Performance, I=Indifferent,
R=Reverse, Q=Questionable). The matrix *conditions* changed too, so a stored
category is not a pure relabel of the old code — it would have to be recomputed
from (fq_answer, dq_answer). Per the refactor decision this is a **clean
slate**: existing response rows (and the submissions that own them) are wiped
rather than migrated. Projects / features / polls are untouched.

Raw SQL is used for the constraint swap so the literal name matches the one
migration 0001 created via ``op.f("ck_responses_category_enum")`` regardless of
the metadata naming-convention.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-02
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None

_CK = "ck_responses_category_enum"
_NEW = "category IN ('A', 'M', 'O', 'I', 'R', 'Q')"
_OLD = "category IN ('M', 'L', 'E', 'I', 'C', 'D')"


def upgrade() -> None:
    # Clean slate: drop response data computed under the old matrix, plus the
    # submissions that own those responses, before tightening the domain.
    op.execute("DELETE FROM responses")
    op.execute("DELETE FROM submissions")
    op.execute(f"ALTER TABLE responses DROP CONSTRAINT {_CK}")
    op.execute(f"ALTER TABLE responses ADD CONSTRAINT {_CK} CHECK ({_NEW})")


def downgrade() -> None:
    # Symmetric clean slate: rows written under the new A/M/O/I/R/Q domain carry
    # codes (O/A/R/Q) that the reinstated old constraint would reject, so the
    # ADD CONSTRAINT validation would fail against live data. Wipe responses +
    # their parent submissions before narrowing the domain back. Data is not
    # restored in either direction — this is a schema-only reversal.
    op.execute("DELETE FROM responses")
    op.execute("DELETE FROM submissions")
    op.execute(f"ALTER TABLE responses DROP CONSTRAINT {_CK}")
    op.execute(f"ALTER TABLE responses ADD CONSTRAINT {_CK} CHECK ({_OLD})")
