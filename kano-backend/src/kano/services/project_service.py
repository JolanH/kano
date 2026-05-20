"""Project-aggregate service functions.

Verb-first module-level functions per architecture §Naming Patterns. The
service is intentionally thin: validation lives in the Pydantic schemas, the
``current_epoch`` default lives on the model, so this file only owns the
session interaction (add/commit/rollback semantics).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select

from kano.db import db
from kano.exceptions import EntityNotFound
from kano.models.feature import Feature
from kano.models.project import Project
from kano.schemas.project import ProjectCreate, ProjectUpdate


def create_project(data: ProjectCreate) -> Project:
    """Persist a new project; raise on commit failure.

    ID is generated app-side (``uuid4``) per architecture §Data Architecture —
    the DB never assigns identifiers. ``current_epoch`` defaults to 1 on the
    model, so this function never names it.
    """

    project = Project(id=uuid4(), name=data.name, version=data.version)
    db.session.add(project)
    db.session.commit()
    return project


def list_projects() -> list[Project]:
    """Return every project, newest-first.

    No pagination per architecture §Scaling Strategy — v1 is vertical-only
    with O(tens) projects expected.
    """

    stmt = select(Project).order_by(Project.created_at.desc())
    return list(db.session.execute(stmt).scalars().all())


@dataclass(slots=True)
class ProjectDetail:
    """In-memory composition of a project + its current-epoch active features.

    Returned from :func:`get_project_detail` so the API layer can populate
    ``ProjectDetailResponse`` in one ``model_validate`` pass via
    ``from_attributes=True``.
    """

    id: UUID
    name: str
    version: str
    current_epoch: int
    created_at: object  # datetime
    updated_at: object  # datetime
    active_features: list[Feature]


def update_project(project_id: UUID, data: ProjectUpdate) -> Project:
    """Patch a project's name and/or version. Never bumps ``current_epoch``.

    Only the fields the client actually sent are written, via Pydantic's
    ``exclude_unset=True``. ``updated_at`` is *always* refreshed when this
    function returns 200 — including when every supplied field already
    matches its persisted value (an "identity PATCH"). The model's
    ``onupdate=func.now()`` only fires when SQLAlchemy detects dirty
    columns, so an identity PATCH would otherwise leave the timestamp
    stale. AC #3 of Story 2.5 promises a refreshed ``updated_at`` on every
    successful response; this explicit assignment is what honors that.
    """

    project = db.session.get(Project, project_id)
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(project, field, value)

    # Force-refresh updated_at even when no columns are dirty, so identity
    # PATCH (sending the same value back) still surfaces as "we just
    # touched this". Belt-and-braces with the model's onupdate hook.
    project.updated_at = datetime.now(UTC)

    db.session.commit()
    db.session.refresh(project)
    return project


def get_project_detail(project_id: UUID) -> ProjectDetail:
    """Return the project plus its current-epoch active features, or raise."""

    project = db.session.get(Project, project_id)
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    features_stmt = (
        select(Feature)
        .where(
            Feature.project_id == project.id,
            Feature.epoch == project.current_epoch,
            Feature.is_active.is_(True),
        )
        .order_by(Feature.created_at.asc())
    )
    active_features = list(db.session.execute(features_stmt).scalars().all())

    return ProjectDetail(
        id=project.id,
        name=project.name,
        version=project.version,
        current_epoch=project.current_epoch,
        created_at=project.created_at,
        updated_at=project.updated_at,
        active_features=active_features,
    )
