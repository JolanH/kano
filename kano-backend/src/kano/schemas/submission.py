"""Pydantic schemas for the inbound respondent submission payload.

The respondent SPA round-trips ``feature_key`` (the public, epoch-stable
identifier exposed by ``PollPublic``), not ``feature_id``. The service layer
resolves ``feature_key`` → ``feature_id`` before inserting response rows;
keeping ``feature_id`` off the wire preserves the Story 3.4 minimal-disclosure
posture.

Shape-level validation only: ``min_length=1`` rejects an empty answers list
with a clean 400 at the Pydantic boundary. Completeness-against-the-poll
(every feature answered) is a domain check in Story 4.2 and surfaces as
HTTP 422 from the endpoint in Story 4.3.

Wire format is snake_case end-to-end (no ``Field(alias=...)``) per
architecture §Format Patterns.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class AnswerIn(BaseModel):
    """One (Functional, Dysfunctional) Likert pair for a single feature."""

    feature_key: UUID
    fq_answer: int = Field(ge=1, le=5)
    dq_answer: int = Field(ge=1, le=5)


class PollSubmission(BaseModel):
    """Inbound body for ``POST /api/v1/public/polls/:uuid/submit`` (Story 4.3)."""

    answers: list[AnswerIn] = Field(min_length=1)
