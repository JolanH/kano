"""Response ORM model — one (Functional, Dysfunctional) Likert pair per feature.

The ``category`` column is the precomputed Kano cell (M / L / E / I / C / D)
derived from the (fq_answer, dq_answer) pair via the matrix in Story 1.5;
storing it here keeps analysis queries to a single GROUP BY (Story 5.1).
"""

from __future__ import annotations

from enum import Enum
from uuid import UUID

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    ForeignKey,
    SmallInteger,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from kano.db import Base


class Category(str, Enum):
    """Kano category — persistence-domain mirror of ``kano_matrix.Category``.

    The values are the ``CHAR(1)`` codes that the ``responses.category`` CHECK
    constraint accepts. A test pins value-equality with the pure-function
    enum in :mod:`kano.services.kano_matrix` so they cannot drift.
    """

    MANDATORY = "M"
    LINEAR = "L"
    EXCITER = "E"
    INDIFFERENT = "I"
    CONTRADICTORY = "C"
    DOUBTFUL = "D"


class Response(Base):
    __tablename__ = "responses"

    submission_id: Mapped[UUID] = mapped_column(
        Uuid(), ForeignKey("submissions.id"), primary_key=True
    )
    feature_id: Mapped[UUID] = mapped_column(Uuid(), ForeignKey("features.id"), primary_key=True)
    fq_answer: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    dq_answer: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    category: Mapped[str] = mapped_column(CHAR(1), nullable=False)

    # The bare ``name=`` here is the ``%(constraint_name)s`` token in
    # ``kano.db.NAMING_CONVENTION["ck"]`` — SQLAlchemy expands it to e.g.
    # ``ck_responses_fq_answer_range`` at metadata-bind time, matching the
    # literal name the migration declares via ``op.f("ck_responses_…")``. Do
    # NOT add a ``ck_responses_`` prefix here; the convention applies it.
    __table_args__ = (
        CheckConstraint("fq_answer BETWEEN 1 AND 5", name="fq_answer_range"),
        CheckConstraint("dq_answer BETWEEN 1 AND 5", name="dq_answer_range"),
        CheckConstraint(
            "category IN ('M', 'L', 'E', 'I', 'C', 'D')",
            name="category_enum",
        ),
    )
