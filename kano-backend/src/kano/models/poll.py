"""Poll ORM model — pinned to a project's feature-set snapshot via (project_id, epoch).

The ``(project_id, epoch)`` pair is the logical identifier of a feature-set
snapshot. PostgreSQL cannot enforce it as a true composite foreign key against
``features``, because ``(project_id, epoch)`` is not unique on its own there
(many feature rows share a single epoch). The integrity contract is therefore
split:

- ``project_id`` is a real FK to ``projects.id``.
- ``epoch`` is a plain ``INTEGER NOT NULL`` with no FK; it is always written
  from ``Project.current_epoch`` at poll-creation time, and bumped exclusively
  by ``epoch_service.bump_epoch_on_feature_change()`` (Story 2.6) when feature
  rows change.

Together with the ``UniqueConstraint(project_id, epoch, feature_key)`` on
``features``, this guarantees that the feature set referenced by a poll is
immutable for the lifetime of that poll.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from kano.db import Base


class Poll(Base):
    __tablename__ = "polls"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(Uuid(), ForeignKey("projects.id"), nullable=False)
    epoch: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index(None, "project_id", "epoch"),
        # Partial index ix_polls_expires_at ON polls (expires_at) WHERE
        # expires_at > now() is created in migration 0001_initial_schema.py
        # via op.execute() — Alembic autogenerate does not detect partial
        # indexes, so the model declaration intentionally does not list it.
    )
