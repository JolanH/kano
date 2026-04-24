# Story 3.4: Public poll-by-UUID read endpoint (CSRF-exempt)

Status: ready-for-dev

## Story

As a respondent with a poll URL,
I want to fetch the poll's feature list and expiry status,
so that the respondent landing can render the correct state (live, expired, not-found).

## Acceptance Criteria

1. **Given** a valid poll UUID whose `expires_at > now()`, **when** I `GET /api/v1/polls/:uuid` from any origin (no CSRF token, no session cookie required), **then** the response is 200 with a `PollPublic` body: `id`, `expires_at`, `features` array of `{feature_key, name, description}` from the poll's pinned `(project_id, epoch)` snapshot, ordered by feature `created_at` ascending.
2. The response body contains **no PM-facing fields**: no `project_id`, no `project_name`, no `epoch` number, no `response_count`, no `created_at` on the poll itself. A serialization test asserts the JSON key set exactly matches `{id, expires_at, features}`.
3. **Given** a poll UUID whose `expires_at <= now()`, **when** I `GET /api/v1/polls/:uuid`, **then** the response is 410 Gone with Problem Details: `type=https://kano.example.com/problems/poll-expired`, `title=Poll is closed`, `status=410`, `detail` explaining the poll has closed; **no feature list** in the body.
4. **Given** a UUID that doesn't match any poll, **when** I `GET /api/v1/polls/:uuid`, **then** the response is 404 with Problem Details `type=entity-not-found`.
5. The endpoint is explicitly CSRF-exempt via `middleware/security.py` (or the equivalent hook installed in Story 1.3) — a request with no session cookie AND no `X-CSRF-Token` header still returns 200 on the happy path.
6. The endpoint is CORS-accessible from any origin (consumed by the respondent SPA bundle which runs on the same origin in v1, but the contract intentionally does not depend on that — no CORS restriction on `/api/v1/polls/:uuid`).
7. The endpoint is documented in `kano-backend/openapi.yaml`.

## Tasks / Subtasks

- [ ] Extend `src/kano/exceptions.py` with `PollExpired`
  - [ ] Class attributes: `poll_id: UUID`, `expires_at: datetime`
- [ ] Extend `src/kano/api/errors.py` Problem Details registry
  - [ ] `PollExpired` → 410 `type=https://kano.example.com/problems/poll-expired`, `title=Poll is closed`, `detail="This poll closed at {expires_at.isoformat()}. No further submissions or reads accepted."`, `status=410`
  - [ ] Ensure `EntityNotFound("poll", poll_id)` → 404 with `type=entity-not-found` (reuse existing registry from Story 1.3 / 2.4)
