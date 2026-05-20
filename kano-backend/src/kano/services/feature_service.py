"""Read-side queries for the ``Feature`` aggregate.

Mutation paths route through :mod:`kano.services.epoch_service`. This module
owns the "look up features by (project, epoch)" read query, including the
soft-deleted rows historical-view consumers need (Story 2-8).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from kano.db import db
from kano.exceptions import EntityNotFound
from kano.models.feature import Feature
from kano.models.project import Project


def list_features_for_epoch(project_id: UUID, epoch: int) -> list[Feature]:
    """Return every feature row at ``(project_id, epoch)``, including soft-deleted.

    Raises :class:`EntityNotFound` when the project does not exist or when
    the requested epoch is out of range for this project (``< 1`` or
    ``> project.current_epoch``). An in-range epoch with zero feature rows
    is a *valid* empty result and returns ``[]`` (e.g. a project at
    ``current_epoch=1`` that has not had any features added yet).
    """

    project = db.session.get(Project, project_id)
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    if epoch < 1 or epoch > project.current_epoch:
        raise EntityNotFound(
            f"Project {project_id} has no epoch {epoch} (current_epoch={project.current_epoch})"
        )

    rows_stmt = (
        select(Feature)
        .where(Feature.project_id == project_id, Feature.epoch == epoch)
        .order_by(Feature.created_at.asc())
    )
    return list(db.session.execute(rows_stmt).scalars().all())
