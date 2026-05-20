"""Centralized epoch invariant — every feature mutation routes through here.

Why this is the keystone of Epic 2:

- PRD §Risk Mitigation Strategy flags **epoch isolation drift** as the top
  data-model risk. The architecture's §Enforcement Guidelines makes
  bypassing this module a code-review rejection.
- The contract :func:`bump_epoch_on_feature_change` owns the *transaction
  boundary* and the *epoch decision*; the caller (Story 2-7's feature
  blueprint) owns the specific add/edit/delete mutation via a callback.

Concurrency: the project row is locked with ``SELECT ... FOR UPDATE`` so two
concurrent mutations can never both clone epoch N into N+1 (which would
violate the ``UniqueConstraint(project_id, epoch, feature_key)`` on features
and corrupt the lineage).
"""

from __future__ import annotations

from collections.abc import Callable
from uuid import UUID, uuid4

from sqlalchemy import select

from kano.db import db
from kano.exceptions import EntityNotFound, EpochBumpRequired
from kano.models.feature import Feature
from kano.models.poll import Poll
from kano.models.project import Project

MutationFn = Callable[[int], None]


def get_current_epoch(project_id: UUID) -> int:
    """Return the project's ``current_epoch``. Raise if the project is absent."""

    project = db.session.get(Project, project_id)
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")
    return project.current_epoch


def _has_polls_for_epoch(project_id: UUID, epoch: int) -> bool:
    stmt = select(Poll.id).where(Poll.project_id == project_id, Poll.epoch == epoch).limit(1)
    return db.session.execute(stmt).first() is not None


def _clone_active_features(
    project_id: UUID,
    from_epoch: int,
    to_epoch: int,
    *,
    exclude_feature_keys: frozenset[UUID] = frozenset(),
) -> None:
    """Snapshot every active feature at ``from_epoch`` into ``to_epoch``.

    ``feature_key`` is preserved so analysis and history flows can stitch
    epochs back together via the stable key. ``id`` is fresh (per-epoch row).

    Features whose ``feature_key`` appears in ``exclude_feature_keys`` are
    intentionally NOT cloned forward — DELETE semantics from Story 2-7.
    """

    sources_stmt = select(Feature).where(
        Feature.project_id == project_id,
        Feature.epoch == from_epoch,
        Feature.is_active.is_(True),
    )
    for source in db.session.execute(sources_stmt).scalars().all():
        if source.feature_key in exclude_feature_keys:
            continue
        clone = Feature(
            id=uuid4(),
            project_id=project_id,
            epoch=to_epoch,
            feature_key=source.feature_key,
            name=source.name,
            description=source.description,
            is_active=True,
        )
        db.session.add(clone)
    # Push the inserts before the caller's mutation runs so its UPDATE/DELETE
    # statements can find the newly-cloned epoch N+1 rows.
    db.session.flush()


def bump_epoch_on_feature_change(
    project_id: UUID,
    mutation_fn: MutationFn,
    *,
    acknowledged: bool,
    exclude_feature_keys: frozenset[UUID] | None = None,
) -> int:
    """Apply ``mutation_fn`` at the right epoch; bump if a poll exists.

    Returns the epoch the mutation was applied at.

    Three branches:

    * **No polls at current epoch** — mutate in place at epoch N, return N.
    * **Polls exist, not acknowledged** — raise :class:`EpochBumpRequired`.
    * **Polls exist, acknowledged** — clone active features into N+1
      (skipping any feature_keys in ``exclude_feature_keys``), advance
      ``project.current_epoch`` to N+1, apply ``mutation_fn`` against N+1,
      return N+1. Epoch N rows are left byte-identical regardless of
      ``exclude_feature_keys`` — exclusion only affects what crosses into
      N+1 (DELETE semantics: the feature stays alive in N, never reaches
      N+1).
    """

    stmt = select(Project).where(Project.id == project_id).with_for_update()
    project = db.session.execute(stmt).scalar_one_or_none()
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    n = project.current_epoch

    if not _has_polls_for_epoch(project_id, n):
        mutation_fn(n)
        db.session.commit()
        return n

    if not acknowledged:
        raise EpochBumpRequired(
            project_id=project_id,
            current_epoch=n,
            would_be_epoch=n + 1,
        )

    next_epoch = n + 1
    _clone_active_features(
        project_id,
        n,
        next_epoch,
        exclude_feature_keys=exclude_feature_keys or frozenset(),
    )
    project.current_epoch = next_epoch
    mutation_fn(next_epoch)
    db.session.commit()
    return next_epoch
