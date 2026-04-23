# Story 2.7: Feature mutation API with epoch-bump gating

Status: ready-for-dev

## Story

As a PM,
I want to add, edit, and delete features on a project, with epoch bumping automatically when the current epoch has polls,
so that my feature changes never corrupt the data pinned to already-collected polls.

## Acceptance Criteria

1. **Given** a project at `current_epoch = N` with no polls, **when** I `POST /api/v1/projects/:id/features` with `{"name": "SSO", "description": "single sign-on"}`, **then** the response is 201 Created with the new feature; the project stays at epoch N.
2. **Given** the same project now has a poll on epoch N, **when** I `POST /api/v1/projects/:id/features` without the `?acknowledged=true` query flag, **then** the response is 409 Conflict with Problem Details `type=epoch-bump-required`, `detail` explaining that editing will create epoch N+1.
3. **When** I retry the same `POST` with `?acknowledged=true`, **then** the response is 201 Created; the project advances to epoch N+1; epoch N's feature rows are preserved unchanged; the new feature lives on epoch N+1.
4. `PATCH /api/v1/projects/:id/features/:featureKey` with `{"name": "...", "description": "..."}` follows the same gating: in-place on empty epoch; 409 then N+1 on populated epoch.
5. `DELETE /api/v1/projects/:id/features/:featureKey` follows the same gating but soft-deletes: on empty epoch, the feature's `is_active` flips to FALSE; on populated epoch with acknowledgement, the feature is not cloned into epoch N+1 while remaining `is_active=TRUE` in epoch N.
6. All three endpoints route every mutation through `epoch_service.bump_epoch_on_feature_change()` — integration tests assert the service is invoked exactly once per request, with no direct `features` table writes in the blueprint code.
7. All three endpoints are CSRF-protected and documented in `openapi.yaml`.

## Tasks / Subtasks

- [ ] `api/features.py` blueprint with all three endpoints
  - [ ] `features_bp = Blueprint("features", __name__, url_prefix="/api/v1/projects/<uuid:project_id>")`
  - [ ] Every handler reads `acknowledged = request.args.get("acknowledged") == "true"` from the query string
  - [ ] Every handler delegates the mutation to `epoch_service.bump_epoch_on_feature_change(project_id, mutation_fn, acknowledged=acknowledged)`
  - [ ] No direct `db.session.add` / `db.session.commit` in this file for `features` — the service owns the transaction
