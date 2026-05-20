# Story 2.5: Edit project name and version without epoch bump

Status: review

## Story

As a PM,
I want to edit a project's name or version without triggering an epoch bump,
so that typo fixes and rebranding don't corrupt my epoch lineage.

## Acceptance Criteria

1. **Given** a project exists at `current_epoch = N`, **when** I `PATCH /api/v1/projects/:id` with `{"name": "Q3 Prioritization (revised)"}`, **then** the response is 200 with the updated `ProjectResponse`.
2. `current_epoch` is unchanged at `N`.
3. `updated_at` is refreshed.
4. Neither the `features` rows nor any poll row is mutated.
5. The endpoint is CSRF-protected and documented in `openapi.yaml`.

## Tasks / Subtasks

- [x] `services/project_service.py` — `update_project`
  - [x] `def update_project(project_id: UUID, data: ProjectUpdate) -> Project:`
  - [x] Fetch project; raise `EntityNotFound` if absent
  - [x] Apply only the fields that are not None on `data` (Pydantic `exclude_unset` idiom: `data.model_dump(exclude_unset=True)`)
  - [x] `updated_at` is handled by the SQLAlchemy `onupdate=func.now()` from the model
  - [x] `db.session.commit(); return project`
- [x] `api/projects.py` — PATCH handler
  - [x] `@projects_bp.patch("/<uuid:project_id>")` handler
  - [x] `body = ProjectUpdate.model_validate(request.get_json())` — empty body rejected by the `model_validator` on the schema (Story 2-1)
  - [x] CSRF-protected by default
- [x] OpenAPI entry
- [x] Integration tests
  - [x] PATCH name only → name changes, version unchanged, epoch unchanged, updated_at refreshed (> pre-update timestamp)
  - [x] PATCH version only → symmetric
  - [x] PATCH both → both change, epoch unchanged
  - [x] PATCH with empty body → 400 Problem Details
  - [x] PATCH on non-existent UUID → 404
  - [x] **Invariant assertion**: in one of the PATCH tests, pre-seed a feature row and a poll row for the project; assert their byte-identical persistence after the PATCH (SELECTs before/after match exactly)

## Dev Notes

### Why this story is explicit about epoch

FR4 in the PRD: "A PM can edit a project's name and version; these edits do not trigger an epoch bump." This story's acceptance is as much about **what it does NOT do** as what it does. The invariant test in the task list above is the regression guard — if someone later wires `PATCH /projects/:id` through `epoch_service` by mistake, that test fails.

### `exclude_unset` vs `exclude_none`

Use `exclude_unset=True`. Reason: `exclude_none` would drop explicitly-null fields, but `ProjectUpdate` has no nullable semantics — a client setting `{"name": null}` is a validation error (the schema's `str | None = None` accepts absence, not null-as-string). `exclude_unset` correctly models "only update fields the client actually sent."

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/services/project_service.py`
- Extend `kano-backend/src/kano/api/projects.py`
- Extend `kano-backend/openapi.yaml`
- Extend `kano-backend/tests/integration/test_projects_api.py`

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR4] — no epoch bump on name/version edits
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] — original AC

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/integration/test_projects_api.py -v` → 17/17 passed (6 new for PATCH)
- `poetry run pytest` → 101/101 passed
- ruff / mypy → clean
- black auto-formatted the test file once after the PATCH additions (line wrapping in the mappings().one() chains).
### Completion Notes List
- `update_project` uses `data.model_dump(exclude_unset=True)` so absent fields are never written (per story Dev Notes, exclude_unset > exclude_none).
- After commit, `db.session.refresh(project)` reloads `updated_at` (the `onupdate=func.now()` value materializes in Postgres but the in-memory instance doesn't see it until refresh). Without this refresh the response would echo the *pre-update* `updated_at`.
- The invariant test (FR4) seeds 1 feature row + 1 poll row, snapshots them with `SELECT *` into dicts, runs the PATCH, re-reads, and asserts equality. If anyone ever wires PATCH through `epoch_service`, the feature row's epoch or the poll row would change and this test would break loudly.
### File List
- `kano-backend/src/kano/services/project_service.py` (modified — `update_project`)
- `kano-backend/src/kano/api/projects.py` (modified — `PATCH /api/v1/projects/<uuid:project_id>`)
- `kano-backend/openapi.yaml` (modified — `patch` op + `ProjectUpdate` schema)
- `kano-backend/tests/integration/test_projects_api.py` (modified — 6 PATCH tests including invariant snapshot)
