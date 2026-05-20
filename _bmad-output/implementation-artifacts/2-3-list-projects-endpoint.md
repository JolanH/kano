# Story 2.3: List projects endpoint

Status: done

## Story

As a PM,
I want to retrieve the list of every project I have,
so that I can navigate back to any project I've started.

## Acceptance Criteria

1. **Given** any number of projects exist (including zero), **when** I `GET /api/v1/projects`, **then** the response is 200 with a bare JSON array (no wrapping envelope) of `ProjectSummary` items.
2. The list is sorted by `created_at` descending.
3. The response is empty `[]` when no projects exist.
4. The endpoint is documented in `openapi.yaml`.

## Tasks / Subtasks

- [x] `services/project_service.py` — `list_projects` (AC: #1, #2, #3)
  - [x] `def list_projects() -> list[Project]:` — `return db.session.execute(select(Project).order_by(Project.created_at.desc())).scalars().all()`
- [x] Extend `api/projects.py` (AC: #1, #2, #3)
  - [x] `@projects_bp.get("/")` handler:
    - `projects = project_service.list_projects()`
    - `return [ProjectSummary.model_validate(p).model_dump(mode="json") for p in projects], 200`
  - [x] GETs are not CSRF-protected (Flask-WTF default)
- [x] OpenAPI (AC: #4)
  - [x] Extend `/api/v1/projects` path with `get` operation: 200 response type `array` of `ProjectSummary`
- [x] Integration tests
  - [x] `tests/integration/test_projects_api.py::test_list_projects_empty` — no projects; GET returns 200 `[]`
  - [x] `test_list_projects_ordering` — create 3 projects with controlled timestamps (or 50ms sleep between); GET returns them newest-first

## Dev Notes

### No pagination in v1

Architecture §Scaling Strategy (line 455) commits to vertical-only. For an internal tool at ~3 polls/quarter, total project count stays O(tens). If growth surprises us, add `?limit=` / cursor pagination as a v2 concern.

### Wire shape: bare array, no envelope

Architecture §Format Patterns line 708: "list endpoints return a plain JSON array". Do not wrap in `{"data": [...]}`.

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/services/project_service.py`
- Extend `kano-backend/src/kano/api/projects.py`
- Extend `kano-backend/openapi.yaml`
- Extend `kano-backend/tests/integration/test_projects_api.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] — bare array for list endpoints
- [Source: _bmad-output/planning-artifacts/prd.md#FR2] — list all projects
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] — original AC
- [Source: _bmad-output/implementation-artifacts/2-1-project-sqlalchemy-model-and-pydantic-schemas.md] — ProjectSummary schema

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/integration/test_projects_api.py -v` → 7/7 passed
- `poetry run pytest` (full suite) → 91/91 passed
- `poetry run ruff check src tests migrations` → clean
- `poetry run black --check src tests migrations` → clean
- `poetry run mypy src tests migrations` → clean
### Completion Notes List
- Bare-array shape (no envelope) per architecture §Format Patterns.
- Ordering test pins `created_at` via direct SQL UPDATE after the three POSTs so the assertion does not depend on `transaction_timestamp()` resolution within rapid-fire transactions. (Made deterministic 2026-05-20; original test relied on `now()` per-transaction values which would collide if Postgres' transaction clock didn't advance between two POSTs on a fast machine.)
- `ProjectSummary` projection omits `updated_at` — the test pins that exact key set.
### File List
- `kano-backend/src/kano/services/project_service.py` (modified — `list_projects`)
- `kano-backend/src/kano/api/projects.py` (modified — `GET /api/v1/projects/`)
- `kano-backend/openapi.yaml` (modified — `get` op + `ProjectSummary` schema)
- `kano-backend/tests/integration/test_projects_api.py` (modified — 3 list tests)
