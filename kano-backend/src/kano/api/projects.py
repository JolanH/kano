"""Project-management HTTP endpoints (PM-facing, CSRF-protected).

CSRF protection is automatic via :mod:`kano.middleware.security` for every
state-changing ``/api/v1/*`` route. Pydantic ``ValidationError`` propagates
to :mod:`kano.api.errors` where it becomes a 400 Problem Details envelope.
"""

from __future__ import annotations

from uuid import UUID

from flask import Blueprint, Response, jsonify, request

from kano.schemas.project import (
    ProjectCreate,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectSummary,
    ProjectUpdate,
)
from kano.services import project_service

projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")


@projects_bp.post("/")
def create_project() -> tuple[Response, int, dict[str, str]]:
    """``POST /api/v1/projects`` — create a project and return its full row."""

    body = ProjectCreate.model_validate(request.get_json())
    project = project_service.create_project(body)
    payload = ProjectResponse.model_validate(project).model_dump(mode="json")
    return jsonify(payload), 201, {"Location": f"/api/v1/projects/{project.id}"}


@projects_bp.get("/")
def list_projects() -> tuple[Response, int]:
    """``GET /api/v1/projects`` — bare array of project summaries, newest-first."""

    projects = project_service.list_projects()
    payload = [ProjectSummary.model_validate(p).model_dump(mode="json") for p in projects]
    return jsonify(payload), 200


@projects_bp.get("/<uuid:project_id>")
def get_project_detail(project_id: UUID) -> tuple[Response, int]:
    """``GET /api/v1/projects/:id`` — project + current-epoch active features."""

    detail = project_service.get_project_detail(project_id)
    payload = ProjectDetailResponse.model_validate(detail).model_dump(mode="json")
    return jsonify(payload), 200


@projects_bp.patch("/<uuid:project_id>")
def update_project(project_id: UUID) -> tuple[Response, int]:
    """``PATCH /api/v1/projects/:id`` — edit name/version. Never bumps the epoch."""

    body = ProjectUpdate.model_validate(request.get_json())
    project = project_service.update_project(project_id, body)
    payload = ProjectResponse.model_validate(project).model_dump(mode="json")
    return jsonify(payload), 200
