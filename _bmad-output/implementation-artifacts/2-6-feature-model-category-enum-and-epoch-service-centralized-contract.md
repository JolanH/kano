# Story 2.6: Feature model, Category enum, and epoch_service centralized contract

Status: done

## Story

As a solo dev,
I want the `Feature` model, the `Category` enum, and `services/epoch_service.py` exposing `get_current_epoch(project_id)` and `bump_epoch_on_feature_change(project_id, mutation_fn, *, acknowledged, exclude_feature_keys=None)`,
so that every feature mutation endpoint downstream routes through a single contract that guarantees epoch invariants.

## Acceptance Criteria

1. **Given** `services/epoch_service.bump_epoch_on_feature_change()` is invoked, **when** the current epoch has zero polls, **then** `mutation_fn` is applied directly to the current epoch's feature rows without bumping.
2. **Given** the current epoch has at least one poll, **when** `bump_epoch_on_feature_change` is invoked with `acknowledged=False`, **then** the function raises `EpochBumpRequired` (mapped to HTTP 409 by `api/errors.py`) without any mutation occurring.
3. **Given** the current epoch has at least one poll, **when** `bump_epoch_on_feature_change` is invoked with `acknowledged=True`, **then** in a single transaction: all currently-active features from epoch N (minus any feature_keys passed in `exclude_feature_keys`) are cloned into epoch N+1 with the same `feature_key`s and `is_active=TRUE`; `mutation_fn` is applied to the epoch N+1 rows; `projects.current_epoch` is updated to N+1; epoch N's feature rows are left at row-level column equality (every column on every epoch-N row matches the pre-bump snapshot value, regardless of `exclude_feature_keys`).
4. A parametrized pytest fixture tests the full bump matrix: add/edit/delete × (no polls, has polls, acknowledged, not acknowledged) with correct epoch-N invariance assertions.
5. `tests/unit/test_epoch_service.py` asserts that after a bump, epoch-N feature rows match a pre-bump snapshot at the column level: every column (id, feature_key, name, description, is_active, created_at, epoch) on every epoch-N row equals the pre-bump value, verified by row-wise equality of `SELECT * FROM features WHERE epoch=N ORDER BY id` between pre- and post-bump snapshots.
6. `src/kano/models/feature.py` exposes the SQLAlchemy `Feature` model mapping to the `features` table from migration 0001.
7. `src/kano/models/response.py` defines `Category` as a Python enum with members `MANDATORY`, `LINEAR`, `EXCITER`, `INDIFFERENT`, `CONTRADICTORY`, `DOUBTFUL` whose values match the `CHAR(1)` CHECK constraint from migration 0001.

## Tasks / Subtasks

