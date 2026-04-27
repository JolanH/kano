"""Feature ORM model — questionnaire item versioned per project epoch."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from kano.db import Base


class Feature(Base):
    __tablename__ = "features"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(Uuid(), ForeignKey("projects.id"), nullable=False)
    epoch: Mapped[int] = mapped_column(Integer, nullable=False)
    feature_key: Mapped[UUID] = mapped_column(Uuid(), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=True, server_default=text("TRUE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("project_id", "epoch", "feature_key"),
        Index(None, "project_id", "epoch"),
    )
