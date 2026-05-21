"""Poll-aggregate service functions.

Owns the read-then-insert contract that pins a new poll to its project's
``current_epoch`` at the instant of creation. Snapshot integrity is
guaranteed by Story 1.2's ``UNIQUE (project_id, epoch, feature_key)`` on
``features`` combined with ``epoch_service.bump_epoch_on_feature_change``
being the only path that writes feature rows — so once a poll is pinned
to ``(project_id, epoch=N)``, the features it references can never mutate.

``response_count`` / ``is_expired`` are NOT stored on the ``polls`` table.
This service sets them as transient attributes on the returned ``Poll``
instance so ``PollSummary.model_validate(poll)`` (Pydantic
``from_attributes=True``) picks them up. Story 3.3 mirrors this pattern
when its query selects ``COUNT(submissions.id)`` as ``response_count``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import Select, func, select

from kano.db import db
from kano.exceptions import (
    EntityNotFound,
    PartialSubmission,
    PollExpired,
    PollRequiresFeatures,
    SubmissionFailed,
)
from kano.models.feature import Feature
from kano.models.poll import Poll
from kano.models.project import Project
from kano.models.response import Response
from kano.models.submission import Submission
from kano.schemas.poll import PollPublic, PollPublicFeature
from kano.schemas.submission import PollSubmission
from kano.services.kano_matrix import compute_category

POLL_TTL_DAYS = 7


def _active_features_query(project_id: UUID, epoch: int) -> Select[tuple[Feature]]:
    """SELECT for features active on the (project_id, epoch) snapshot.

    Single source of truth for the snapshot filter used by poll creation
    (count) and the public read (load); also consumed by Story 4-2's
    submission service.
    """

    return select(Feature).where(
        Feature.project_id == project_id,
        Feature.epoch == epoch,
        Feature.is_active.is_(True),
    )


def create_poll(project_id: UUID) -> Poll:
    """Create a poll pinned to the project's ``current_epoch`` with a 7-day TTL.

    Raises:
        EntityNotFound: project doesn't exist.
        PollRequiresFeatures: project's current epoch has zero active features.

    Returns the persisted ``Poll`` with ``response_count`` and ``is_expired``
    decorated as transient attributes so the caller can hand it straight to
    ``PollSummary.model_validate`` without an extra service round-trip.

    Concurrency: the project row is locked with ``SELECT ... FOR UPDATE`` so
    a concurrent ``epoch_service.bump_epoch_on_feature_change`` cannot
    interleave between the ``current_epoch`` read and the poll insert. The
    feature-count check runs inside the same locked window — defends against
    "all features soft-deleted between count and insert" too.
    """

    project = db.session.execute(
        select(Project).where(Project.id == project_id).with_for_update()
    ).scalar_one_or_none()
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    epoch = project.current_epoch

    active_feature_count = db.session.execute(
        select(func.count()).select_from(_active_features_query(project_id, epoch).subquery())
    ).scalar_one()
    if active_feature_count == 0:
        raise PollRequiresFeatures(project_id=project_id, epoch=epoch)

    now = datetime.now(tz=UTC)
    poll = Poll(
        id=uuid4(),
        project_id=project_id,
        epoch=epoch,
        created_at=now,
        expires_at=now + timedelta(days=POLL_TTL_DAYS),
    )
    db.session.add(poll)
    db.session.commit()
    db.session.refresh(poll)

    # Transient attributes consumed by PollSummary.model_validate via
    # Pydantic's `from_attributes=True`. Brand-new poll → no submissions yet,
    # and `expires_at` is 7 days from now → not expired.
    poll.response_count = 0  # type: ignore[attr-defined]
    poll.is_expired = False  # type: ignore[attr-defined]
    return poll


def list_polls_for_project(project_id: UUID) -> list[Poll]:
    """Return every poll for the given project, newest-first, with computed fields.

    Single SQL round-trip: LEFT OUTER JOIN ``submissions`` and ``GROUP BY``
    on ``polls.id`` to compute ``response_count`` per poll without an N+1
    loop. ``is_expired`` is derived in Python from the read timestamp.

    Raises:
        EntityNotFound: project doesn't exist.
    """

    if db.session.get(Project, project_id) is None:
        raise EntityNotFound(f"Project {project_id} not found")

    stmt = (
        select(Poll, func.count(Submission.id).label("response_count"))
        .outerjoin(Submission, Submission.poll_id == Poll.id)
        .where(Poll.project_id == project_id)
        .group_by(Poll.id)
        .order_by(Poll.created_at.desc())
    )
    rows = db.session.execute(stmt).all()
    now = datetime.now(tz=UTC)
    polls: list[Poll] = []
    for poll, response_count in rows:
        poll.response_count = response_count
        poll.is_expired = poll.expires_at <= now
        polls.append(poll)
    return polls


def list_polls_all_projects() -> list[Poll]:
    """Cross-project poll list with project enrichment, newest-first.

    Single SQL round-trip joining ``projects`` for name/version and LEFT
    OUTER JOIN on ``submissions`` for ``response_count``. Each returned
    ``Poll`` carries the four transient attributes consumed by
    ``PollSummaryWithProject.model_validate``.
    """

    stmt = (
        select(
            Poll,
            func.count(Submission.id).label("response_count"),
            Project.name.label("project_name"),
            Project.version.label("project_version"),
        )
        .join(Project, Project.id == Poll.project_id)
        .outerjoin(Submission, Submission.poll_id == Poll.id)
        .group_by(Poll.id, Project.name, Project.version)
        .order_by(Poll.created_at.desc())
    )
    rows = db.session.execute(stmt).all()
    now = datetime.now(tz=UTC)
    polls: list[Poll] = []
    for poll, response_count, project_name, project_version in rows:
        poll.response_count = response_count
        poll.is_expired = poll.expires_at <= now
        poll.project_name = project_name
        poll.project_version = project_version
        polls.append(poll)
    return polls


def get_poll_public(poll_id: UUID) -> PollPublic:
    """Respondent-facing read. Frozen feature snapshot from the poll's pinned epoch.

    Raises:
        EntityNotFound: poll doesn't exist.
        PollExpired: poll's ``expires_at`` has passed → 410 Gone.

    NO PM fields in the returned object — see ``PollPublic`` docstring for
    the boundary contract (NFR8, Story 3.4 AC #2).
    """

    poll = db.session.get(Poll, poll_id)
    if poll is None:
        raise EntityNotFound(f"Poll {poll_id} not found")

    if poll.expires_at <= datetime.now(tz=UTC):
        raise PollExpired(poll_id=poll.id, expires_at=poll.expires_at)

    features = (
        db.session.execute(
            _active_features_query(poll.project_id, poll.epoch).order_by(
                Feature.created_at.asc()
            )
        )
        .scalars()
        .all()
    )

    return PollPublic(
        id=poll.id,
        expires_at=poll.expires_at,
        features=[
            PollPublicFeature(
                feature_key=f.feature_key,
                name=f.name,
                description=f.description,
            )
            for f in features
        ],
    )


def record_full_submission(poll_id: UUID, body: PollSubmission) -> UUID:
    """Persist one complete submission + N responses inside a single transaction.

    The contract is "all or nothing": either every response row for the
    poll's pinned ``(project_id, epoch)`` active feature set lands together
    with the parent submission row, or the transaction rolls back and zero
    rows persist. FR25's "silent discard of partial submissions" is
    enforceable by construction.

    Structural validation (missing / unexpected / duplicate ``feature_key`` s)
    runs **before** any ``session.add()`` so a 422 never leaves orphaned
    session state. ``compute_category`` is invoked at the service layer;
    the DB's ``CHECK (category IN (...))`` is defence-in-depth.

    Raises:
        EntityNotFound: ``poll_id`` doesn't map to a row.
        PollExpired:    ``poll.expires_at <= now()``.
        PartialSubmission: body doesn't match the poll's pinned feature set.
        SubmissionFailed:  any other DB-level failure mid-transaction
                           (caller maps to 500; ``cause`` carries the
                           underlying exception for logging).

    Returns the new ``submission.id``.
    """

    poll = db.session.get(Poll, poll_id)
    if poll is None:
        raise EntityNotFound(f"Poll {poll_id} not found")

    if poll.expires_at <= datetime.now(tz=UTC):
        raise PollExpired(poll_id=poll.id, expires_at=poll.expires_at)

    features = (
        db.session.execute(_active_features_query(poll.project_id, poll.epoch))
        .scalars()
        .all()
    )
    features_by_key = {f.feature_key: f for f in features}
    expected_keys = set(features_by_key.keys())

    body_keys = [a.feature_key for a in body.answers]
    seen: set[UUID] = set()
    duplicate_set: set[UUID] = set()
    for key in body_keys:
        if key in seen:
            duplicate_set.add(key)
        seen.add(key)
    body_key_set = set(body_keys)
    missing = sorted(expected_keys - body_key_set)
    unexpected = sorted(body_key_set - expected_keys)
    duplicates = sorted(duplicate_set)
    if duplicates or missing or unexpected:
        raise PartialSubmission(
            poll_id=poll_id,
            missing=missing,
            unexpected=unexpected,
            duplicates=duplicates,
        )

    try:
        submission = Submission(id=uuid4(), poll_id=poll_id)
        db.session.add(submission)
        db.session.flush()
        for answer in body.answers:
            feature = features_by_key[answer.feature_key]
            category = compute_category(answer.fq_answer, answer.dq_answer)
            db.session.add(
                Response(
                    submission_id=submission.id,
                    feature_id=feature.id,
                    fq_answer=answer.fq_answer,
                    dq_answer=answer.dq_answer,
                    category=category.value,
                )
            )
        db.session.commit()
        return submission.id
    except Exception as cause:
        db.session.rollback()
        raise SubmissionFailed(poll_id=poll_id, cause=cause) from cause
