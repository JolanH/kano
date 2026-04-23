# Story 1.5: Kano categorization matrix pure-function module with 25-cell parametrized test

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want `services/kano_matrix.py` exposing `compute_category(fq, dq) -> Category` with the full 25-cell Kano decision matrix frozen against the spec,
so that the single most load-bearing correctness invariant in the product (FR28) is tested and immutable from commit #1.

## Acceptance Criteria

1. **Given** `services/kano_matrix.compute_category(fq, dq)` is invoked, **when** `fq` and `dq` are integers in 1..5, **then** the returned value is exactly one of `Category.MANDATORY`, `LINEAR`, `EXCITER`, `INDIFFERENT`, `CONTRADICTORY`, `DOUBTFUL` per the Kano decision matrix in the initial specification.
2. `tests/unit/test_kano_matrix.py` uses `pytest.mark.parametrize` to cover all 25 `(fq, dq)` combinations with expected category assertions.
3. Invoking `compute_category` with any argument outside 1..5 raises `ValueError`.
4. The module has zero imports from `models/`, `api/`, or any Flask/SQLAlchemy symbol — it is a pure function dependent only on the `Category` enum.

## Tasks / Subtasks

- [ ] Source the authoritative 25-cell matrix from `initial-specification.md` (AC: #1, #2)
  - [ ] Read `/home/tixeo/Projects/perso/kano/initial-specification.md` and locate the Kano classification table
  - [ ] Transcribe the 25 cells into a lookup structure (dict keyed by `(fq, dq)` tuple); cross-verify against a published Kano reference (Kano et al. 1984, "Attractive Quality and Must-Be Quality") if the spec is ambiguous on any cell
- [ ] Define `Category` enum in `src/kano/services/kano_matrix.py` (AC: #1, #4)
  - [ ] `from enum import Enum`
  - [ ] `class Category(str, Enum): MANDATORY = "M"; LINEAR = "L"; EXCITER = "E"; INDIFFERENT = "I"; CONTRADICTORY = "C"; DOUBTFUL = "D"` (str-enum so `.value` matches the DB `CHAR(1)` domain from Story 1.2)
- [ ] Implement `compute_category(fq: int, dq: int) -> Category` (AC: #1, #3)
  - [ ] Validate: `if not (1 <= fq <= 5 and 1 <= dq <= 5): raise ValueError(f"fq and dq must be in 1..5, got fq={fq}, dq={dq}")`
  - [ ] Lookup: `return _MATRIX[(fq, dq)]`
  - [ ] Module-level `_MATRIX: dict[tuple[int, int], Category]` with all 25 entries
- [ ] Enforce purity (AC: #4)
  - [ ] Top of file comment: "PURE FUNCTION. No imports from kano.models, kano.api, flask, sqlalchemy. Depends only on stdlib `enum` and `Category`."
  - [ ] Linter-enforceable: add a `mypy` / `ruff` check or a separate unit test that asserts `import kano.services.kano_matrix` does not load `flask` or `sqlalchemy` (inspect `sys.modules` before and after)
- [ ] Parametrized test: all 25 cells (AC: #2)
  - [ ] `tests/unit/test_kano_matrix.py`:
    - Build a 5×5 expected-category grid matching the spec (literal, not derived from `_MATRIX` — these are **independent assertions**; otherwise the test is tautological)
    - `@pytest.mark.parametrize("fq, dq, expected", [(1, 1, Category.DOUBTFUL), ...25 entries...])`
    - One test function: `def test_cell(fq, dq, expected): assert compute_category(fq, dq) == expected`
  - [ ] Boundary tests: `compute_category(0, 3)`, `compute_category(6, 3)`, `compute_category(3, -1)`, `compute_category(3, 6)` all raise `ValueError`
  - [ ] Purity test: `test_module_is_pure` — assert no `flask` / `sqlalchemy` modules loaded after import
- [ ] Coverage gate: 100% branch coverage on this module per PRD Technical Success criteria (pytest-cov configured in Story 1.1)

## Dev Notes

### Why this story exists early in Epic 1

The Kano matrix is FR28 — the "most load-bearing correctness invariant." If the matrix is wrong, every analysis page in the product is silently wrong. PRD risk register (line 319) names this as a top technical risk; mitigation is "table-driven unit tests, one per cell; freeze matrix as a typed fixture; seeded parity test against the spec."

This story lands **before** the API blueprint that uses it (Epic 4 Story 4-2 `record_full_submission`), so the matrix is already frozen and tested when submission logic is written.

### The 25 cells

The Kano functional/dysfunctional decision matrix (1=I'd love it → 5=would dislike it, or "like → dislike" axis — confirm axis direction against `initial-specification.md`). Standard Kano classification:

| FQ \ DQ | 1 (love) | 2 (like) | 3 (neutral) | 4 (can live) | 5 (dislike) |
|---|---|---|---|---|---|
| **1 (love)** | D | E | E | E | L |
| **2 (like)** | C | I | I | I | M |
| **3 (neutral)** | C | I | I | I | M |
| **4 (can live)** | C | I | I | I | M |
| **5 (dislike)** | C | C | C | C | D |

Legend: M = Mandatory / Must-have, L = Linear / Performance, E = Exciter / Delighter, I = Indifferent, C = Contradictory / Reverse, D = Doubtful / Questionable.

**Authoritative source**: `initial-specification.md` in the repo root. **Cross-check** against the grid above; if they disagree, the `initial-specification.md` wins (PRD is downstream of it). Flag any discrepancy in the PR description.

### Purity enforcement (AC #4 is load-bearing)

The reason this module can be tested in isolation — and the reason it can land in Epic 1 before any persistence — is that it is a pure function. Architecture §Naming Patterns line 546 mandates "Service modules: verb-first function names, no classes unless state is required". `compute_category` fits perfectly.

Do **not** import from `kano.models.response` (the DB-side `Category` constraint uses the same letters — duplicate the enum here; they are two separate representations of the same domain).

### Status codes / errors

`ValueError` is the right exception. When this function is invoked from the submission endpoint (Story 4-3), Pydantic validation will reject out-of-range answers before they reach here — so raising `ValueError` here is a defense-in-depth backstop, not the primary gate.

### Not in scope

- No API endpoint — category computation is called from `poll_service.record_full_submission` in Epic 4.
- No DB integration — `response.category` is written with the `.value` of the returned `Category`.
- No category-name localization — human-readable names live in the frontend copy deck (Story 1.7).

### Testing standards

- Pure unit test; no fixtures, no DB, no Flask client.
- Place under `tests/unit/` (architecture §Test organization, line 1122).
- Coverage target: 100% line AND 100% branch for this module (PRD Technical Success line 95). The parametrize-25-cells pattern plus the four out-of-range tests plus the purity test should trivially hit 100%.

### Project Structure Notes

Files created:
- `kano-backend/src/kano/services/__init__.py` (if not yet created)
- `kano-backend/src/kano/services/kano_matrix.py`
- `kano-backend/tests/unit/__init__.py` (if not yet created)
- `kano-backend/tests/unit/test_kano_matrix.py`

### References

- [Source: initial-specification.md] — **authoritative** 25-cell matrix (source of truth)
- [Source: _bmad-output/planning-artifacts/prd.md#FR28–30] — categorization requirements
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Success] — 100% branch coverage on categorization module
- [Source: _bmad-output/planning-artifacts/prd.md#Risk Mitigation Strategy] — Kano matrix correctness as a top risk
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — service module conventions
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — `category` column CHECK constraint (must match Category enum values)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] — original AC source

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
