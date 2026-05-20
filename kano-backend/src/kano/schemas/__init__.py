"""Pydantic request/response schemas. Mirror the ORM models in shape, not identity."""

from kano.schemas.feature import (
    FeatureCreate,
    FeatureResponse,
    FeatureSummary,
    FeatureUpdate,
)
from kano.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectSummary,
    ProjectUpdate,
)

__all__ = [
    "FeatureCreate",
    "FeatureResponse",
    "FeatureSummary",
    "FeatureUpdate",
    "ProjectCreate",
    "ProjectDetailResponse",
    "ProjectResponse",
    "ProjectSummary",
    "ProjectUpdate",
]
