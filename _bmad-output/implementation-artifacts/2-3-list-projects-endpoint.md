# Story 2.3: List projects endpoint

Status: ready-for-dev

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

- [ ] `services/project_service.py` — `list_projects` (AC: #1, #2, #3)
  - [ ] `def list_projects() -> list[Project]:` — `return db.session.execute(select(Project).order_by(Project.created_at.desc())).scalars().all()`
- [ ] Extend `api/projects.py` (AC: #1, #2, #3)
  - [ ] `@projects_bp.get("/")` handler:
    - `projects = project_service.list_projects()`
    - `return [ProjectSummary.model_validate(p).model_dump(mode="json") for p in projects], 200`
  - [ ] GETs are not CSRF-protected (Flask-WTF default)
- [ ] OpenAPI (AC: #4)
  - [ ] Extend `/api/v1/projects` path with `get` operation: 200 response type `array` of `ProjectSummary`
- [ ] Integration tests
  - [ ] `tests/integration/test_projects_api.py::test_list_projects_empty` — no projects; GET returns 200 `[]`
  - [ ] `test_list_projects_ordering` — create 3 projects with controlled timestamps (or 50ms sleep between); GET returns them newest-first

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
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
