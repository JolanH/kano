"""Poll HTTP endpoints.

Single blueprint hosting both PM-facing routes (``POST/GET /projects/:id/polls``,
``GET /polls`` cross-project list) and the respondent-facing public read
(``GET /polls/:id``). Per architecture §Structure Patterns line 586, one
file per resource — Stories 3.3 and 3.4 will extend this module, not add
new files.

The PM routes share Flask-WTF's automatic CSRF protection via Story 1.3's
``CSRFProtect(app)``. Story 3.4's public read will be marked
``csrf_exempt`` explicitly when added.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from flask import Blueprint, Response, jsonify, request

from kano.middleware.security import public_endpoint
from kano.schemas.poll import PollSummary, PollSummaryWithProject
from kano.schemas.submission import PollSubmission
from kano.services import poll_service

logger = structlog.get_logger(__name__)

polls_bp = Blueprint("polls", __name__, url_prefix="/api/v1")


@polls_bp.post("/projects/<uuid:project_id>/polls")
def create_poll(project_id: UUID) -> tuple[Response, int, dict[str, str]]:
    """``POST /api/v1/projects/:id/polls`` — pin a poll to the project's current epoch.

    Empty body. ``PollSummary`` response. ``Location`` header points at
    ``/api/v1/polls/:id`` (the public read endpoint added in Story 3.4).
    """

    poll = poll_service.create_poll(project_id)
    payload = PollSummary.model_validate(poll).model_dump(mode="json")
    return jsonify(payload), 201, {"Location": f"/api/v1/polls/{poll.id}"}


@polls_bp.get("/projects/<uuid:project_id>/polls")
def list_polls_for_project(project_id: UUID) -> tuple[Response, int]:
    """``GET /api/v1/projects/:id/polls`` — newest-first ``PollSummary`` list."""

    polls = poll_service.list_polls_for_project(project_id)
    payload = [PollSummary.model_validate(p).model_dump(mode="json") for p in polls]
    return jsonify(payload), 200


@polls_bp.get("/polls")
def list_polls_all_projects() -> tuple[Response, int]:
    """``GET /api/v1/polls`` — cross-project list with project enrichment."""

    polls = poll_service.list_polls_all_projects()
    payload = [PollSummaryWithProject.model_validate(p).model_dump(mode="json") for p in polls]
    return jsonify(payload), 200


@polls_bp.get("/polls/<uuid:poll_id>")
@public_endpoint
def get_poll_public(poll_id: UUID) -> tuple[Response, int]:
    """``GET /api/v1/polls/:uuid`` — respondent-facing read.

    CSRF-exempt: respondents do not carry a PM session cookie. The UUIDv4
    is the only authentication; minimal disclosure on the wire (no PM
    fields). See architecture §Authentication & Security for the public-
    respondent surface contract.

    Returns 410 Gone if the poll has expired; 404 if no poll matches.
    """

    public = poll_service.get_poll_public(poll_id)
    payload = public.model_dump(mode="json")
    return jsonify(payload), 200


@polls_bp.post("/polls/<uuid:poll_id>/submit")
@public_endpoint
def submit_poll(poll_id: UUID) -> tuple[str, int]:
    """``POST /api/v1/polls/:uuid/submit`` — respondent submission.

    CSRF-exempt and CORS-permissive: same public surface as the sibling
    ``GET /api/v1/polls/:uuid`` (Story 3.4). The UUIDv4 in the URL is the
    only authentication; the body carries no respondent identifier per
    NFR8.

    Returns 204 No Content on success. Pydantic validation failures bubble
    to Story 1.3's 400 envelope; domain exceptions raised by
    ``record_full_submission`` bubble to the registry (404 / 410 / 422 /
    500). No defensive ``except`` block — the registry is the contract.

    The structlog event ``submission_recorded`` carries IDs and counts but
    no answer values or feature names per NFR8.
    """

    body = PollSubmission.model_validate(request.get_json(silent=False))
    submission_id = poll_service.record_full_submission(poll_id, body)
    logger.info(
        "submission_recorded",
        poll_id=str(poll_id),
        submission_id=str(submission_id),
        answer_count=len(body.answers),
    )
    return "", 204
