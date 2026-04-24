# Story 3.2: Create poll endpoint pinned to current epoch with 7-day TTL

Status: ready-for-dev

## Story

As a PM,
I want to generate a new poll for a project that pins to the current epoch and expires in 7 days,
so that I receive a shareable URL I can send to customers.

## Acceptance Criteria

1. **Given** a project at `current_epoch = N` with at least one active feature on epoch N, **when** I `POST /api/v1/projects/:id/polls` (empty body; CSRF-protected), **then** the response is 201 Created with a `PollSummary` body including a freshly generated UUIDv4 `id`, `project_id` matching the path, `epoch: N`, `created_at` ≈ now, `expires_at = created_at + 7 days` (UTC `TIMESTAMPTZ`), `response_count: 0`, `is_expired: false`.
2. The response carries `Location: /api/v1/polls/:id` pointing at the created poll.
3. A row is persisted in `polls` with `(project_id, epoch)` matching the project's `current_epoch` at the instant of creation (snapshot-by-read; see Dev Notes for the read-then-insert contract).
4. **Given** a project with zero active features on the current epoch (either empty project or all features soft-deleted), **when** I `POST /api/v1/projects/:id/polls`, **then** the response is 422 Unprocessable Entity with a Problem Details envelope: `type=https://kano.example.com/problems/poll-requires-features`, `title=Poll requires at least one feature`, `status=422`, `detail` explaining the active feature list is empty on epoch N.
5. **Given** a non-existent `project_id`, **when** I `POST /api/v1/projects/:id/polls`, **then** the response is 404 with Problem Details `type=entity-not-found`.
6. Posting without the `X-CSRF-Token` header returns 403 with Problem Details.
7. **Given** a poll is created at epoch N, **when** the project's epoch is later bumped to N+1 (via Story 2.7), **then** the poll's `epoch` column remains `N` — an integration test asserts no silent drift.
8. The endpoint is documented in `kano-backend/openapi.yaml`.

## Tasks / Subtasks

