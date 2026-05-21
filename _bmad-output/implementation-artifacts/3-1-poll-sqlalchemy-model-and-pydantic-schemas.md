# Story 3.1: Poll SQLAlchemy model and Pydantic schemas

Status: done

## Story

As a solo dev,
I want the `Poll` SQLAlchemy model and its Pydantic schemas,
so that poll creation, listing, and respondent-side reading share a single typed contract.

## Acceptance Criteria

1. **Given** the `Poll` declarative model in `src/kano/models/poll.py`, **when** a poll row exists in PostgreSQL, **then** the model's `Mapped[T]` typed columns match migration 0001 exactly: `id: UUID` PK, `project_id: UUID` FK `projects(id)`, `epoch: int` (plain `INTEGER NOT NULL`, no FK — epoch integrity enforced at the app layer per Story 1.2's composite-FK resolution), `created_at: TIMESTAMPTZ server_default=func.now()`, `expires_at: TIMESTAMPTZ NOT NULL`.
2. ID generation uses the app-layer `uuid4()` helper — never DB-generated.
3. `src/kano/schemas/poll.py` exposes two response projections:
   - `PollSummary` (list-item projection for both PM lists and the create-poll response): `id: UUID`, `project_id: UUID`, `epoch: int`, `created_at: datetime`, `expires_at: datetime`, `response_count: int`, `is_expired: bool`. An optional enriched variant `PollSummaryWithProject` extends `PollSummary` with `project_name: str` and `project_version: str` for the cross-project PM home list (Story 3.3).
   - `PollPublic` (respondent-facing projection — NO PM fields): `id: UUID`, `expires_at: datetime`, `features: list[PollPublicFeature]` where `PollPublicFeature = { feature_key: UUID, name: str, description: str | None }`.
