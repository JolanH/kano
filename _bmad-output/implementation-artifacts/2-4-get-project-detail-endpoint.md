# Story 2.4: Get project detail endpoint

Status: ready-for-dev

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

- [ ] Extend `schemas/project.py` with the detail response
  - [ ] `FeatureSummary(BaseModel)` — this lives in `schemas/feature.py` (created in Story 2-6); if 2-6 hasn't merged, inline a local copy here and refactor on 2-6 landing
  - [ ] `ProjectDetailResponse(ProjectResponse)` — extends `ProjectResponse` with `active_features: list[FeatureSummary]`
- [ ] `services/project_service.py` — `get_project_detail`
  - [ ] `def get_project_detail(project_id: UUID) -> Project:` — fetch project; raise `EntityNotFound` if absent
  - [ ] Loading strategy: eager-load active features for current_epoch via `selectinload` or a second query filtered on `epoch == project.current_epoch AND is_active == True`, ordered by `Feature.created_at.asc()`
- [ ] `api/projects.py` — handler (AC: #1, #3)
  - [ ] `@projects_bp.get("/<uuid:project_id>")` handler
  - [ ] `EntityNotFound` → 404 with `type=entity-not-found` (registered in `api/errors.py` per Story 1-3)
- [ ] OpenAPI (AC: #4)
- [ ] Integration tests
  - [ ] Happy path: project with 0 features, 1 feature, 3 features (ordering preserved); inactive features NOT in response; past-epoch features NOT in response
  - [ ] 404 on random UUID
  - [ ] 404 on malformed UUID string (Flask's `<uuid:>` converter rejects at routing — verify the error is a Problem Details 404, not the raw Flask 404)

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
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
