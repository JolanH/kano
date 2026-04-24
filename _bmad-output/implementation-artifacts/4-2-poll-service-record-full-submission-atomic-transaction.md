# Story 4.2: poll_service.record_full_submission atomic transaction

Status: ready-for-dev

## Story

As a solo dev,
I want `services/poll_service.record_full_submission(poll_id, submission_body)` that either persists one complete submission + its N responses atomically, or nothing,
so that FR25's silent-discard-of-partials rule is enforceable by construction (transaction rollback on any failure).

## Acceptance Criteria

1. **Given** a valid non-expired poll with N active features pinned to `(project_id, epoch)`, **when** `record_full_submission(poll_id, body)` is invoked with answers covering all N `feature_key`s exactly once, **then** the function opens a single SQLAlchemy transaction, creates one `submission` row, computes `Category` via `kano_matrix.compute_category(fq, dq)` for each answer, creates N `response` rows with the computed `category` and the resolved `feature_id`, commits, and returns the new `submission.id`.
2. **Given** any single `response` insert fails mid-transaction (DB constraint violation, programming error), **when** the transaction context exits, **then** the transaction rolls back and the function re-raises as `SubmissionFailed`; zero `submission` and zero `response` rows persist (verified by `SELECT COUNT(*)` before and after the failure).
3. **Given** the submission body is missing an answer for any feature in the poll's `(project_id, epoch)` active feature set, OR has duplicate `feature_key`s, OR has extra answers that don't map to features in the set, **when** `record_full_submission` is invoked, **then** the function raises `PartialSubmission(poll_id, missing=[...], unexpected=[...])` **before any DB write**; the caller maps this to HTTP 422.
4. **Given** the submission body references a `feature_key` not present in the poll's pinned `(project_id, epoch)` active feature set, **when** `record_full_submission` is invoked, **then** the function raises `InvalidFeatureReference(poll_id, feature_key)` (a subclass of or distinct from `PartialSubmission` — see Dev Notes); the caller maps this to HTTP 422.
5. **Given** the poll's `expires_at <= now()`, **when** `record_full_submission` is invoked, **then** the function raises `PollExpired(poll_id, expires_at)` (already defined by Story 3.4); no rows persist; the caller maps this to HTTP 410.
6. **Given** an unknown `poll_id`, **when** `record_full_submission` is invoked, **then** the function raises `EntityNotFound("poll", poll_id)`; the caller maps this to HTTP 404.
7. `tests/integration/test_poll_service_submissions.py` parametrizes across the happy path, partial-missing, partial-extra, duplicate-keys, invalid-feature-reference, expired-poll, and unknown-poll cases and asserts zero leftover `submission`/`response` rows after each failure path.
8. The category stored on each `response` row matches `kano_matrix.compute_category(fq_answer, dq_answer)` for that answer — asserted by a happy-path integration test across ≥3 distinct (fq, dq) → category cells from the Story 1.5 matrix.

## Tasks / Subtasks

- [ ] Extend `src/kano/exceptions.py`
  - [ ] `class PartialSubmission(Exception):` — attributes: `poll_id: UUID`, `missing: list[UUID]` (feature_keys expected but absent), `unexpected: list[UUID]` (feature_keys present but not in the poll set), `duplicates: list[UUID]` (feature_keys repeated in the body)
  - [ ] `class InvalidFeatureReference(Exception):` — attributes: `poll_id: UUID`, `feature_key: UUID`. See Dev Notes for whether to make this a subclass of `PartialSubmission` or distinct.
  - [ ] `class SubmissionFailed(Exception):` — attributes: `poll_id: UUID`, `cause: Exception | None` (the underlying DB error for structured logging)
  - [ ] `PollExpired` and `EntityNotFound` already exist (Stories 3.4 and 2.4) — reuse, do not redefine