4. All Pydantic schemas enforce `snake_case` end-to-end (no `Field(alias=...)`, keys flow untouched from DB to JSON).
5. `PollSummary` and `PollSummaryWithProject` use `ConfigDict(from_attributes=True)` so they can be built from an ORM instance + annotated attributes (see Dev Notes for the `response_count` and `is_expired` population strategy).
6. `PollPublic` has no `project_id`, no `project_name`, no `epoch` field, no `response_count` — these are PM-side fields and must not leak to respondent clients (AC #4 from Story 3.4).

## Tasks / Subtasks

- [x] Refine `Poll` SQLAlchemy model (AC: #1, #2)
  - [x] `src/kano/models/poll.py` — if the stub from Story 1.2 exists, extend it; otherwise author it
  - [x] Typed columns:
    - `id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)`
    - `project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id"), nullable=False)`
    - `epoch: Mapped[int] = mapped_column(Integer, nullable=False)` — **no FK**; pair `(project_id, epoch)` is a logical snapshot identifier (Story 1.2 Dev Notes)
    - `created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)`
    - `expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)`
  - [x] `__tablename__ = "polls"` (plural, architecture §Naming)
  - [x] Verify the model reflects migration 0001 exactly — no drift (no extra columns, no missed ones)
  - [x] Add a module-level comment explaining that `(project_id, epoch)` is enforced at app level, not via composite FK — mirror the comment from `migrations/versions/0001_*.py`
- [x] Pydantic schemas (AC: #3, #4, #5, #6)
  - [x] `src/kano/schemas/poll.py` — classes:
    - `PollSummary(BaseModel)`:
      ```python
      id: UUID
      project_id: UUID
      epoch: int
      created_at: datetime
      expires_at: datetime
      response_count: int
      is_expired: bool
      model_config = ConfigDict(from_attributes=True)
      ```
    - `PollSummaryWithProject(PollSummary)`: adds `project_name: str`, `project_version: str`
    - `PollPublicFeature(BaseModel)`: `feature_key: UUID`, `name: str`, `description: str | None`
    - `PollPublic(BaseModel)`:
      ```python
      id: UUID
      expires_at: datetime
      features: list[PollPublicFeature]
      ```
      **No `from_attributes`** — `PollPublic` is assembled explicitly in the service layer (Story 3.4) from a `Poll` + its pinned feature rows; the model is a DTO, not an ORM projection.
  - [x] No `Field(alias=...)` anywhere — wire format is snake_case end-to-end per architecture §Format Patterns.
- [x] Unit tests
  - [x] `tests/unit/test_poll_schemas.py`:
    - `PollSummary.model_validate({...valid...})` succeeds with `is_expired=False`, `response_count=0`
    - `PollSummary.model_validate(poll_instance_with_extra_attrs)` — construct a SQLAlchemy `Poll` with `response_count=3` and `is_expired=True` set as non-column attributes (or via a dataclass-like stub); assert round-trip
    - `PollPublic.model_validate({...})` succeeds; serialized `model_dump(mode="json")` has NO `project_id`, NO `epoch`, NO `response_count` keys
    - `PollPublicFeature` rejects missing `feature_key`

## Dev Notes

### Contract-shaping story

This is the **first** story in Epic 3 and sets the contract shape every downstream E3 endpoint and UI consumes:
- 3.2 returns `PollSummary` on create
- 3.3 returns `list[PollSummary]` / `list[PollSummaryWithProject]`
- 3.4 returns `PollPublic` on the public read
- 3.5, 3.6, 3.7 all consume `PollSummary` client-side

Resist the urge to over-spec: match the migration exactly, follow architecture naming, move on.

### `response_count` and `is_expired` population strategy

Both fields are **computed, not stored on the `polls` table**. Population happens at the service layer (Story 3.3 owns the query):

- `response_count`: `COUNT(submission.id) GROUP BY poll_id` joined at query time. In Story 3.3's query, selected as a column alias and surfaced on the ORM result row or a SQLAlchemy `Row` tuple; the service assembles `PollSummary` via `PollSummary(**poll.__dict__, response_count=row.response_count, is_expired=poll.expires_at <= now())`.
- `is_expired`: derived in Python from `poll.expires_at <= datetime.now(tz=UTC)`. Do NOT add a stored column; the partial index on `polls(expires_at)` already optimizes read-path filters.

`from_attributes=True` gives Pydantic access to instance attributes; setting `response_count` and `is_expired` as dynamic attributes on the ORM object before validation is the idiomatic path. Alternatively, build the dict explicitly in the service. Either way, this story only defines the schema — population lives in 3.2/3.3.

### Why no composite FK on `polls(project_id, epoch)`

Story 1.2 Dev Notes (line 67–71) resolved this: PostgreSQL requires the referenced columns to be unique, but `feature(project_id, epoch)` is only unique when combined with `feature_key`. So:
- `poll.project_id` is a single-column FK to `projects(id)`.
- `poll.epoch` is a plain `INTEGER NOT NULL` with no FK.
- Epoch immutability is enforced by the application (`epoch_service.bump_epoch_on_feature_change()` from Story 2.6) + the `UNIQUE (project_id, epoch, feature_key)` on `features` guarantees epoch-N's feature rows can never be mutated.

Document this contract as a module-level comment in `src/kano/models/poll.py` pointing at the Story 1.2 rationale.

### UUIDv4 via app layer

Every model in this project uses `default=uuid4` at the `Mapped` level, **not** `server_default=text("gen_random_uuid()")`. See architecture §Data Architecture line 272 and Story 2.1 for the precedent.

### Public vs PM projection discipline

`PollPublic` is load-bearing for NFR8 (no PII) — and also for minimal-disclosure on the respondent surface. The PM sees project name/version/epoch; the respondent sees only what's needed to render the survey. Story 3.4's AC #4 asserts no PM-facing fields leak; this story is where the boundary is drawn.

### Not in scope

- No API endpoints — Stories 3.2, 3.3, 3.4.
- No service layer — endpoints bring service helpers with them.
- No submission/response schemas — those ship in Epic 4 (Story 4.1).

### Project Structure Notes

Files:
- Update `kano-backend/src/kano/models/poll.py` (extend Story 1.2 stub)
- Ensure `kano-backend/src/kano/models/__init__.py` re-exports `Poll`
- New `kano-backend/src/kano/schemas/poll.py`
- `kano-backend/tests/unit/test_poll_schemas.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — poll schema + composite (project_id, epoch) contract (lines 237–259)
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — Pydantic class naming suffix convention (line 545)
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] — snake_case end-to-end
- [Source: _bmad-output/planning-artifacts/prd.md#FR13–15, FR18] — poll generation + 7-day TTL + per-project poll list
- [Source: _bmad-output/planning-artifacts/prd.md#NFR14] — TIMESTAMPTZ UTC-everywhere
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — original AC
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-locks-the-five-table-domain-schema.md] — migration 0001 is the schema contract; composite-FK resolution rationale
- [Source: _bmad-output/implementation-artifacts/2-1-project-sqlalchemy-model-and-pydantic-schemas.md] — schema style precedent

## Dev Agent Record

### Agent Model Used
claude-opus-4-7[1m]

### Debug Log References
- `pytest tests/unit/test_poll_schemas.py` → 10/10 pass
- `pytest tests/` full suite → 148/148 pass (no regressions)
- `ruff check` → clean on all modified/added files
- `mypy src/kano/schemas/poll.py` → no issues found

### Completion Notes List
- `Poll` model already existed (authored in Story 1.2 stub) and matched migration 0001 exactly — no edits required. Verified `id`/`project_id`/`epoch`/`created_at`/`expires_at` columns and the module-level comment explaining the composite-FK split.
- Created `src/kano/schemas/poll.py` with `PollSummary`, `PollSummaryWithProject`, `PollPublicFeature`, `PollPublic`. `PollPublic` deliberately omits PM-side fields (`project_id`, `project_name`, `epoch`, `response_count`) and does NOT use `from_attributes` — it's assembled explicitly by the service layer in Story 3.4.
- Wired re-exports through `src/kano/schemas/__init__.py` to mirror the existing project/feature schema convention.
- Added unit tests covering: dict round-trip, ORM-instance round-trip with transient `response_count`/`is_expired` attrs, snake_case-only key set, project-enrichment fields, public-projection field omission (`model_dump(mode="json")` has no PM fields), and `PollPublicFeature` field validation.

### File List
- Modified: `kano-backend/src/kano/schemas/__init__.py`
- Added: `kano-backend/src/kano/schemas/poll.py`
- Added: `kano-backend/tests/unit/test_poll_schemas.py`

### Change Log
- 2026-05-20 — Story 3.1 implementation complete; status → review.
