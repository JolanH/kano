# Story 2.8: Past-epoch feature-set read endpoint

Status: review

## Story

As a PM,
I want to retrieve the feature list of any historical epoch of a project,
so that I can reconstruct exactly what a prior poll's respondents saw.

## Acceptance Criteria

1. **Given** a project that has advanced through multiple epochs, **when** I `GET /api/v1/projects/:id/epochs/:epoch/features`, **then** the response is 200 with an array of features where `project_id = :id AND epoch = :epoch`, ordered by `created_at` ascending.
2. The response includes soft-deleted features from that epoch (rows where `is_active=FALSE`).
3. Requesting an epoch number that doesn't exist for this project returns 404 with Problem Details.
4. The endpoint is documented in `openapi.yaml`.

## Tasks / Subtasks

- [x] `services/feature_service.py` (new module) — `list_features_for_epoch`
  - [x] `def list_features_for_epoch(project_id: UUID, epoch: int) -> list[Feature]:`
    - Verify project exists (raise `EntityNotFound` if not)
    - Verify the epoch has at least one row in features for this project; if zero rows exist, raise `EntityNotFound` (the epoch number is invalid for this project)
    - Return all rows for `(project_id, epoch)` ordered by `created_at.asc()` — no `is_active` filter
- [x] Extend `api/features.py` (Story 2-7's file) with the past-epoch read
  - [x] `@features_bp.get("/epochs/<int:epoch>/features")` handler; returns array of `FeatureResponse`
  - [x] Not CSRF-protected (GET)
- [x] OpenAPI entry
- [x] Integration tests
  - [x] Multi-epoch: seed project at epoch 3; verify GET for epoch 1, 2, 3 returns the right frozen set (including soft-deleted features in past epochs)
  - [x] GET for epoch 99 on a project whose current_epoch is 3 → 404
  - [x] GET for epoch 1 on a non-existent project UUID → 404
  - [x] Validate ordering by `created_at` ascending (distinct from `GET /projects/:id` which is same within an epoch — verify semantics consistent)

## Dev Notes

### Why this endpoint exists

FR12: "A PM can view the feature list of any past epoch of a project." The `<EpochSelector>` (Story 2-12) consumes this endpoint when the user navigates to a prior epoch. Epic 5's analysis page also uses the poll's pinned epoch to render the frozen feature list.

### Include soft-deleted features

Unlike `GET /projects/:id` which filters on `is_active=TRUE`, past-epoch reads include every row — including features that were active when the epoch froze but have since been excluded from later epochs. This is the "reconstruction" use case: what did the respondents see?

### Not in scope

- Per-feature drill-down to show "when was this feature last changed" — not required; the row's `created_at` is enough.
- Cross-epoch diff view — post-MVP (Growth Features).

### Project Structure Notes

Files:
- `kano-backend/src/kano/services/feature_service.py`
- Extend `kano-backend/src/kano/api/features.py`
- Extend `kano-backend/openapi.yaml`
- Extend `kano-backend/tests/integration/test_features_api.py`

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR12] — view past epoch features
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8] — original AC

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/integration/test_features_api.py::TestListFeaturesAtEpoch -v` → 4/4 passed
- `poetry run pytest` → 134/134 passed
- ruff/black/mypy → clean
### Completion Notes List
- `list_features_for_epoch` does two queries: (1) project-existence via `SELECT EXISTS(...)`, (2) the feature rows. The project-exists probe makes the "no project" vs "wrong epoch" error message distinct in logs even though both surface as 404 to the client.
- Multi-epoch test asserts the subtle filter behavior: soft-deleted features stay in their original epoch (visible here) but are NOT cloned forward by `epoch_service` — the active-only filter in `_clone_active_features` is what keeps the lineage clean.
### File List
- `kano-backend/src/kano/services/feature_service.py` (new — `list_features_for_epoch`)
- `kano-backend/src/kano/api/features.py` (modified — `GET /epochs/:epoch/features`)
- `kano-backend/openapi.yaml` (modified — new path)
- `kano-backend/tests/integration/test_features_api.py` (modified — 4 new tests under `TestListFeaturesAtEpoch`)
