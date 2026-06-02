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
from uuid import UUID, uuid4, uuid5

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError

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

# Fixed namespace for deterministic poll ids. The poll id is
# ``uuid5(POLL_ID_NAMESPACE, f"{project_id}:{epoch}")`` so a given
# ``(project, epoch)`` snapshot always resolves to the same UUID — the
# primary key itself enforces "exactly one poll per snapshot" (no extra
# UNIQUE needed). The ``SELECT ... FOR UPDATE`` on the project row serializes
# concurrent creates for the same project; ``create_poll`` additionally
# guards the insert against an ``IntegrityError`` so a duplicate-PK race can
# never surface as a 500. This constant MUST stay stable forever: changing it
# orphans every poll.
POLL_ID_NAMESPACE = UUID("b54cefc2-de05-4fdd-8913-fa06a48abc30")


def _deterministic_poll_id(project_id: UUID, epoch: int) -> UUID:
    """Stable UUIDv5 for a ``(project_id, epoch)`` feature-set snapshot."""

    return uuid5(POLL_ID_NAMESPACE, f"{project_id}:{epoch}")


def _decorate_existing(poll: Poll, now: datetime) -> Poll:
    """Refresh an expired poll's TTL and attach transient response fields.

    Shared by ``create_poll``'s get-existing branch and its duplicate-insert
    race guard so both return a ``Poll`` ready for ``PollSummary.model_validate``.
    """

    if poll.expires_at <= now:
        poll.expires_at = now + timedelta(days=POLL_TTL_DAYS)
        db.session.commit()
        db.session.refresh(poll)
    poll.response_count = db.session.execute(  # type: ignore[attr-defined]
        select(func.count(Submission.id)).where(Submission.poll_id == poll.id)
    ).scalar_one()
    poll.is_expired = poll.expires_at <= now  # type: ignore[attr-defined]
    return poll


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


def create_poll(project_id: UUID) -> tuple[Poll, bool]:
    """Get-or-create the single poll for the project's ``current_epoch``.

    The poll id is deterministic — ``_deterministic_poll_id(project_id,
    epoch)`` — so exactly one poll can exist per ``(project, epoch)`` snapshot
    and re-invoking returns the existing row instead of minting a duplicate.

    Returns ``(poll, created)``: ``created`` is ``True`` when a fresh row was
    inserted, ``False`` when an existing poll was returned (so the API can
    answer 201 vs 200). The ``Poll`` carries ``response_count`` and
    ``is_expired`` as transient attributes for ``PollSummary.model_validate``.

    An existing-but-expired poll has its ``expires_at`` refreshed to
    ``now + POLL_TTL_DAYS`` so the one canonical poll stays usable rather than
    leaving the ``(project, epoch)`` snapshot permanently un-pollable.

    Raises:
        EntityNotFound: project doesn't exist.
        PollRequiresFeatures: a *new* poll is needed but the current epoch has
            zero active features. (An already-existing poll is returned
            without re-checking — its snapshot is immutable once pinned.)

    Concurrency: the project row is locked with ``SELECT ... FOR UPDATE`` so a
    concurrent ``epoch_service.bump_epoch_on_feature_change`` cannot interleave
    between the ``current_epoch`` read and the poll insert. The feature-count
    check runs inside the same locked window.
    """

    project = db.session.execute(
        select(Project).where(Project.id == project_id).with_for_update()
    ).scalar_one_or_none()
    if project is None:
        raise EntityNotFound(f"Project {project_id} not found")

    epoch = project.current_epoch
    poll_id = _deterministic_poll_id(project_id, epoch)
    now = datetime.now(tz=UTC)

    existing = db.session.get(Poll, poll_id)
    if existing is not None:
        return _decorate_existing(existing, now), False

    active_feature_count = db.session.execute(
        select(func.count()).select_from(_active_features_query(project_id, epoch).subquery())
    ).scalar_one()
    if active_feature_count == 0:
        raise PollRequiresFeatures(project_id=project_id, epoch=epoch)

    poll = Poll(
        id=poll_id,
        project_id=project_id,
        epoch=epoch,
        created_at=now,
        expires_at=now + timedelta(days=POLL_TTL_DAYS),
    )
    db.session.add(poll)
    try:
        db.session.commit()
    except IntegrityError:
        # A concurrent request inserted the same deterministic id between our
        # get() and commit(). The project-row lock makes this near-impossible
        # under PostgreSQL, but guard it so the loser still gets idempotent
        # success (the existing row) rather than a 500.
        db.session.rollback()
        raced = db.session.get(Poll, poll_id)
        if raced is None:
            raise
        return _decorate_existing(raced, now), False
    db.session.refresh(poll)

    # Transient attributes consumed by PollSummary.model_validate via
    # Pydantic's `from_attributes=True`. Brand-new poll → no submissions yet,
    # and `expires_at` is 7 days from now → not expired.
    poll.response_count = 0  # type: ignore[attr-defined]
    poll.is_expired = False  # type: ignore[attr-defined]
    return poll, True


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