- [ ] POST handler (AC: #1, #2, #3)
  - [ ] `@features_bp.post("/features")`:
    ```python
    body = FeatureCreate.model_validate(request.get_json())
    def mutation(epoch: int):
        feature = Feature(id=uuid4(), project_id=project_id, epoch=epoch,
                          feature_key=uuid4(), name=body.name, description=body.description)
        db.session.add(feature)
        mutation_context["created_feature"] = feature  # closure access
    mutation_context = {}
    new_epoch = epoch_service.bump_epoch_on_feature_change(
        project_id, mutation, acknowledged=acknowledged)
    return FeatureResponse.model_validate(mutation_context["created_feature"]).model_dump(mode="json"), 201
    ```
- [ ] PATCH handler (AC: #4)
  - [ ] `@features_bp.patch("/features/<uuid:feature_key>")`:
    ```python
    body = FeatureUpdate.model_validate(request.get_json())
    def mutation(epoch: int):
        feature = db.session.execute(
            select(Feature).where(
                Feature.project_id == project_id,
                Feature.epoch == epoch,
                Feature.feature_key == feature_key,
                Feature.is_active == True,
            )
        ).scalar_one_or_none()
        if feature is None:
            raise EntityNotFound("feature", feature_key)
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(feature, field, value)
        mutation_context["updated_feature"] = feature
    # ... same service call, 200 response
    ```
- [ ] DELETE handler — soft delete semantics per AC #5
  - [ ] `@features_bp.delete("/features/<uuid:feature_key>")`:
    - On no-polls branch: the service's `mutation_fn` sets `is_active = FALSE` on the epoch N row
    - On has-polls + acknowledged branch: the service clones active features into N+1; the blueprint's `mutation_fn` for delete must **NOT clone this feature** into N+1. This means the generic `bump_epoch_on_feature_change` contract doesn't support DELETE semantics cleanly (clone-then-mutate produces the wrong result — the feature ends up in N+1 is_active=FALSE, not absent).
    - **Resolution**: add an optional `exclude_feature_keys: set[UUID] | None = None` kwarg to `bump_epoch_on_feature_change`; when cloning, skip feature_keys in the exclude set. DELETE passes `{feature_key}` via this kwarg. Update Story 2-6 if that enhancement wasn't captured there.
    - Return 204 No Content
- [ ] Register blueprint in `create_app()`
- [ ] OpenAPI (AC: #7) — three paths with all status codes
- [ ] Integration tests (AC: #1–6)
  - [ ] Happy path add: no polls → 201, epoch stays at N
  - [ ] Add with polls, no ack → 409 Problem Details (type=epoch-bump-required, `would_be_epoch=N+1`)
  - [ ] Add with polls + ack → 201, project.current_epoch == N+1, epoch-N features unchanged, new feature lives on N+1
  - [ ] PATCH symmetrics
  - [ ] DELETE symmetrics + soft-delete on no-polls branch asserts `is_active=FALSE` on epoch N; DELETE with polls+ack asserts feature is NOT in N+1 set but N rows untouched
  - [ ] **Service-invocation assertion** (AC #6): patch `epoch_service.bump_epoch_on_feature_change` with a spy; each of the 3 endpoints calls it exactly once per request
  - [ ] Invalid body → 400
  - [ ] Non-existent feature_key on PATCH/DELETE → 404
  - [ ] Missing CSRF → 403

## Dev Notes

### DELETE semantics detail

This is the subtle one. Three behaviors to get right:

1. **No polls on epoch N**: `DELETE /features/:key` → row exists with `is_active=FALSE`. Not removed from DB (retains historical reference).
2. **Polls exist on epoch N, no ack**: 409 without any mutation.
3. **Polls exist on epoch N, ack**: epoch N+1 is created, active features are cloned EXCEPT the one being deleted; the deleted feature stays in N with `is_active=TRUE` (because N is frozen — don't retroactively mark inactive); but absent from N+1.

AC #5 wording "on populated epoch with acknowledgement, the feature is not cloned into epoch N+1 while remaining is_active=TRUE in epoch N" confirms behavior #3.

### Service contract enhancement

Story 2-6 defined `bump_epoch_on_feature_change(project_id, mutation_fn, *, acknowledged)`. This story needs an additional kwarg `exclude_feature_keys` for DELETE. Either:

- Update Story 2-6's contract retroactively (preferred — keep the contract coherent), OR
- Add a `pre_clone_hook` callback parameter that returns the feature_keys to exclude.

Go with the first option: add `exclude_feature_keys: set[UUID] | None = None` to Story 2-6's signature before it ships. Document the dependency in PR description.

### Not in scope

- UI for feature editing — Story 2-10.
- EpochBumpDialog / Banner — Story 2-11 (the UI half of FR11).
- Past-epoch feature read — Story 2-8.

### Project Structure Notes

Files:
- `kano-backend/src/kano/api/features.py`
- Register blueprint in `kano-backend/src/kano/__init__.py`
- Extend `kano-backend/openapi.yaml`
- `kano-backend/tests/integration/test_features_api.py`

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR5–11] — feature CRUD + epoch bump on change
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — every mutation routes through epoch_service
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7] — original AC
- [Source: _bmad-output/implementation-artifacts/2-6-feature-model-category-enum-and-epoch-service-centralized-contract.md] — service contract consumed here

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
