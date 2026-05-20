# Story 2.1: Project SQLAlchemy model and Pydantic schemas

Status: review

## Story

As a solo dev,
I want the `Project` SQLAlchemy model and its Pydantic request/response schemas,
so that every project-facing endpoint in this epic shares a single typed contract.

## Acceptance Criteria

1. **Given** the `Project` declarative model in `src/kano/models/project.py`, **when** a project row exists in PostgreSQL, **then** the model's `Mapped[T]` typed columns match the schema from migration 0001 (id UUID PK, name TEXT, version TEXT, current_epoch INT default 1, created_at/updated_at TIMESTAMPTZ).
2. `src/kano/schemas/project.py` exposes `ProjectCreate` (inbound name+version), `ProjectUpdate` (optional name and version), `ProjectResponse` (full object including current_epoch), `ProjectSummary` (list-item projection with id, name, version, current_epoch, created_at).
3. All Pydantic schemas enforce `snake_case` end-to-end (no aliasing; keys flow untouched from DB to JSON) and apply `max_length` constraints to `name` and `version`.
4. ID generation uses the app-layer `uuid4()` helper — never DB-generated.

## Tasks / Subtasks

- [x] Refine `Project` SQLAlchemy model (AC: #1, #4)
  - [x] `src/kano/models/project.py` — if the stub from Story 1.2 exists, extend it; otherwise author it
  - [x] Typed columns: `id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)`, `name: Mapped[str] = mapped_column(Text)`, `version: Mapped[str] = mapped_column(Text)`, `current_epoch: Mapped[int] = mapped_column(Integer, default=1)`, `created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`, `updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())`
  - [x] `__tablename__ = "projects"` (plural, per architecture §Naming)
  - [x] Verify the model reflects migration 0001 exactly — no drift
- [x] Pydantic schemas (AC: #2, #3)
  - [x] `src/kano/schemas/project.py` — four classes:
    - `ProjectCreate(BaseModel)`: `name: str = Field(..., max_length=200)`, `version: str = Field(..., max_length=50)`
    - `ProjectUpdate(BaseModel)`: `name: str | None = Field(None, max_length=200)`, `version: str | None = Field(None, max_length=50)`; reject a body with zero fields via a `model_validator` that raises when both are None
    - `ProjectResponse(BaseModel)`: `id: UUID`, `name: str`, `version: str`, `current_epoch: int`, `created_at: datetime`, `updated_at: datetime`; `model_config = ConfigDict(from_attributes=True)` for direct SQLAlchemy conversion
    - `ProjectSummary(BaseModel)`: `id: UUID`, `name: str`, `version: str`, `current_epoch: int`, `created_at: datetime`; also `from_attributes=True`
  - [x] No `Field(alias=...)` anywhere — wire format is snake_case end-to-end per architecture §Format Patterns
- [x] Unit tests
  - [x] `tests/unit/test_project_schemas.py`:
    - `ProjectCreate.model_validate({"name": "X", "version": "1.0"})` succeeds
    - Name/version exceeding max_length raises `ValidationError`
    - `ProjectUpdate.model_validate({})` raises (empty-body rejection)
    - `ProjectResponse.model_validate(project_instance)` round-trips from a SQLAlchemy instance

## Dev Notes

### Contract-shaping story

This is the **first** story in Epic 2 and sets the contract shape every subsequent endpoint (2-2 through 2-5) consumes. Resist the urge to over-spec: follow the architecture's naming conventions, match the migration exactly, and move on.

### Field length limits

PRD doesn't specify max lengths; architecture §API & Communication Patterns doesn't either. Go with `name ≤ 200 chars` and `version ≤ 50 chars` — generous enough for real use, strict enough to reject gibberish. If a downstream story discovers a use case that needs more, bump in a follow-up.

### Empty-body PATCH rejection

Subtle but important: `PATCH /api/v1/projects/:id` with `{}` is ambiguous — did the client intend no-op or forget fields? Reject with 400 / Problem Details so the client gets clear feedback. Story 2-5 depends on this.

### Not in scope

- No API endpoint wiring — that's Stories 2-2 through 2-5.
- No `Feature` schemas — Story 2-6.

### Project Structure Notes

Files:
- Update `kano-backend/src/kano/models/project.py`
- New `kano-backend/src/kano/schemas/__init__.py`, `schemas/project.py`
- `kano-backend/tests/unit/test_project_schemas.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — project columns + constraints
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — Pydantic class naming suffix convention
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] — snake_case end-to-end
- [Source: _bmad-output/planning-artifacts/prd.md#FR1, FR4] — project CRUD contract
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — original AC
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-*.md] — migration 0001 is the schema contract

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/unit/test_project_schemas.py -v` → 13/13 passed
- `poetry run pytest tests/unit -v` → 57/57 passed (no regressions)
- `poetry run ruff check src tests migrations` → clean
- `poetry run black --check src tests migrations` → clean
- `poetry run mypy src tests migrations` → clean
### Completion Notes List
- `Project` model already matched migration 0001 (String(255)/String(64), Uuid PK, TIMESTAMPTZ with onupdate). No drift to fix — left it intact. Pydantic `max_length` (200/50) is intentionally tighter than the DB columns.
- New `src/kano/schemas/__init__.py` exports the four project schemas.
- `ProjectUpdate` empty-body rejection uses a `model_validator(mode="after")` that raises when both `name` and `version` are `None`.
- `ProjectResponse` and `ProjectSummary` use `from_attributes=True` so endpoints can pass SQLAlchemy instances directly.
- Snake_case end-to-end: no `Field(alias=...)` anywhere.
### File List
- `kano-backend/src/kano/schemas/__init__.py` (new)
- `kano-backend/src/kano/schemas/project.py` (new)
- `kano-backend/tests/unit/test_project_schemas.py` (new)
