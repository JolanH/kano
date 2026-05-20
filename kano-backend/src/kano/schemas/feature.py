"""Pydantic schemas for the ``Feature`` aggregate.

This module is the canonical home for every feature-shaped schema, including
``FeatureSummary`` (which `ProjectDetailResponse` embeds inside its
`active_features` list). The schemas re-export from
:mod:`kano.schemas` (the package namespace) so consumers can import from one
place regardless of where the class is defined.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FeatureCreate(BaseModel):
    """Inbound payload for ``POST /api/v1/projects/:id/features``."""

    name: str = Field(..., max_length=200)
    description: str | None = Field(None, max_length=2000)


class FeatureUpdate(BaseModel):
    """Inbound payload for ``PATCH /api/v1/features/:id``."""

    name: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _reject_empty_body(self) -> FeatureUpdate:
        if self.name is None and self.description is None:
            raise ValueError("at least one of 'name' or 'description' must be provided")
        return self


class FeatureSummary(BaseModel):
    """Compact feature projection embedded in ``ProjectDetailResponse`` (Story 2-4)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    feature_key: UUID
    name: str
    description: str | None
    created_at: datetime


class FeatureResponse(BaseModel):
    """Outbound representation of a feature row."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    feature_key: UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    epoch: int
