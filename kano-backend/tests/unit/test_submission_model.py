"""Light unit checks on the ``Submission`` ORM declaration.

The submission table's full round-trip behaviour (flush, FK to polls,
``submitted_at`` server_default firing) is covered by Story 4.2's
integration tests against the real ``alembic_head`` schema. Here we just
pin the ORM-side surface so the declaration can't drift away from
migration 0001 without a failing test.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import inspect

from kano.models.submission import Submission


class TestSubmissionDeclaration:
    def test_tablename(self) -> None:
        assert Submission.__tablename__ == "submissions"

    def test_id_default_is_uuid4_callable(self) -> None:
        # ``default=uuid4`` fires at flush time, so we can't observe it from a
        # bare ``Submission()`` constructor. Instead inspect the column metadata
        # to confirm the wiring matches the spec — application-side ID generation,
        # not server_default.
        mapper = inspect(Submission)
        id_col = mapper.columns["id"]
        assert id_col.primary_key is True
        assert id_col.server_default is None
        assert id_col.default is not None
        produced = id_col.default.arg(None)
        assert isinstance(produced, UUID)
        assert produced.version == 4

    def test_submitted_at_has_server_default(self) -> None:
        # ``server_default=func.now()`` is what the migration installs and the
        # tests in Story 1.2 round-trip against. Drift here would silently let
        # the app try to INSERT with a NULL ``submitted_at``.
        mapper = inspect(Submission)
        col = mapper.columns["submitted_at"]
        assert col.nullable is False
        assert col.server_default is not None

    def test_poll_id_is_nonnullable_fk(self) -> None:
        mapper = inspect(Submission)
        col = mapper.columns["poll_id"]
        assert col.nullable is False
        fk_targets = {fk.target_fullname for fk in col.foreign_keys}
        assert fk_targets == {"polls.id"}

    def test_can_instantiate_with_explicit_values(self) -> None:
        # Sanity: the public constructor accepts the documented fields.
        sub = Submission(
            id=uuid4(),
            poll_id=uuid4(),
            submitted_at=datetime(2026, 5, 21, 12, 0),
        )
        assert isinstance(sub.id, UUID)
        assert isinstance(sub.poll_id, UUID)