- [ ] `services/poll_service.py` (AC: #1, #3, #4, #5, #7)
  - [ ] New module; initial surface:
    ```python
    POLL_TTL_DAYS = 7  # module-level constant per architecture §Python naming (UPPER_SNAKE_CASE)

    def create_poll(project_id: UUID) -> Poll:
        project = db.session.get(Project, project_id)
        if project is None:
            raise EntityNotFound("project", project_id)
        epoch = project.current_epoch
        active_feature_count = db.session.execute(
            select(func.count(Feature.id)).where(
                Feature.project_id == project_id,
                Feature.epoch == epoch,
                Feature.is_active == True,
            )
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
        return poll
    ```
  - [ ] Attach `response_count=0` and `is_expired=False` as dynamic attributes on the returned `Poll` so `PollSummary.model_validate(poll)` picks them up (Story 3.1 Dev Notes), OR construct the summary dict explicitly in the blueprint — pick one pattern and reuse it in Story 3.3
- [ ] Extend `src/kano/exceptions.py` with `PollRequiresFeatures`
  - [ ] Class attributes: `project_id: UUID`, `epoch: int`; message template: `"Project {project_id} has no active features on epoch {epoch}; cannot create a poll"`
- [ ] Extend `src/kano/api/errors.py` Problem Details registry
  - [ ] `PollRequiresFeatures` → 422 with `type=https://kano.example.com/problems/poll-requires-features`, `title=Poll requires at least one feature`, `detail` from the exception message, `request_id` from structlog context
- [ ] `api/polls.py` blueprint (AC: #1, #2, #4, #5, #6)
  - [ ] `polls_bp = Blueprint("polls", __name__, url_prefix="/api/v1")` — note: the url_prefix is just `/api/v1` because this blueprint hosts **both** the PM-side `/projects/<uuid>/polls` routes here (create + per-project list in Story 3.3) **and** the cross-project `/polls` route in Story 3.3. Story 3.4's respondent `/polls/<uuid>` public read also lives in this blueprint with an explicit CSRF exemption — keeping all poll routes in one file aligns with the architecture's "one file per resource" rule (architecture §Structure Patterns, line 586).
  - [ ] Route: `@polls_bp.post("/projects/<uuid:project_id>/polls")`
    ```python
    poll = poll_service.create_poll(project_id)
    summary = PollSummary.model_validate(poll).model_dump(mode="json")
    return summary, 201, {"Location": f"/api/v1/polls/{poll.id}"}
    ```
  - [ ] Empty body is accepted (no Pydantic validation on the request body — nothing to validate)
  - [ ] CSRF is automatic via Story 1.3's `CSRFProtect(app)` on `/api/v1/*` — no per-route decorator
  - [ ] Register the blueprint in `create_app()` alongside `projects_bp` and `features_bp`
- [ ] OpenAPI documentation (AC: #8)
  - [ ] `kano-backend/openapi.yaml` — add path `/api/v1/projects/{project_id}/polls` with `post` operation:
    - Empty request body
    - 201 response with `PollSummary` schema + `Location` header descriptor
    - 404 response → `ProblemDetails` (`type=entity-not-found`)
    - 422 response → `ProblemDetails` (`type=poll-requires-features`)
    - 403 response → `ProblemDetails` (CSRF failure)
    - Add `PollSummary` and `PollSummaryWithProject` to the `components.schemas` section (referenced by 3.3 too)
- [ ] Integration tests (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] `tests/integration/test_polls_api.py::test_create_poll_success`
    - Seed: create a project at epoch 1 via the existing fixture; add 2 active features on epoch 1
    - POST with CSRF header; assert 201, `Location` header, body matches `PollSummary` shape, `epoch==1`, `response_count==0`, `is_expired==false`, `expires_at - created_at ≈ 7 days` (tolerance 1 second)
    - Assert row persisted in DB with expected `project_id`, `epoch`, UUIDv4 `id`
  - [ ] `test_create_poll_zero_features_returns_422`
    - Seed: project at epoch 1 with no features (or all `is_active=FALSE`)
    - POST → assert 422, Problem Details body with `type=...poll-requires-features`
  - [ ] `test_create_poll_nonexistent_project_returns_404`
  - [ ] `test_create_poll_without_csrf_returns_403`
  - [ ] `test_poll_pinned_to_creation_epoch_not_project_current` (AC #7)
    - Seed: project at epoch 1 with 1 feature → create poll → assert `poll.epoch == 1`
    - Trigger epoch bump via `POST /projects/:id/features?acknowledged=true` with a new feature → project now at epoch 2
    - Reload poll from DB → assert `poll.epoch` is still 1, unchanged

## Dev Notes

### TTL is a named constant, not a literal

Architecture §Naming lines 542: Python module-level constants are `UPPER_SNAKE_CASE`. Define `POLL_TTL_DAYS = 7` at the top of `poll_service.py` and import it anywhere else that needs it (Story 3.3's `is_expired` calculation, Story 3.8's "link expires in 7 days" copy deck parameter). No bare `7` anywhere in production code.

### Snapshot-by-read, not composite FK

Per Story 1.2's composite-FK resolution (Dev Notes line 67–71) and architecture §Data Architecture line 237–240: the poll table has no composite FK to `features`. Snapshot integrity is guaranteed because:
- `(project_id, epoch, feature_key)` is UNIQUE on `features` → once a `(project_id, epoch)` pair has rows, those rows can't be mutated without a primary-key violation.
- `epoch_service.bump_epoch_on_feature_change()` (Story 2.6) is the only write path; it appends new epoch-N+1 rows and never touches epoch-N.

So reading `project.current_epoch` at poll-creation time and writing that integer into `poll.epoch` is sufficient. No FK, no trigger, no advisory lock needed beyond what 2.6 already has.

### Why 422, not 400, for zero features

Per architecture §API & Communication Patterns line 533: 422 = "submission shape valid but semantically rejected". The request body is empty and syntactically valid; what's wrong is domain state (no features on the target epoch). 400 is reserved for Pydantic validation failures against a request body schema.

### UTC discipline

`datetime.now(tz=UTC)` (not `datetime.utcnow()`, which returns a naive datetime and is deprecated in Python 3.12+). Store as `TIMESTAMPTZ` per NFR14. Import: `from datetime import UTC, datetime, timedelta`.

### Location header

Same rationale as Story 2.2 Dev Notes: RFC 9110 says 201 responses should include `Location` pointing at the new resource. The share-panel flow in Story 3.6 can use the header for client routing after the POST.

### `response_count` and `is_expired` on the create response

Two defensible patterns. Pick one and document it for Story 3.3 to mirror:

1. **Dynamic attributes on the ORM instance**: after `db.session.commit()`, set `poll.response_count = 0; poll.is_expired = False`; then `PollSummary.model_validate(poll)`. Clean; depends on Pydantic's `from_attributes=True` picking up non-column attrs.
2. **Explicit dict assembly**: `PollSummary(**{c.name: getattr(poll, c.name) for c in Poll.__table__.columns}, response_count=0, is_expired=False)`. Slightly more verbose but no magic.

Recommend pattern 1 for symmetry with Story 3.3's query-aliased `response_count`. Document the choice in the service docstring.

### Not in scope

- Poll list endpoints — Story 3.3.
- Public poll-by-UUID read — Story 3.4.
- Share panel UI — Story 3.5.
- Generate-poll UI action — Story 3.6.
- Poll expiry semantics for the respondent read (the 410 Gone branch) — Story 3.4.
- Background cleanup of expired polls — explicitly deferred to Phase 2 per PRD Risk Mitigation.

### Project Structure Notes

Files:
- `kano-backend/src/kano/services/poll_service.py` (new)
- `kano-backend/src/kano/api/polls.py` (new; extended by 3.3, 3.4)
- Extend `kano-backend/src/kano/exceptions.py` (add `PollRequiresFeatures`)
- Extend `kano-backend/src/kano/api/errors.py` (registry for `PollRequiresFeatures` → 422)
- Register blueprint in `kano-backend/src/kano/__init__.py` `create_app()`
- Extend `kano-backend/openapi.yaml`
- `kano-backend/tests/integration/test_polls_api.py` (new)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR13–15] — poll generation, publicly reachable URL, 7-day TTL
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4] — CSRF protection on state-changing PM endpoints
- [Source: _bmad-output/planning-artifacts/prd.md#NFR14] — TIMESTAMPTZ UTC
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map (`POST /api/v1/projects/:id/polls`); 422 semantic
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CSRF on PM routes; PM session cookie contract
- [Source: _bmad-output/planning-artifacts/architecture.md#Structure Patterns] — `api/polls.py` blueprint location
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — original AC
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-csrf-cors-request-id-structured-logging-and-problem-details-middleware.md] — CSRF, Problem Details, request-ID middleware
- [Source: _bmad-output/implementation-artifacts/2-2-create-project-endpoint.md] — POST pattern precedent (service + blueprint + ValidationError → Problem Details)
- [Source: _bmad-output/implementation-artifacts/2-6-feature-model-category-enum-and-epoch-service-centralized-contract.md] — `(project_id, epoch)` snapshot contract
- [Source: _bmad-output/implementation-artifacts/2-7-feature-mutation-api-with-epoch-bump-gating.md] — used in AC #7 integration test for the bump-then-check flow
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — schemas consumed here

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