- [x] `models/feature.py` (AC: #6)
  - [x] `class Feature(Base):` with typed columns: `id` UUID PK default=uuid4, `project_id` FK → projects(id), `epoch: int`, `feature_key: UUID default=uuid4` (stable across epochs), `name`, `description`, `is_active: bool default=True`, `created_at TIMESTAMPTZ`
  - [x] `__table_args__ = (UniqueConstraint("project_id", "epoch", "feature_key"),)`
  - [x] Validate against migration 0001 — no drift
- [x] `models/response.py` — Category enum (AC: #7)
  - [x] `class Category(str, Enum): MANDATORY = "M"; LINEAR = "L"; EXCITER = "E"; INDIFFERENT = "I"; CONTRADICTORY = "C"; DOUBTFUL = "D"`
  - [x] **Note**: a parallel `Category` enum also exists in `services/kano_matrix.py` (Story 1-5). These are intentionally duplicated — one represents the persistence layer's domain, the other the pure-function domain. They must stay in sync; cross-reference test: `assert set(models.Category) == set(services.kano_matrix.Category)` at the value level. Consider consolidating into `src/kano/domain.py` in a follow-up if the duplication becomes painful; out of scope for v1.
  - [x] Placeholder `Response` model stub may be extended here or in Epic 4 — at minimum, define the `Category` enum so features can reference the value set
- [x] `schemas/feature.py`
  - [x] `FeatureCreate(name: str, description: str | None)`, `FeatureUpdate(name | description optional)`, `FeatureResponse(id, feature_key, name, description, is_active, created_at, epoch)`, `FeatureSummary(id, feature_key, name, description, created_at)` (used by `ProjectDetailResponse` in Story 2-4)
  - [x] Max lengths: `name ≤ 200`, `description ≤ 2000`
- [x] `services/epoch_service.py` (AC: #1, #2, #3)
  - [x] `def get_current_epoch(project_id: UUID) -> int:` — reads `project.current_epoch`; raises `EntityNotFound` if project missing
  - [x] `def _has_polls_for_epoch(project_id: UUID, epoch: int) -> bool:` — private helper
  - [x] `def bump_epoch_on_feature_change(project_id: UUID, mutation_fn: Callable[[int], None], *, acknowledged: bool, exclude_feature_keys: frozenset[UUID] | None = None) -> int:`
    - Load project row (for update, `with_for_update()` to prevent concurrent bumps — even at the PRD's expected low concurrency, belt-and-braces for correctness)
    - `n = project.current_epoch`
    - `has_polls = self._has_polls_for_epoch(project_id, n)`
    - **Branch A** (no polls): `mutation_fn(epoch=n); db.session.commit(); return n`
    - **Branch B** (has polls, not acknowledged): `raise EpochBumpRequired(project_id=project_id, current_epoch=n, would_be_epoch=n+1)`
    - **Branch C** (has polls, acknowledged): all in one transaction:
      1. `SELECT * FROM features WHERE project_id = :id AND epoch = :n AND is_active = TRUE` → for each active feature whose `feature_key` is NOT in `exclude_feature_keys`, `INSERT INTO features (id=uuid4(), project_id=:id, epoch=:n+1, feature_key=src.feature_key, name=src.name, description=src.description, is_active=TRUE, created_at=now())`. The exclusion is the DELETE-on-Branch-C primitive consumed by Story 2-7.
      2. `UPDATE projects SET current_epoch = :n+1 WHERE id = :id`
      3. Invoke `mutation_fn(epoch=n+1)` — caller's mutation applied to the newly-created N+1 rows
      4. `db.session.commit()`
      5. `return n + 1`
  - [x] `mutation_fn` signature: takes `epoch: int` kwarg, returns None; caller owns the specific add/edit/delete SQL; this service owns the transaction boundary and the epoch decision
  - [x] Exception `EpochBumpRequired` (defined in `exceptions.py` Story 1-3; extend with `project_id`, `current_epoch`, `would_be_epoch` attributes for the 409 Problem Details body)
- [x] Tests (AC: #4, #5)
  - [x] `tests/unit/test_epoch_service.py`:
    - Parametrized matrix: mutation ∈ {add, edit, delete} × poll_state ∈ {none, one} × acknowledged ∈ {True, False} — 12 cases
    - For each: pre-seed the state, call `bump_epoch_on_feature_change`, assert the expected outcome
    - **Byte-identity snapshot** for epoch N after a bump: `SELECT * FROM features WHERE project_id = :id AND epoch = :n ORDER BY id` both pre- and post-bump; assert row-wise equality (id, feature_key, name, description, is_active, created_at, epoch all unchanged)
  - [x] `tests/integration/test_epoch_service.py` if any test needs real Postgres (CHECK constraints, UNIQUE indexes) — unit-level can use sqlite-in-memory if all invariants express in Alchemy Core; prefer Postgres for confidence

## Dev Notes

### Why this story is Epic 2's keystone

PRD Risk Mitigation Strategy (lines 310–311) names **epoch isolation drift** as a top data-model risk. The centralized `bump_epoch_on_feature_change()` + single mutation path + CI-enforced test suite is the mitigation. Every feature endpoint (Story 2-7) routes through this contract; the architecture §Enforcement Guidelines (line 744) makes bypassing it a code-review rejection.

### The `with_for_update` lock

Rationale: two concurrent feature-edit requests on the same project could both read `current_epoch = N`, both branch to "clone into N+1", both attempt to create duplicate epoch-N+1 rows. `with_for_update()` on the `projects` row serializes these. Not theoretical — once a PR template is filled in by Paola and a CI test runs against the same project, the race is reproducible.

### `exclude_feature_keys` kwarg

Added to support DELETE-on-Branch-C semantics from Story 2-7: when a feature is being deleted on a populated epoch with acknowledgement, the row must be excluded from the clone (so it never reaches epoch N+1) while staying byte-identical in epoch N (because epoch N is frozen). Without this kwarg, a delete would either (a) be cloned then marked `is_active=FALSE` in N+1 (wrong — the row should be absent, not soft-deleted), or (b) require ad-hoc post-clone cleanup that bypasses the transaction boundary. The kwarg keeps DELETE inside the same single-transaction Branch-C path as add/edit. `None` (default) is equivalent to `frozenset()` — clone everything active.

### Audit of callers (2026-05-20 sweep)

`EpochBumpRequired` is constructed in two places besides `epoch_service.bump_epoch_on_feature_change` itself: `tests/unit/test_epoch_service.py::test_epoch_bump_required_carries_extra_fields_for_problem_details` and `tests/integration/test_problem_details.py`. Both use the keyword-only signature (`project_id=`, `current_epoch=`, `would_be_epoch=`, optional `detail=`). No positional-argument callers remain. The `cast(Any, ...)` linters and `app.register_error_handler` lookup paths reference the class itself, not its constructor. Safe to keep the keyword-only signature.

### `mutation_fn` contract

Design intent: the service owns the epoch branch + transaction; the caller (feature blueprint in Story 2-7) owns the specific mutation semantics (add vs edit vs delete). Callback is cleaner than duplicating branching logic in every blueprint handler.

```python
# In api/features.py (Story 2-7):
def create_feature(project_id, data, acknowledged):
    def mutation(epoch: int):
        feature = Feature(id=uuid4(), project_id=project_id, epoch=epoch,
                          feature_key=uuid4(), name=data.name, description=data.description)
        db.session.add(feature)
    new_epoch = epoch_service.bump_epoch_on_feature_change(
        project_id, mutation, acknowledged=acknowledged)
    return feature, new_epoch
```

### Category enum duplication

Two places hold the 6-value enum:
1. `src/kano/services/kano_matrix.py` (Story 1-5) — the **pure-function** domain; zero deps
2. `src/kano/models/response.py` (this story) — the **persistence** domain; SQLAlchemy-aware

Do not try to unify in v1 — purity of 1-5's module is load-bearing for test isolation. Cross-check via a test in `test_epoch_service.py`:

```python
from kano.models.response import Category as ModelCategory
from kano.services.kano_matrix import Category as ServiceCategory
def test_category_enum_sync():
    assert {c.value for c in ModelCategory} == {c.value for c in ServiceCategory}
```

### Not in scope

- Actual feature endpoints (POST/PATCH/DELETE) — Story 2-7.
- Project/feature UI — Stories 2-9, 2-10.
- Response model beyond the `Category` enum — Epic 4.

### Project Structure Notes

Files:
- `kano-backend/src/kano/models/feature.py`
- Extend `kano-backend/src/kano/models/response.py` (or create if absent)
- `kano-backend/src/kano/schemas/feature.py`
- `kano-backend/src/kano/services/epoch_service.py`
- Extend `kano-backend/src/kano/exceptions.py` (add `project_id`, `current_epoch`, `would_be_epoch` to `EpochBumpRequired`)
- `kano-backend/tests/unit/test_epoch_service.py`
- `kano-backend/tests/integration/test_epoch_service.py` (optional but recommended)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — feature schema + constraints
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting Concerns] — epoch-invariant enforcement as load-bearing (line 73)
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — centralized bump_epoch_on_feature_change (line 744)
- [Source: _bmad-output/planning-artifacts/prd.md#FR8–12] — epoch integrity requirements
- [Source: _bmad-output/planning-artifacts/prd.md#Risk Mitigation Strategy] — epoch isolation drift as top risk (line 310)
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Success] — coverage gates on epoch_service (≥85% line, 100% branch)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6] — original AC
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-*.md] — features table contract
- [Source: _bmad-output/implementation-artifacts/1-5-kano-categorization-matrix-*.md] — sibling Category enum (pure-function domain)

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `poetry run pytest tests/unit/test_epoch_service.py tests/integration/test_epoch_service.py -v` → 12/12 passed
- `poetry run pytest` → 113/113 passed
- `poetry run ruff check src tests migrations` → clean (after combining nested `with` + dropping stray `datetime` import)
- `poetry run black src tests migrations` → applied (2 files reformatted)
- `poetry run mypy src tests migrations` → clean
### Completion Notes List
- `Feature` model already existed from Story 1-2 with the exact shape this story specifies (UniqueConstraint on `(project_id, epoch, feature_key)` + Index on `(project_id, epoch)`). No drift; left untouched.
- Added persistence-domain `Category` enum to `models/response.py`. Story-pinned parity test in `tests/unit/test_epoch_service.py` verifies `{c.value for c in ModelCategory} == {c.value for c in MatrixCategory}` AND `{c.name ...} == {c.name ...}`. There's already a *migration-vs-MatrixCategory* parity test in `test_category_check_parity.py`; the two together transitively pin all three representations to the same six letters.
- `EpochBumpRequired` now takes kwargs `project_id`, `current_epoch`, `would_be_epoch`, plus optional `detail`. The default message includes both epoch numbers so logs can grep them. **Breaking** the old positional signature: I updated the existing `test_problem_details.py` test in the same commit to use the kwargs form and to assert the three enriched fields land in the Problem Details body.
- Custom handler `_epoch_bump_handler` registered in `api/errors.py` injects `project_id`, `current_epoch`, `would_be_epoch` into the response JSON so the PM SPA's two-register dialog (Story 2-11) has what it needs. Other domain exceptions still use the generic `_kano_error_handler`.
- `epoch_service` uses `SELECT ... FOR UPDATE` on the project row to serialize concurrent bumps. The `_clone_active_features` helper `flush()`-es the insert batch before `mutation_fn` runs so the caller's UPDATE/DELETE statements can find the newly-cloned epoch-N+1 rows.
- 12-cell behavioral matrix lives in `tests/integration/test_epoch_service.py` (Branch A × {add, edit, delete} × {ack=False/True}, Branch B × {add, edit, delete}, Branch C × {add, edit, delete}). Each Branch-C test asserts byte-identity of the epoch-N snapshot pre- and post-bump via `_snapshot_features` reading every column ordered by id.
- `schemas/feature.py` exports `FeatureCreate`, `FeatureUpdate`, `FeatureResponse`, `FeatureSummary`. (`FeatureSummary` lived in `schemas/project.py` initially per Story 2-4 and was relocated to its canonical home in `schemas/feature.py` on 2026-05-20 — consumers import everything from `kano.schemas`.)
### File List
- `kano-backend/src/kano/models/response.py` (modified — `Category` enum)
- `kano-backend/src/kano/schemas/feature.py` (new — `FeatureCreate`, `FeatureUpdate`, `FeatureResponse`)
- `kano-backend/src/kano/schemas/__init__.py` (modified — new exports)
- `kano-backend/src/kano/services/epoch_service.py` (new — full contract)
- `kano-backend/src/kano/exceptions.py` (modified — `EpochBumpRequired` carries `project_id`/`current_epoch`/`would_be_epoch`)
- `kano-backend/src/kano/api/errors.py` (modified — `_epoch_bump_handler` injects the three fields)
- `kano-backend/tests/unit/test_epoch_service.py` (new — enum parity + exception field guards)
- `kano-backend/tests/integration/test_epoch_service.py` (new — 12-cell behavioral matrix)
- `kano-backend/tests/integration/test_problem_details.py` (modified — updated to new `EpochBumpRequired` signature, asserts enriched fields)
