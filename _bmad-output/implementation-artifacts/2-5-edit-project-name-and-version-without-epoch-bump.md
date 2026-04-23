# Story 2.5: Edit project name and version without epoch bump

Status: ready-for-dev

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

- [ ] `services/project_service.py` — `update_project`
  - [ ] `def update_project(project_id: UUID, data: ProjectUpdate) -> Project:`
  - [ ] Fetch project; raise `EntityNotFound` if absent
  - [ ] Apply only the fields that are not None on `data` (Pydantic `exclude_unset` idiom: `data.model_dump(exclude_unset=True)`)
  - [ ] `updated_at` is handled by the SQLAlchemy `onupdate=func.now()` from the model
  - [ ] `db.session.commit(); return project`
- [ ] `api/projects.py` — PATCH handler
  - [ ] `@projects_bp.patch("/<uuid:project_id>")` handler
  - [ ] `body = ProjectUpdate.model_validate(request.get_json())` — empty body rejected by the `model_validator` on the schema (Story 2-1)
  - [ ] CSRF-protected by default
- [ ] OpenAPI entry
- [ ] Integration tests
  - [ ] PATCH name only → name changes, version unchanged, epoch unchanged, updated_at refreshed (> pre-update timestamp)
  - [ ] PATCH version only → symmetric
  - [ ] PATCH both → both change, epoch unchanged
  - [ ] PATCH with empty body → 400 Problem Details
  - [ ] PATCH on non-existent UUID → 404
  - [ ] **Invariant assertion**: in one of the PATCH tests, pre-seed a feature row and a poll row for the project; assert their byte-identical persistence after the PATCH (SELECTs before/after match exactly)

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
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
