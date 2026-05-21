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

from flask import Blueprint, Response, jsonify

from kano.middleware.security import public_endpoint
from kano.schemas.poll import PollSummary, PollSummaryWithProject
from kano.services import poll_service

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
