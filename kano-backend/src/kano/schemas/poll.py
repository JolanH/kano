"""Pydantic schemas for the ``Poll`` aggregate.

This module is the single source of truth for every poll-shaped payload that
crosses the API boundary in Epic 3 — both PM-facing (``PollSummary``,
``PollSummaryWithProject``) and respondent-facing (``PollPublic``).

The PM/respondent split is **load-bearing**: ``PollPublic`` deliberately
omits ``project_id``, ``project_name``, ``epoch`` and ``response_count`` so
that PM-side data never leaks to the public read endpoint (Story 3.4 AC #4,
PRD NFR8). Adding fields to ``PollPublic`` without explicit review will
break that boundary.

``response_count`` and ``is_expired`` on ``PollSummary`` are **computed,
not stored**: the service layer (Story 3.3) joins on submissions and sets
both as transient attributes on the ORM instance before validation. The
schema itself takes no opinion on how they are populated, only that the
shape is correct on the way out.

Wire format is snake_case end-to-end (no ``Field(alias=...)``) per
architecture §Format Patterns.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PollSummary(BaseModel):
    """List-item projection for PM-facing poll lists and the create-poll response.

    Built from an ORM ``Poll`` instance enriched with ``response_count`` and
    ``is_expired`` as transient attributes (see module docstring).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    epoch: int
    created_at: datetime
    expires_at: datetime
    response_count: int
    is_expired: bool


class PollSummaryWithProject(PollSummary):
    """``PollSummary`` enriched with project context for the cross-project PM list (Story 3.7)."""

    project_name: str
    project_version: str


class PollPublicFeature(BaseModel):
    """Respondent-facing feature projection embedded inside ``PollPublic``."""

    feature_key: UUID
    name: str
    description: str | None


class PollPublic(BaseModel):
    """Respondent-facing poll projection. NO PM-side fields (see module docstring)."""

    id: UUID
    expires_at: datetime
    features: list[PollPublicFeature]
