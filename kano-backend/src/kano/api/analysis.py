"""Public analysis read endpoint — thin wrapper over ``services.analysis``.

The HTTP layer here is intentionally ~10 lines: invoke ``build_analysis``,
serialize the resulting Pydantic model, return JSON. Every shape decision
(distribution always six keys, tie-list sort order, max-per-feature
``total_submissions``) lives in :mod:`kano.services.analysis` so the wire
format and the service contract cannot drift.

Public surface contract (Story 5.2 AC #6, #7):

* ``@public_endpoint`` — CSRF-exempt via Story 1.3's shared ``csrf`` instance.
  Same mechanism Stories 3.4 (``get_poll_public``) and 4.3 (``submit_poll``)
  use; do NOT introduce a third pattern.
* CORS-open via ``middleware/security.py``'s ``PUBLIC_RESPONDENT_PATHS`` —
  Flask-CORS resolves the analysis path against the regex tuple and applies
  the public ``origins="*"`` rule. The PM allowlist regime is the
  ``/api/*`` catch-all and does not apply here.

The 404 case bubbles through :class:`kano.exceptions.EntityNotFound` to the
shared Problem-Details registry in :mod:`kano.api.errors` (Story 2.4 / 3.4).
Do NOT wrap in ``try/except`` — duplicating the translation diverges from
the precedent.

FR32: analysis remains readable past the poll's ``expires_at``. Contrast
with Story 3.4's ``GET /api/v1/polls/:uuid`` which returns 410 on expired —
the analysis surface has no submission handshake to gate.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from flask import Blueprint, Response, jsonify

from kano.middleware.security import public_endpoint
from kano.services.analysis import build_analysis

logger = structlog.get_logger(__name__)

analysis_bp = Blueprint("analysis", __name__, url_prefix="/api/v1")


@analysis_bp.get("/polls/<uuid:poll_id>/analysis")
@public_endpoint
def get_poll_analysis(poll_id: UUID) -> tuple[Response, int]:
    """``GET /api/v1/polls/:uuid/analysis`` — public PollAnalysis read."""

    analysis = build_analysis(poll_id)
    logger.info(
        "poll_analysis_read",
        poll_id=str(poll_id),
        epoch=analysis.epoch,
        feature_count=len(analysis.features),
        total_submissions=analysis.total_submissions,
    )
    return jsonify(analysis.model_dump(mode="json")), 200
