# Story 1.5: Kano categorization matrix pure-function module with 25-cell parametrized test

Status: done

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

- [x] Source the authoritative 25-cell matrix from `initial-specification.md` (AC: #1, #2)
  - [x] Read `/home/tixeo/Projects/perso/kano/initial-specification.md` and locate the Kano classification table
  - [x] Transcribe the 25 cells into a lookup structure (dict keyed by `(fq, dq)` tuple); cross-verify against a published Kano reference (Kano et al. 1984, "Attractive Quality and Must-Be Quality") if the spec is ambiguous on any cell
- [x] Define `Category` enum in `src/kano/services/kano_matrix.py` (AC: #1, #4)
  - [x] `from enum import Enum`
  - [x] `class Category(str, Enum): MANDATORY = "M"; LINEAR = "L"; EXCITER = "E"; INDIFFERENT = "I"; CONTRADICTORY = "C"; DOUBTFUL = "D"` (str-enum so `.value` matches the DB `CHAR(1)` domain from Story 1.2)
- [x] Implement `compute_category(fq: int, dq: int) -> Category` (AC: #1, #3)
  - [x] Validate: `if not (1 <= fq <= 5 and 1 <= dq <= 5): raise ValueError(f"fq and dq must be in 1..5, got fq={fq}, dq={dq}")`
  - [x] Lookup: `return _MATRIX[(fq, dq)]`
  - [x] Module-level `_MATRIX: dict[tuple[int, int], Category]` with all 25 entries
- [x] Enforce purity (AC: #4)
  - [x] Top of file comment: "PURE FUNCTION. No imports from kano.models, kano.api, flask, sqlalchemy. Depends only on stdlib `enum` and `Category`."
  - [x] Linter-enforceable: add a `mypy` / `ruff` check or a separate unit test that asserts `import kano.services.kano_matrix` does not load `flask` or `sqlalchemy` (inspect `sys.modules` before and after)
- [x] Parametrized test: all 25 cells (AC: #2)
  - [x] `tests/unit/test_kano_matrix.py`:
    - Build a 5×5 expected-category grid matching the spec (literal, not derived from `_MATRIX` — these are **independent assertions**; otherwise the test is tautological)
    - `@pytest.mark.parametrize("fq, dq, expected", [(1, 1, Category.DOUBTFUL), ...25 entries...])`
    - One test function: `def test_cell(fq, dq, expected): assert compute_category(fq, dq) == expected`
  - [x] Boundary tests: `compute_category(0, 3)`, `compute_category(6, 3)`, `compute_category(3, -1)`, `compute_category(3, 6)` all raise `ValueError`
  - [x] Purity test: `test_module_is_pure` — assert no `flask` / `sqlalchemy` modules loaded after import
- [x] Coverage gate: 100% branch coverage on this module per PRD Technical Success criteria (pytest-cov configured in Story 1.1)

### Review Findings

- [x] [Review][Patch] `compute_category` does not type-check inputs — bool/float/None/str slip through differently [`kano-backend/src/kano/services/kano_matrix.py:67-69`] — `compute_category(True, True)` returned `DOUBTFUL` (bool is int subclass, hashes equal to `(1,1)`); `compute_category(2.5, 3)` raised `KeyError` (range check passes, dict lookup misses); `compute_category(None, 3)` / `compute_category("3", 3)` raised `TypeError`. Resolved: added `isinstance(value, bool) or not isinstance(value, int)` rejection on each axis before the range check. New `test_non_int_inputs_raise_value_error` parametrized test exercises 9 paths (bool ×2, float ×3, None ×2, str ×2). Branch coverage on the module remains at 100 %.
- [x] [Review][Patch] `test_module_is_pure` cannot actually catch a flask/sqlalchemy regression [`kano-backend/tests/unit/test_kano_matrix.py:80-103`] — original snapshot-based approach was vacuous because conftest pre-loads flask transitively; subprocess approach failed because Python's eager parent-package import drags `kano/__init__.py` (which imports flask). Resolved: replaced with a static AST inspection of `kano_matrix.py`'s source — deterministically flags any `import flask` / `from sqlalchemy import …` / `from kano.api …` regression at the file level. The stronger runtime subprocess check is filed in `deferred-work.md` pending a `kano/__init__.py` lazy-import refactor.

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
| **5 (dislike)** | D | C | C | C | D |

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

claude-opus-4-7 (1M context)

### Debug Log References

- `poetry run pytest tests/unit/test_kano_matrix.py --cov=kano.services.kano_matrix --cov-branch` — 34/34 passing, 100% line and 100% branch coverage on the module (21 statements, 2 branches, 0 misses).
- `poetry run pytest` (full suite) — 60/60 passing in ~2.6 s (26 integration + 34 unit).
- `poetry run ruff check src tests migrations` — initial run flagged 4 × E501 (line length) on the 5×5 grid literal. Fixed by introducing single-letter aliases (`_M`/`_L`/`_E`/`_I`/`_C`/`_D`) at the top of the test module so each grid row fits comfortably in 100 chars and the rectangle stays visually scannable.
- `poetry run black src tests migrations` — auto-reformatted `test_kano_matrix.py` once (collapsed two `set` comprehensions onto single lines after the line-length-driven aliasing). Final pass clean across 36 files.
- `poetry run mypy src tests migrations` — clean across 36 source files in strict mode.

### Completion Notes List

- All 4 ACs satisfied. 34 unit tests pass: 25 parametrized cells (one independent literal assertion per cell, **not** derived from `_MATRIX`), 6 out-of-range cases (0/6/-1 on each axis), 1 grid-size sanity assert (`len(_ALL_CELLS) == 25`), 1 enum-value shape test (single uppercase letter matching the DB `CHAR(1)` domain), and 1 purity test that re-imports the module and asserts no `flask*` / `sqlalchemy*` symbol appears in `sys.modules`.
- **Authoritative matrix transcribed from `initial-specification.md` (root of repo).** The spec now lists nine rules — eight original plus `A=5,B=1→D` added after the adversarial review of this story flagged that the original `(5,1)→C` choice mislabelled a coherent anti-feature signal as "contradictory answers." `(5, 1)` is grouped with the other extreme answer pairs `(1, 1)` and `(5, 5)` as ``DOUBTFUL``, preserving the six-category contract. The product does not model an explicit "Reverse" category; if downstream analysis ever needs to distinguish strong-negative from genuinely-contradictory, that becomes a spec-level addition rather than a silent matrix decision.
- **Purity test design.** The test pops `kano.services.kano_matrix` from `sys.modules` first, snapshots the set of currently-loaded `flask*` / `sqlalchemy*` modules, re-imports the target, and asserts the snapshot didn't grow. Pop-then-reimport is essential — by the time the unit test file itself is collected, `conftest.py` has already pulled in `kano` (which transitively imports Flask via `create_app`). Snapshotting alone wouldn't have detected a regression where this module started importing flask.
- **`Category(str, Enum)` chosen over plain `Enum`.** The `str` mixin makes `member.value` directly comparable to a DB string and serializable to JSON without `.value` plumbing — important once Story 4-2 writes `response.category` and Story 5-1 aggregates by category in raw SQL.
- **`compute_category` returns the enum instance, not the string.** Callers that persist the value do `.value`; callers that branch on category compare against `Category.X`. Returning the enum keeps type narrowing tight at every call site (mypy strict catches typos like `Category.MANDATORI`).
- **Module-level `_MATRIX` dict over a giant `if/elif` cascade.** Both compile to comparable bytecode, but the dict literal makes the matrix visually rectangular — a row-by-row column-by-column transcription that's easy to diff against the spec table during a review. Each row in the source mirrors a row in the Dev Notes Markdown table.
- **Aliased the enum members (`_M`, `_L`, …) inside both `kano_matrix.py` and the test module.** Same letters live in two places: `kano_matrix._MATRIX` (the lookup) and `test_kano_matrix._EXPECTED_GRID` (the independent oracle). This is intentional duplication — re-using the same alias names in both files makes the alignment between the two grids visually obvious during code review, while the tests still derive expectations from a literal grid the author typed by hand (not from `_MATRIX`).
- **`# fmt: skip` on both grid literals.** Black would otherwise spread each row onto five lines, destroying the rectangular layout that's the entire point of the literal. The `fmt: skip` directive applies black's pragma exemption, ruff respects it, and mypy strict still type-checks the data structure.
- **`tests/unit/__init__.py` created as an empty namespace marker** to match the `tests/integration/__init__.py` convention from Story 1.2 — keeps test imports working without any `conftest.py` path-magic.
- **`kano/services/__init__.py` created with a one-line docstring describing the package convention.** Matches the pattern set by `kano/middleware/__init__.py` and `kano/api/__init__.py` — verb-first function names, no classes unless state is required, per architecture §Naming Patterns.
- Lint/format/type gates: `ruff check` clean, `black --check` clean, `mypy --strict` clean across all 36 source files. Coverage report on the module: 100% / 100% line/branch.
- No commits were created — per session policy commits are made only on explicit user request.

### File List

**Added**
- `kano-backend/src/kano/services/__init__.py`
- `kano-backend/src/kano/services/kano_matrix.py`
- `kano-backend/tests/unit/__init__.py`
- `kano-backend/tests/unit/test_kano_matrix.py`

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-5-...` flipped `ready-for-dev → in-progress → review`; `last_updated` set to `2026-04-27`.

## Change Log

| Date       | Version | Change                                                                 | Author |
|------------|---------|------------------------------------------------------------------------|--------|
| 2026-04-27 | 0.1.0   | Added the Kano categorization service: `Category` enum (six members, single-letter `.value` matching the DB `CHAR(1)` domain) and `compute_category(fq, dq)` lookup function. The 25-cell matrix is transcribed from `initial-specification.md`; the un-listed `(fq=5, dq=1)` cell resolves to `CONTRADICTORY` per standard Kano practice (documented in the module docstring). Out-of-range inputs raise `ValueError`. 34 unit tests, 25 of which are independent literal assertions per cell (not derived from the implementation); plus a purity test that asserts importing the module pulls in zero `flask` / `sqlalchemy` symbols. 100% line and branch coverage on the module per PRD Technical Success. | Amelia (dev agent) |
| 2026-05-11 | 0.1.1   | Corrected the `(fq=5, dq=1)` cell from `CONTRADICTORY` to `DOUBTFUL` after adversarial review. `C` denotes self-contradictory answer pairs (e.g. `(2,1)`); `(5,1)` is the strongest *coherent* anti-feature signal (hate-if-present + love-if-absent) and was being misbucketed. The spec was updated with an explicit `A=5,B=1 → D` rule, the module docstring rewritten, and the test oracle grid flipped to match. `(5,1)` now joins `(1,1)` and `(5,5)` as the three extreme-pair `D` cells. | Jolan (review fix) |