- [ ] `services/poll_service.py` (AC: #1, #3, #4)
  - [ ] `def get_poll_public(poll_id: UUID) -> PollPublic:`
    ```python
    poll = db.session.get(Poll, poll_id)
    if poll is None:
        raise EntityNotFound("poll", poll_id)
    if poll.expires_at <= datetime.now(tz=UTC):
        raise PollExpired(poll_id=poll.id, expires_at=poll.expires_at)
    features = db.session.execute(
        select(Feature)
        .where(
            Feature.project_id == poll.project_id,
            Feature.epoch == poll.epoch,
            Feature.is_active == True,
        )
        .order_by(Feature.created_at.asc())
    ).scalars().all()
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
    ```
  - [ ] Note: `is_active=TRUE` filter is correct — soft-deleted features from a past in-place edit on an empty-response epoch should not appear. However, for an epoch pinned by an existing poll (which is the invariant whenever a poll exists), `is_active=TRUE` will hold for every cloned row because Story 2.7's delete-with-ack branch excludes deleted features from the N+1 clone rather than cloning them as inactive. The filter is defense-in-depth.
- [ ] `api/polls.py` blueprint — public read handler (AC: #1, #5, #6)
  - [ ] `@polls_bp.get("/polls/<uuid:poll_id>")`
    - `return get_poll_public(poll_id).model_dump(mode="json"), 200`
  - [ ] Mark CSRF-exempt: decorate with `@csrf.exempt` (Flask-WTF) **on this specific route**, OR register the path pattern in Story 1.3's `CSRF_EXEMPT_PATHS` config — whichever pattern Story 1.3 established. Add a code comment: `# CSRF-exempt per architecture §Authentication & Security: public respondent endpoints`.
  - [ ] Mark CORS-open: if Story 1.3 registered a strict origin allowlist, ensure `/api/v1/polls/<uuid>` is in the public-origin whitelist (or configured as a permissive route via Flask-CORS `resources` map). Architecture §Authentication & Security line 302 + 343: public respondent endpoints allow any origin.
- [ ] OpenAPI documentation (AC: #7)
  - [ ] Path `/api/v1/polls/{poll_id}`:
    - `get` operation, `security: []` (explicitly no CSRF)
    - 200 response: `$ref: PollPublic`
    - 404: `ProblemDetails` (`type=entity-not-found`)
    - 410: `ProblemDetails` (`type=poll-expired`)
  - [ ] Add `PollPublic` and `PollPublicFeature` to `components.schemas`
- [ ] Integration tests (AC: #1, #2, #3, #4, #5)
  - [ ] `tests/integration/test_polls_public_api.py::test_get_poll_public_success`
    - Seed: project + 3 features on epoch 1 + poll on epoch 1
    - GET `/api/v1/polls/<id>` **without** CSRF header or session cookie
    - Assert 200, body keys exactly `{"id", "expires_at", "features"}`, features length 3, each has exactly `{"feature_key", "name", "description"}` keys, order matches `created_at` asc
  - [ ] `test_get_poll_public_no_pm_fields_leak` (AC #2 explicit coverage)
    - Parse response JSON; assert `"project_id" not in body`, `"epoch" not in body`, `"response_count" not in body`, `"created_at" not in body`, and same for each feature item: `"project_id" not in f`, `"epoch" not in f`, `"id" not in f` (Feature.id is an implementation detail; only `feature_key` is stable identity in the wire)
  - [ ] `test_get_poll_public_expired_returns_410`
    - Seed: poll with `expires_at = now - 1 minute`
    - GET → assert 410, Problem Details body with `type=...poll-expired`, no `features` key
  - [ ] `test_get_poll_public_not_found_returns_404`
  - [ ] `test_get_poll_public_csrf_exempt`
    - Fresh test client, never calls `/api/csrf-token`, sends GET without `X-CSRF-Token` → asserts 200 (success) not 403
  - [ ] `test_get_poll_public_snapshot_frozen_after_epoch_bump`
    - Seed: project + 1 feature on epoch 1 + poll at epoch 1
    - Bump epoch via `POST /projects/:id/features?acknowledged=true` with a new feature — project now at epoch 2 with 2 features
    - GET the original poll → assert `features` array still has the **1 original feature** from epoch 1, not 2

## Dev Notes

### Why 410 Gone, not 404 or 409

410 Gone is HTTP's specific "this resource used to exist and is now permanently gone" signal. RFC 9110. Respondent clients can distinguish:
- 404: wrong URL / typo / guessing attack
- 410: URL was once valid, poll has closed — trigger the expired-page UX (Story 3.8's `<Expired>` view)

409 is wrong here — 409 is used elsewhere in this codebase for epoch-bump conflicts (architecture §API & Communication Patterns line 532), which is a specifically semantic-state conflict on a state-changing request. A GET against an expired resource is gone, not conflicted.

### Public-endpoint minimal disclosure

NFR8 (no PII) forbids respondent-surface leakage of PM metadata. Even though the respondent has the UUID (which they got from the URL), the response shouldn't reveal:
- The project they're answering about (`project_name` could cross-reference across studies)
- The epoch number (leaks roadmap cadence)
- How many responses so far (leaks participation rate to competitors)

Keep the wire schema tight: exactly `{id, expires_at, features}`. Future Story 4.4 (respondent landing page) will render a product-team branding but won't need any of those PM fields.

### CSRF-exempt: do it at the route, not globally

Story 1.3 installed `CSRFProtect(app)` at the app factory. Flask-WTF supports per-view exemption via `@csrf.exempt`. Alternative: a path allowlist via a `before_request` hook. Pick whichever pattern Story 1.3 documented; add a code comment pointing at this story and at architecture line 300 for rationale.

Critically: do NOT disable CSRF globally; do NOT exempt `/api/v1/*`. Only this specific route (and Story 4.3's `POST /api/v1/polls/<uuid>/submit`) should be exempt.

### CORS for the public endpoint

Architecture §Authentication & Security line 302: "Flask-CORS configured with an explicit origin allowlist (production domain only). No wildcards." That rule is for PM-facing `/app/*` endpoints. Respondent routes served at `/poll/*` on the same origin don't trip CORS in practice (same-origin fetch). But if a third-party ever consumes this endpoint, a permissive CORS profile on `/api/v1/polls/<uuid>` doesn't widen the attack surface because the UUID is already the only authentication.

Recommended config: register `/api/v1/polls/<uuid>` in Flask-CORS's `resources` map with `origins="*"` explicitly. Document in a code comment that this is intentional.

### Feature ordering: `created_at` ascending

Story 3.8's respondent-landing stub needs stable feature ordering so that the respondent flow (Story 4.6) presents questions in a deterministic sequence. `created_at` asc = "the order Paola typed them," which matches the authoring intent.

### Snapshot integrity assertion in the test suite

`test_get_poll_public_snapshot_frozen_after_epoch_bump` is the strongest integration assertion of the epoch contract from the respondent side. Pairs with Story 3.2's `test_poll_pinned_to_creation_epoch_not_project_current` (from the creation side). Both together prove: once a poll is created, its feature set is frozen, even if the PM later edits the project.

### Not in scope

- `POST /api/v1/polls/<uuid>/submit` — Story 4.3.
- Public analysis endpoint `/api/v1/polls/<uuid>/analysis` — Story 5.2.
- Respondent SPA routes and UI — Stories 3.8 (stub), 4.4 (full landing).
- Rate limiting on the public read — deferred to Phase 2 per architecture §Security line 316.

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/exceptions.py` (add `PollExpired`)
- Extend `kano-backend/src/kano/api/errors.py` (registry for `PollExpired` → 410)
- Extend `kano-backend/src/kano/services/poll_service.py` (add `get_poll_public`)
- Extend `kano-backend/src/kano/api/polls.py` (public GET handler + CSRF exemption + CORS config)
- Extend `kano-backend/openapi.yaml`
- `kano-backend/tests/integration/test_polls_public_api.py` (new file; kept separate from `test_polls_api.py` since this route has a fundamentally different auth model — makes the CSRF-exempt assertions easier to reason about)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR15, FR19, FR27] — public URL access, 7-day expiry, expired-poll page with off-ramp
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8] — no PII on respondent surface
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — respondent routes CSRF-exempt (line 300); CORS policy (line 302); unguessable UUIDv4 (line 314)
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map line 343–347; 410 is Gone
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — snapshot integrity via `(project_id, epoch)`
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4] — original AC
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-csrf-cors-request-id-structured-logging-and-problem-details-middleware.md] — CSRF + CORS + Problem Details middleware; CSRF-exemption mechanism
- [Source: _bmad-output/implementation-artifacts/2-7-feature-mutation-api-with-epoch-bump-gating.md] — epoch-bump clone semantics (consumed for AC #2's snapshot-frozen assertion)
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — `PollPublic` schema boundary
- [Source: _bmad-output/implementation-artifacts/3-2-create-poll-endpoint-pinned-to-current-epoch-with-7-day-ttl.md] — snapshot-by-read contract

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
