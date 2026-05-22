"""Pydantic schemas for the analysis aggregate (Story 5.1).

``PollAnalysis`` / ``FeatureAnalysis`` are the wire shape consumed by every
downstream Epic 5 endpoint and frontend component (5.2 endpoint, 5.4 stacked
bar, 5.5 page table, 5.6 per-category panels, 5.8 perf gate). Breaking
changes here ripple across the epic — see Story 5.1 Dev Notes.

The schemas are service-layer DTOs, **not** ORM projections — there is no
``from_attributes=True``. The service ``build_analysis`` assembles them
explicitly from the GROUP-BY query rows (mirrors ``PollPublic`` precedent
from Story 3.1).

``distribution`` is contract-bound to always carry **all six**
:class:`Category` keys (M / L / E / I / C / D), even when the feature has
zero responses for a given category — the stacked-bar component (Story 5.4
/ FR37 hand-off) relies on six segments being addressable by key.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from kano.services.kano_matrix import Category


class FeatureAnalysis(BaseModel):
    """Per-feature analysis row — distribution + dominant-category summary.

    ``dominant_categories`` is a list to honor FR35: ties are surfaced
    verbatim, not silently broken. A single-winner case is a 1-element list;
    a 2-way tie is a 2-element list; a feature with zero responses is the
    empty list (paired with ``dominant_percentage == 0.0``).
    """

    feature_key: UUID
    name: str
    description: str | None
    distribution: dict[Category, int]
    dominant_categories: list[Category]
    dominant_percentage: float


class PollAnalysis(BaseModel):
    """Top-level analysis envelope for one poll.

    Genuinely immutable: ``frozen=True`` blocks attribute re-assignment,
    and ``features`` is a ``tuple`` (not ``list``) so the container itself
    cannot be mutated either. JSON serialization treats both identically,
    so Story 5.2's ``model_dump(mode="json")`` wrapper sees the expected
    array shape on the wire.
    """

    model_config = ConfigDict(frozen=True)

    poll_id: UUID
    epoch: int
    total_submissions: int
    features: tuple[FeatureAnalysis, ...]


__all__ = ["FeatureAnalysis", "PollAnalysis"]
