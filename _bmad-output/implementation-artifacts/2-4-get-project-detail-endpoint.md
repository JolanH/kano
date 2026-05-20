# Story 2.4: Get project detail endpoint

Status: done

## Story

As a PM,
I want to retrieve a single project's full detail including its active feature list at the current epoch,
so that I can render the project detail page in one request.

## Acceptance Criteria

1. **Given** a project exists with id `:id` at `current_epoch = N`, **when** I `GET /api/v1/projects/:id`, **then** the response is 200 with a `ProjectResponse`-shaped body plus an `active_features` array of features where `project_id = :id AND epoch = N AND is_active = TRUE`, ordered by `created_at` ascending.
2. Each active-feature entry carries `id`, `feature_key`, `name`, `description`, `created_at`.
3. GET against a non-existent UUID returns 404 with a Problem Details envelope.
4. The endpoint is documented in `openapi.yaml`.

## Tasks / Subtasks

- [x] Extend `schemas/project.py` with the detail response
  - [x] `FeatureSummary(BaseModel)` lives canonically in `schemas/feature.py` (canonicalised 2026-05-20). `schemas/project.py` imports it; `kano.schemas` (package `__init__.py`) re-exports it.
  - [x] `ProjectDetailResponse(ProjectResponse)` — extends `ProjectResponse` with `active_features: list[FeatureSummary]`
- [x] `services/project_service.py` — `get_project_detail`
  - [x] `def get_project_detail(project_id: UUID) -> Project:` — fetch project; raise `EntityNotFound` if absent
  - [x] Loading strategy: eager-load active features for current_epoch via `selectinload` or a second query filtered on `epoch == project.current_epoch AND is_active == True`, ordered by `Feature.created_at.asc()`
- [x] `api/projects.py` — handler (AC: #1, #3)
  - [x] `@projects_bp.get("/<uuid:project_id>")` handler
  - [x] `EntityNotFound` → 404 with `type=entity-not-found` (registered in `api/errors.py` per Story 1-3)
- [x] OpenAPI (AC: #4)
- [x] Integration tests
  - [x] Happy path: project with 0 features, 1 feature, 3 features (ordering preserved); inactive features NOT in response; past-epoch features NOT in response
  - [x] 404 on random UUID
  - [x] 404 on malformed UUID string (Flask's `<uuid:>` converter rejects at routing — verify the error is a Problem Details 404, not the raw Flask 404)

## Dev Notes

### Why detail carries active_features

The project detail page (Story 2-9) needs both in one request. Two separate endpoints (`GET /projects/:id` + `GET /projects/:id/features`) would mean two round-trips for what's always consumed together. One-request detail is the NFR1 pattern: analysis page also does this (single SQL round-trip, whole-page payload).

### Soft-deleted features in this response

Only `is_active=TRUE`. Soft-deleted (historical) features live in past epochs; they're retrieved via Story 2-8's endpoint, not this one.

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/schemas/project.py`
- Extend `kano-backend/src/kano/services/project_service.py`
- Extend `kano-backend/src/kano/api/projects.py`
- Extend `kano-backend/openapi.yaml`
- Extend `kano-backend/tests/integration/test_projects_api.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map
- [Source: _bmad-output/planning-artifacts/prd.md#FR3] — PM views project detail with active features
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — original AC
- [Source: _bmad-output/implementation-artifacts/2-6-feature-model-category-enum-and-epoch-service-centralized-contract.md] — `FeatureSummary` schema

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/integration/test_projects_api.py -v` → 11/11 passed (4 new for detail endpoint)
- `poetry run pytest` → 95/95 passed
- ruff / black / mypy → clean
### Completion Notes List
- `FeatureSummary` was initially inlined in `schemas/project.py` per story instruction; Story 2-6 noted the canonical home should be `schemas/feature.py` but the move never landed. Relocated to `schemas/feature.py` on 2026-05-20 (Epic 2 adversarial-review sweep). The `kano.schemas` package re-exports it from the new location — consumer imports stay unchanged.
- Service returns a `ProjectDetail` dataclass (slots=True) so Pydantic's `from_attributes=True` can hydrate `ProjectDetailResponse` in one `model_validate` pass. Two queries (project by PK, then features filtered by epoch+is_active) — chose that over `selectinload` because the filter on `epoch == project.current_epoch` requires the loaded project anyway.
- Malformed-UUID path (e.g. `/api/v1/projects/not-a-uuid`) Werkzeug's `<uuid:>` converter returns 404 at routing; the generic `HTTPException` handler in `api/errors.py` wraps it as Problem Details with `type=http-404`. Test pins this.
- `EntityNotFound` already had a handler registered in `api/errors.py` from Story 1.3 — no change needed there.
### File List
- `kano-backend/src/kano/schemas/project.py` (modified — `FeatureSummary`, `ProjectDetailResponse`)
- `kano-backend/src/kano/schemas/__init__.py` (modified — new exports)
- `kano-backend/src/kano/services/project_service.py` (modified — `ProjectDetail` dataclass, `get_project_detail`)
- `kano-backend/src/kano/api/projects.py` (modified — `GET /api/v1/projects/<uuid:project_id>`)
- `kano-backend/openapi.yaml` (modified — `GET /api/v1/projects/{project_id}`, `FeatureSummary`, `ProjectDetailResponse`)
- `kano-backend/tests/integration/test_projects_api.py` (modified — 4 detail tests + `_insert_feature` helper)