- [ ] Extend `src/kano/services/poll_service.py` (AC: #1, #2, #3, #4, #5, #6, #8)
  - [ ] New function alongside existing `create_poll` and `get_poll_public` (Stories 3.2, 3.4):
    ```python
    def record_full_submission(poll_id: UUID, body: PollSubmission) -> UUID:
        poll = db.session.get(Poll, poll_id)
        if poll is None:
            raise EntityNotFound("poll", poll_id)
        if poll.expires_at <= datetime.now(tz=UTC):
            raise PollExpired(poll_id=poll.id, expires_at=poll.expires_at)

        # Load the poll's pinned active feature set
        features = db.session.execute(
            select(Feature).where(
                Feature.project_id == poll.project_id,
                Feature.epoch == poll.epoch,
                Feature.is_active == True,
            )
        ).scalars().all()
        features_by_key = {f.feature_key: f for f in features}
        expected_keys = set(features_by_key.keys())

        # Structural validation — BEFORE any write
        body_keys = [a.feature_key for a in body.answers]
        body_key_set = set(body_keys)
        duplicates = sorted({k for k in body_keys if body_keys.count(k) > 1})
        missing = sorted(expected_keys - body_key_set)
        unexpected = sorted(body_key_set - expected_keys)
        if duplicates or missing or unexpected:
            raise PartialSubmission(
                poll_id=poll_id,
                missing=missing,
                unexpected=unexpected,
                duplicates=duplicates,
            )

        # Atomic write
        try:
            submission = Submission(id=uuid4(), poll_id=poll_id)
            db.session.add(submission)
            db.session.flush()  # get submission.id assigned before inserting responses
            for answer in body.answers:
                feature = features_by_key[answer.feature_key]
                category = compute_category(answer.fq_answer, answer.dq_answer)
                db.session.add(Response(
                    submission_id=submission.id,
                    feature_id=feature.id,
                    fq_answer=answer.fq_answer,
                    dq_answer=answer.dq_answer,
                    category=category,
                ))
            db.session.commit()
            return submission.id
        except (PartialSubmission, InvalidFeatureReference, PollExpired, EntityNotFound):
            db.session.rollback()
            raise
        except Exception as cause:
            db.session.rollback()
            raise SubmissionFailed(poll_id=poll_id, cause=cause) from cause
    ```
  - [ ] Import `from kano.services.kano_matrix import compute_category` (Story 1.5)
  - [ ] `datetime.now(tz=UTC)` — never `datetime.utcnow()` per Story 3.2 Dev Notes / architecture §Naming
  - [ ] Transaction boundary: one `commit()` after all inserts. If any insert raises, the outer `except` triggers rollback — SQLAlchemy will un-stage the pending `submission` + responses since nothing was committed yet.
- [ ] Extend `src/kano/api/errors.py` Problem Details registry (used by Story 4.3)
  - [ ] `PartialSubmission` → 422 `type=https://kano.example.com/problems/partial-submission`, `title=Submission is incomplete or malformed`, `detail` listing the missing/unexpected/duplicate feature_keys, `status=422`
  - [ ] `InvalidFeatureReference` → 422 `type=https://kano.example.com/problems/invalid-feature-reference`, `title=Feature reference does not belong to this poll`, `detail` naming the offending `feature_key`, `status=422`
  - [ ] `SubmissionFailed` → 500 `type=https://kano.example.com/problems/submission-failed`, `title=Submission could not be recorded`, `detail` generic (no leak of the underlying `cause` string to the wire — log it via structlog only), `status=500`
  - [ ] Note: the 422 `type` values map directly to Story 4.7's client-side Problem Details parsing (the SPA routes the user back to the offending question based on `type` + the missing/unexpected payload).
- [ ] Integration tests (AC: #2, #3, #4, #5, #6, #7, #8)
  - [ ] `tests/integration/test_poll_service_submissions.py`:
    - `test_record_full_submission_happy_path`: seed project + 3 features on epoch 1 + non-expired poll → call with 3 correct answers → assert returns UUID, `submission` row count = 1, `response` row count = 3, each response has the expected `category` per matrix
    - `test_record_full_submission_partial_missing`: 3-feature poll, body has 2 answers → asserts `PartialSubmission` with correct `missing` list, `SELECT COUNT(*) FROM submissions` before == after (zero)
    - `test_record_full_submission_partial_extra`: body has 4 answers for a 3-feature poll (one not in the set) → asserts `PartialSubmission` with `unexpected` non-empty; zero rows persisted
    - `test_record_full_submission_duplicate_keys`: body has 3 answers, two with the same `feature_key` → asserts `PartialSubmission` with `duplicates` non-empty; zero rows persisted
    - `test_record_full_submission_invalid_feature_reference`: body references a `feature_key` from a **different** project's epoch → asserts `PartialSubmission` or `InvalidFeatureReference` (pick one behavior and pin it); zero rows persisted
    - `test_record_full_submission_expired_poll`: poll with `expires_at = now - 1 minute` → asserts `PollExpired`; zero rows persisted
    - `test_record_full_submission_unknown_poll`: random UUID → asserts `EntityNotFound("poll", ...)`; zero rows persisted
    - `test_record_full_submission_category_matches_matrix`: parametrize over ≥3 (fq, dq) cells spanning different Kano categories, call `record_full_submission`, assert the stored `response.category` equals `compute_category(fq, dq)` for each
    - `test_record_full_submission_snapshot_frozen_after_epoch_bump`: seed poll on epoch 1 with 2 features → bump project to epoch 2 via the Story 2.7 path → submit to the original poll with the **epoch-1 feature_keys** → succeeds (the poll is pinned; epoch-1 features are still there); 1 submission, 2 responses with `feature_id` pointing at the epoch-1 rows, not epoch-2

## Dev Notes

### `InvalidFeatureReference` vs `PartialSubmission` — pick one contract

These two are indistinguishable from the respondent's perspective: both mean "the body doesn't match the poll's feature set." The epics file lists them as separate AC items in Story 4.2 (lines 1060–1064).

**Recommendation**: treat `InvalidFeatureReference` as redundant with `PartialSubmission.unexpected`. Raise only `PartialSubmission` from `record_full_submission` — its `unexpected` list IS the invalid-reference signal. Then the registry in `api/errors.py` maps both to 422 with the `partial-submission` type.

Keep a `class InvalidFeatureReference(PartialSubmission)` shell **only if** you discover a downstream caller (Story 4.7's client parser) needs to distinguish them in the wire — otherwise delete it and update the epic's AC wording in a follow-up PR note. Document whichever path is chosen in the Dev Agent Record.

### `session.flush()` vs implicit flush on commit

The `flush()` after adding the `Submission` ensures the PK is assigned and available for the `Response.submission_id` FK before the subsequent inserts. SQLAlchemy would auto-flush on commit, but the FK reference on the pending `Response` rows resolves against the session's identity map — explicit `flush()` makes the ordering obvious and avoids subtle bugs if the session config changes.

### Why structural validation BEFORE the transaction

Running `PartialSubmission` validation before any write means a 422 response never leaves orphaned session state. Even if SQLAlchemy would rollback on the exception, raising before `db.session.add()` is cleaner: no DB round-trips, no log noise, no integrity-constraint near-misses. Cheap defensive posture.

### Category computation at the service layer, not the DB

The `Category` column on `responses` is `CHAR(1)` with a CHECK constraint (migration 0001). The category is computed in Python via `kano_matrix.compute_category(fq, dq)` (Story 1.5 — a pure function with 25 parametrized test cells proving correctness). No trigger, no computed column. This is intentional:
1. Keeping the matrix in Python keeps Story 1.5's test suite the single source of truth.
2. The DB CHECK constraint is defense-in-depth: if a bug ever writes an invalid category, the DB rejects the INSERT, the transaction rolls back, the exception fires, and the test suite catches it.

### Snapshot-frozen invariant

The `test_record_full_submission_snapshot_frozen_after_epoch_bump` test is load-bearing for the epoch contract from the submission side. Pairs with:
- Story 3.2's `test_poll_pinned_to_creation_epoch_not_project_current` (creation side)
- Story 3.4's `test_get_poll_public_snapshot_frozen_after_epoch_bump` (read side)

Together, these three tests prove: a poll created at epoch N stays pinned to epoch N for its entire lifecycle — creation, read, submission — even across subsequent epoch bumps.

### Coverage gate

PRD §Technical Success (line 94) + architecture §Cross-Cutting Concerns item 10: `poll_expiry` and `kano_matrix` and `epoch_service` are on the ≥85% line / 100% branch coverage gate. `poll_service.record_full_submission` joins that list implicitly — the CI coverage report should flag any uncovered branch here. Make sure each exception path has an explicit test.

### Logging

Per architecture §Logging (line 737): no PII in log lines. When `SubmissionFailed` is raised, log the `cause` exception class + message and the `poll_id` at `ERROR` level via structlog — but do NOT log the submission body. Keep the event key consistent with existing service logs (`event="submission_failed"`).

### Not in scope

- The POST endpoint + CSRF exemption + body validation — Story 4.3
- Client-side draft management / routing on 422 — Story 4.7
- Rate limiting / abuse prevention — deferred to v2 (architecture §Security line 316)

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/exceptions.py` (add `PartialSubmission`, `InvalidFeatureReference` (or omit per Dev Notes), `SubmissionFailed`)
- Extend `kano-backend/src/kano/api/errors.py` (Problem Details registry)
- Extend `kano-backend/src/kano/services/poll_service.py` (add `record_full_submission` alongside `create_poll`, `get_poll_public`)
- `kano-backend/tests/integration/test_poll_service_submissions.py` (new)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR24, FR25] — completeness gate + silent partial discard
- [Source: _bmad-output/planning-artifacts/prd.md#FR28, FR29, FR30] — Kano computation + 3-field response schema + one-poll linkage
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8] — no PII
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Success] — coverage gate on `kano_matrix`, `epoch_service`, `poll_expiry`
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — single-transaction submission contract (line 259); `(project_id, epoch)` snapshot (lines 237–240)
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — 422 = semantically rejected, 410 = gone, 404 = not found
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — validate via Pydantic schema before handler body; no raw SQL outside migrations
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — original AC
- [Source: _bmad-output/implementation-artifacts/1-5-kano-categorization-matrix-pure-function-module-with-25-cell-parametrized-test.md] — `compute_category(fq, dq)` contract
- [Source: _bmad-output/implementation-artifacts/3-2-create-poll-endpoint-pinned-to-current-epoch-with-7-day-ttl.md] — `poll_service.create_poll` precedent + UTC discipline
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — `PollExpired`, `EntityNotFound`, poll lookup pattern
- [Source: _bmad-output/implementation-artifacts/4-1-submission-and-response-models-with-pydantic-schemas.md] — `PollSubmission`, `AnswerIn`, `Submission`, `Response` models

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
