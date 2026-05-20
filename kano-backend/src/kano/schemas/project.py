"""Pydantic schemas for the ``Project`` aggregate.

The contract is snake_case end-to-end: keys flow untouched from the database
through SQLAlchemy and Pydantic to JSON. No ``Field(alias=...)`` anywhere —
that would defeat the architecture's §Format Patterns rule.

Max-length limits on ``name`` (200) and ``version`` (50) are deliberately
tighter than the underlying ``VARCHAR(255)``/``VARCHAR(64)`` columns: the DB
is the last line of defense, not the first.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from kano.schemas.feature import FeatureSummary


class ProjectCreate(BaseModel):
    """Inbound payload for ``POST /api/v1/projects``."""

    name: str = Field(..., max_length=200)
    version: str = Field(..., max_length=50)


class ProjectUpdate(BaseModel):
    """Inbound payload for ``PATCH /api/v1/projects/:id`` (Story 2-5).

    An empty body is rejected: ambiguity between "no-op" and "forgot fields"
    is resolved at the schema boundary so the endpoint can stay dumb.
    """

    name: str | None = Field(None, max_length=200)
    version: str | None = Field(None, max_length=50)

    @model_validator(mode="after")
    def _reject_empty_body(self) -> ProjectUpdate:
        if self.name is None and self.version is None:
            raise ValueError("at least one of 'name' or 'version' must be provided")
        return self


class ProjectResponse(BaseModel):
    """Outbound representation of a full project row."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    version: str
    current_epoch: int
    created_at: datetime
    updated_at: datetime


class ProjectSummary(BaseModel):
    """Outbound list-item projection (omits ``updated_at`` for compact list views)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    version: str
    current_epoch: int
    created_at: datetime


class ProjectDetailResponse(ProjectResponse):
    """``GET /api/v1/projects/:id`` response: full project + current-epoch features."""

    active_features: list[FeatureSummary]
