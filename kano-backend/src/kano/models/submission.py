"""Submission ORM model — one respondent's complete poll fill-in."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from kano.db import Base


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid4)
    poll_id: Mapped[UUID] = mapped_column(Uuid(), ForeignKey("polls.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index(None, "poll_id"),)
