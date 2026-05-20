"""Unit tests for ``kano.schemas.project``.

These tests pin the contract every Epic 2 endpoint will consume. They run
against pure Pydantic — no Flask, no DB. The single SQLAlchemy round-trip
test uses a transient ``Project`` instance constructed in-memory.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from kano.models.project import Project
from kano.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectSummary,
    ProjectUpdate,
)


class TestProjectCreate:
    def test_accepts_valid_payload(self) -> None:
        payload = ProjectCreate.model_validate({"name": "Kano", "version": "1.0"})
        assert payload.name == "Kano"
        assert payload.version == "1.0"

    def test_rejects_name_over_max_length(self) -> None:
        with pytest.raises(ValidationError):
            ProjectCreate.model_validate({"name": "x" * 201, "version": "1.0"})

    def test_rejects_version_over_max_length(self) -> None:
        with pytest.raises(ValidationError):
            ProjectCreate.model_validate({"name": "Kano", "version": "v" * 51})

    def test_rejects_missing_fields(self) -> None:
        with pytest.raises(ValidationError):
            ProjectCreate.model_validate({"name": "Kano"})


class TestProjectUpdate:
    def test_accepts_name_only(self) -> None:
        payload = ProjectUpdate.model_validate({"name": "Kano v2"})
        assert payload.name == "Kano v2"
        assert payload.version is None

    def test_accepts_version_only(self) -> None:
        payload = ProjectUpdate.model_validate({"version": "2.0"})
        assert payload.version == "2.0"
        assert payload.name is None

    def test_accepts_both_fields(self) -> None:
        payload = ProjectUpdate.model_validate({"name": "Kano v2", "version": "2.0"})
        assert payload.name == "Kano v2"
        assert payload.version == "2.0"

    def test_rejects_empty_body(self) -> None:
        with pytest.raises(ValidationError):
            ProjectUpdate.model_validate({})

    def test_rejects_explicit_nulls_only(self) -> None:
        with pytest.raises(ValidationError):
            ProjectUpdate.model_validate({"name": None, "version": None})

    def test_rejects_name_over_max_length(self) -> None:
        with pytest.raises(ValidationError):
            ProjectUpdate.model_validate({"name": "x" * 201})


class TestProjectResponse:
    def test_round_trips_from_sqlalchemy_instance(self) -> None:
        # No DB session needed — ``from_attributes`` just reads attrs.
        now = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
        instance = Project(
            id=uuid4(),
            name="Kano",
            version="1.0",
            current_epoch=2,
            created_at=now,
            updated_at=now,
        )

        response = ProjectResponse.model_validate(instance)

        assert response.id == instance.id
        assert response.name == "Kano"
        assert response.version == "1.0"
        assert response.current_epoch == 2
        assert response.created_at == now
        assert response.updated_at == now

    def test_serializes_snake_case_keys(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=UTC)
        response = ProjectResponse(
            id=uuid4(),
            name="Kano",
            version="1.0",
            current_epoch=1,
            created_at=now,
            updated_at=now,
        )
        dumped = response.model_dump()
        assert set(dumped.keys()) == {
            "id",
            "name",
            "version",
            "current_epoch",
            "created_at",
            "updated_at",
        }


class TestProjectSummary:
    def test_round_trips_and_omits_updated_at(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=UTC)
        instance = Project(
            id=uuid4(),
            name="Kano",
            version="1.0",
            current_epoch=1,
            created_at=now,
            updated_at=now,
        )
        summary = ProjectSummary.model_validate(instance)
        dumped = summary.model_dump()
        assert set(dumped.keys()) == {"id", "name", "version", "current_epoch", "created_at"}
