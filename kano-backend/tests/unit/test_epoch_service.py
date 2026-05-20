"""Cheap, source-file-level guards for the epoch_service contract.

Most of the behavioral coverage for ``epoch_service`` lives in
``tests/integration/test_epoch_service.py`` — it needs a real Postgres
session for the ``SELECT ... FOR UPDATE`` lock, the ``UniqueConstraint`` on
features, and the cross-row clone semantics. The bits here are the parts
that *don't* need a database round-trip and so should run in the unit lane.

Two such guards:

1. The persistence-domain ``Category`` enum
   (``kano.models.response.Category``) and the pure-function ``Category``
   enum (``kano.services.kano_matrix.Category``) must agree on values.
2. ``EpochBumpRequired`` carries the three SPA-relevant fields.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from kano.exceptions import EpochBumpRequired
from kano.models.response import Category as ModelCategory
from kano.services.kano_matrix import Category as MatrixCategory


def test_category_enum_persistence_matches_pure_function_domain() -> None:
    """Both enums must list the same six single-letter values.

    If anyone adds or renames a Kano category in one place without the
    other, this assertion breaks before the offending code reaches CI.
    """

    assert {c.value for c in ModelCategory} == {c.value for c in MatrixCategory}
    assert {c.name for c in ModelCategory} == {c.name for c in MatrixCategory}


def test_epoch_bump_required_carries_extra_fields_for_problem_details() -> None:
    project_id = uuid4()
    with pytest.raises(EpochBumpRequired) as exc_info:
        raise EpochBumpRequired(
            project_id=project_id,
            current_epoch=3,
            would_be_epoch=4,
        )

    err = exc_info.value
    assert err.project_id == project_id
    assert err.current_epoch == 3
    assert err.would_be_epoch == 4
    assert err.status_code == 409
    assert err.type_slug == "epoch-bump-required"
    # The default detail mentions the epoch transition so logs can grep it.
    assert "epoch 3" in str(err)
    assert "epoch 4" in str(err)
