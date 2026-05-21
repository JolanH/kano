"""Unit tests for ``kano.schemas.poll``.

Pure Pydantic — no Flask, no DB. The ORM round-trip tests construct
transient ``Poll`` instances in-memory and decorate them with the
``response_count`` / ``is_expired`` transient attributes that the service
layer (Story 3.3) will populate before validation.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from kano.models.poll import Poll
from kano.schemas.poll import (
    PollPublic,
    PollPublicFeature,
    PollSummary,
    PollSummaryWithProject,
)


class TestPollSummary:
    def test_accepts_valid_dict_payload(self) -> None:
        now = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
        summary = PollSummary.model_validate(
            {
                "id": uuid4(),
                "project_id": uuid4(),
                "epoch": 3,
                "created_at": now,
                "expires_at": now + timedelta(days=7),
                "response_count": 0,
                "is_expired": False,
            }
        )
        assert summary.response_count == 0
        assert summary.is_expired is False
        assert summary.epoch == 3

    def test_round_trips_from_orm_instance_with_transient_attrs(self) -> None:
        # ``response_count`` and ``is_expired`` aren't columns — the service
        # layer sets them as transient attributes before validation. This
        # mirrors how Story 3.3's query will assemble the response.
        now = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
        instance = Poll(
            id=uuid4(),
            project_id=uuid4(),
            epoch=2,
            created_at=now,
            expires_at=now + timedelta(days=7),
        )
        instance.response_count = 3  # type: ignore[attr-defined]
        instance.is_expired = True  # type: ignore[attr-defined]

        summary = PollSummary.model_validate(instance)

        assert summary.id == instance.id
        assert summary.project_id == instance.project_id
        assert summary.epoch == 2
        assert summary.response_count == 3
        assert summary.is_expired is True

    def test_serializes_snake_case_keys(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=UTC)
        summary = PollSummary(
            id=uuid4(),
            project_id=uuid4(),
            epoch=1,
            created_at=now,
            expires_at=now + timedelta(days=7),
            response_count=0,
            is_expired=False,
        )
        assert set(summary.model_dump().keys()) == {
            "id",
            "project_id",
            "epoch",
            "created_at",
            "expires_at",
            "response_count",
            "is_expired",
        }

    def test_rejects_missing_required_field(self) -> None:
        with pytest.raises(ValidationError):
            PollSummary.model_validate(
                {
                    "id": uuid4(),
                    "project_id": uuid4(),
                    "epoch": 1,
                    "created_at": datetime.now(tz=UTC),
                    "expires_at": datetime.now(tz=UTC),
                    # response_count + is_expired missing
                }
            )


class TestPollSummaryWithProject:
    def test_extends_summary_with_project_fields(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=UTC)
        enriched = PollSummaryWithProject(
            id=uuid4(),
            project_id=uuid4(),
            epoch=1,
            created_at=now,
            expires_at=now + timedelta(days=7),
            response_count=2,
            is_expired=False,
            project_name="Kano",
            project_version="1.0",
        )
        dumped = enriched.model_dump()
        assert dumped["project_name"] == "Kano"
        assert dumped["project_version"] == "1.0"
        assert set(dumped.keys()) == {
            "id",
            "project_id",
            "epoch",
            "created_at",
            "expires_at",
            "response_count",
            "is_expired",
            "project_name",
            "project_version",
        }


class TestPollPublicFeature:
    def test_accepts_valid_payload(self) -> None:
        feature = PollPublicFeature.model_validate(
            {
                "feature_key": uuid4(),
                "name": "Auto-save",
                "description": "Saves changes every 30s",
            }
        )
        assert feature.name == "Auto-save"

    def test_accepts_null_description(self) -> None:
        feature = PollPublicFeature.model_validate(
            {"feature_key": uuid4(), "name": "Auto-save", "description": None}
        )
        assert feature.description is None

    def test_rejects_missing_feature_key(self) -> None:
        with pytest.raises(ValidationError):
            PollPublicFeature.model_validate({"name": "Auto-save", "description": None})


class TestPollPublic:
    def test_accepts_valid_payload(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=UTC)
        public = PollPublic.model_validate(
            {
                "id": uuid4(),
                "expires_at": now + timedelta(days=7),
                "features": [
                    {"feature_key": uuid4(), "name": "Auto-save", "description": None},
                ],
            }
        )
        assert len(public.features) == 1

    def test_serialized_json_has_no_pm_fields(self) -> None:
        # AC #6 + Story 3.4 AC #4 — the public surface must not leak PM data.
        now = datetime(2026, 5, 19, tzinfo=UTC)
        public = PollPublic(
            id=uuid4(),
            expires_at=now + timedelta(days=7),
            features=[
                PollPublicFeature(feature_key=uuid4(), name="Auto-save", description=None)
            ],
        )
        dumped = public.model_dump(mode="json")
        assert set(dumped.keys()) == {"id", "expires_at", "features"}
        assert "project_id" not in dumped
        assert "project_name" not in dumped
        assert "epoch" not in dumped
        assert "response_count" not in dumped
        for feature in dumped["features"]:
            assert set(feature.keys()) == {"feature_key", "name", "description"}
