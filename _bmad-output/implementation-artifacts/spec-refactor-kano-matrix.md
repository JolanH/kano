---
title: 'Refactor Kano matrix to standard A/M/O/I/R/Q model'
type: 'refactor'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: '21f5e663e7704ffc413d9af2c391fab260b6380c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The product's Kano model uses a bespoke 6-category set (`M`=Mandatory, `L`=Linear, `E`=Exciter, `I`=Indifferent, `C`=Contradictory, `D`=Doubtful) with a non-standard 25-cell matrix. The team wants to align with the standard Kano evaluation table (the supplied reference image).

**Approach:** Replace the category codes, the 25-cell matrix conditions, and all display labels with the standard model — `A`=Attractive, `M`=Must-be, `O`=Performance, `I`=Indifferent, `R`=Reverse, `Q`=Questionable — propagating the change through backend matrix/enum/DB-constraint, analysis ordering, frontend types/maps/copy/theme/components, and all tests.

## Boundaries & Constraints

**Always:**
- Canonical 25-cell matrix (rows = functional answer fq 1..5 = Like→Dislike; cols = dysfunctional answer dq 1..5 = Like→Dislike):
  ```
        dq1  dq2  dq3  dq4  dq5
  fq1    Q    A    A    A    O
  fq2    R    Q    I    I    M
  fq3    R    I    I    I    M
  fq4    R    I    I    Q    M
  fq5    R    R    R    R    Q
  ```
- Canonical scan/display order everywhere categories are listed: **M → O → A → I → R → Q**.
- Display labels (image vocabulary): Must-be, Performance, Attractive, Indifferent, Reverse, Questionable.
- Keep the existing AA-compliant hex palette; remap tokens by concept: `must`#1E3A8A, `perf`#0D9488, `attr`#7C3AED (was `del`), `ind`#6B7280, `rev`#B45309 (was `cont`), `que`#8F6912 (was `doub`).
- Backend↔DB↔frontend code values must stay in sync (single-letter codes, CHAR(1)).
- `kano_matrix.py` stays a pure-function module (stdlib `enum` only).

**Ask First:**
- Any need to preserve/recompute existing response rows (decision was **clean slate** — see Never).
- Changing the fq/dq Likert axis orientation or the 1..5 wording.

**Never:**
- Recompute or preserve existing `responses` data — clean slate: the migration wipes `responses` + `submissions`. Projects/features/polls are untouched.
- Rewrite planning-history docs (`initial-specification.md`). Stop citing it as the matrix authority instead.
- Edit migration `0001` in place — add a new `0002` migration.
- Introduce a 7th category or drop to 5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Performance cell | `compute_category(1,5)` | `Category.PERFORMANCE` (`"O"`) | N/A |
| Attractive cell | `compute_category(1,2)` | `Category.ATTRACTIVE` (`"A"`) | N/A |
| Reverse cell | `compute_category(5,1)` | `Category.REVERSE` (`"R"`) | N/A |
| Must-be cell | `compute_category(2,5)` | `Category.MUSTBE` (`"M"`) | N/A |
| Questionable diagonal | `compute_category(2,2)` / `(4,4)` / `(5,5)` / `(1,1)` | `Category.QUESTIONABLE` (`"Q"`) | N/A |
| Indifferent centre | `compute_category(3,3)` | `Category.INDIFFERENT` (`"I"`) | N/A |
| Out-of-range / wrong type | `compute_category(0,3)`, `(True,3)`, `(2.5,3)` | raises `ValueError` (unchanged behavior) | ValueError |
| Unknown stored code | analysis sees a non-`AMOIRQ` char | WARN + skip row, page still renders | logged warning |

</frozen-after-approval>

## Code Map

- `kano-backend/src/kano/services/kano_matrix.py` -- `Category` enum + `_MATRIX` + module docstring (authoritative matrix)
- `kano-backend/src/kano/models/response.py` -- mirror `Category` enum + inline CHECK constraint
- `kano-backend/migrations/versions/0001_initial_schema.py` -- existing CHECK `('M','L','E','I','C','D')` (left as history)
- `kano-backend/migrations/versions/0002_*.py` -- NEW: clean-slate wipe + swap CHECK to `('A','M','O','I','R','Q')`
- `kano-backend/src/kano/services/analysis.py` -- `_CANONICAL_ORDER` + ordering doc comments
- `kano-backend/scripts/seed_analysis_dataset.py` -- dev seed cell/category references
- `kano-frontend/src/api/types.ts` -- `Category` union type
- `kano-frontend/src/components/kano-categories.ts` -- `CATEGORY_CODES`, `COPY_KEY`, `HELP_KEY`, `DESC_KEY`, `SWATCH_CLASS`
- `kano-frontend/src/copy/en.ts` -- `pm.category.*`, `pm.category.help.*`, `analysis.categoryRef.desc.*` keys + `CopyKey` type
- `kano-frontend/src/theme/tixeo.ts` -- `category-*` tokens + `contrastPairings`
- `kano-frontend/src/components/{CatBadge,KanoStackedBar,KanoCategoryPie,KanoCategoryReference}.vue` -- fill/swatch class maps + scoped CSS
- `kano-frontend/src/pages/dev/ThemeAudit.vue` -- dev audit hardcoded labels

## Tasks & Acceptance

**Execution:**
- [x] `kano-backend/src/kano/services/kano_matrix.py` -- rename enum members to MUSTBE=`M`/PERFORMANCE=`O`/ATTRACTIVE=`A`/INDIFFERENT=`I`/REVERSE=`R`/QUESTIONABLE=`Q`, rewrite `_MATRIX` to the canonical grid above, rewrite the docstring to cite the standard Kano evaluation table -- single source of truth
- [x] `kano-backend/src/kano/models/response.py` -- mirror the new enum + change inline CheckConstraint to `('A','M','O','I','R','Q')` -- keep model↔matrix parity
- [x] `kano-backend/migrations/versions/0002_kano_category_standard_amoirq.py` -- NEW migration (down_revision `"0001"`): upgrade = `DELETE FROM responses; DELETE FROM submissions;` then drop `ck_responses_category_enum` and recreate with `('A','M','O','I','R','Q')`; downgrade = restore `('M','L','E','I','C','D')` (data not restored) -- clean-slate constraint swap
- [x] `kano-backend/src/kano/services/analysis.py` -- `_CANONICAL_ORDER` = `(MUSTBE, PERFORMANCE, ATTRACTIVE, INDIFFERENT, REVERSE, QUESTIONABLE)` + update order comments -- M→O→A→I→R→Q scan order
- [x] `kano-backend/scripts/seed_analysis_dataset.py` -- update category names/cell coords used to fabricate fixtures -- dev tooling stays runnable
- [x] `kano-backend/tests/**` -- update `test_kano_matrix.py` expected grid (literal restatement), plus `test_analysis_dominant.py`, `test_analysis_service.py`, `test_poll_service_submissions.py`, `test_analysis_api.py`, `test_seed_analysis_dataset.py` enum refs/fixtures -- tests assert the new contract
- [x] `kano-frontend/src/api/types.ts` -- `Category = 'A'|'M'|'O'|'I'|'R'|'Q'` -- wire-type parity
- [x] `kano-frontend/src/components/kano-categories.ts` -- `CATEGORY_CODES = ['M','O','A','I','R','Q']` + remap COPY_KEY/HELP_KEY/DESC_KEY/SWATCH_CLASS to `must/perf/attr/ind/rev/que` -- central config
- [x] `kano-frontend/src/copy/en.ts` -- rename keys to `*.{must,perf,attr,ind,rev,que}`, set labels (Must-be/Performance/Attractive/Indifferent/Reverse/Questionable), rewrite help + desc text for Attractive/Reverse/Questionable; update `CopyKey` union -- display copy
- [x] `kano-frontend/src/theme/tixeo.ts` -- rename tokens to `category-{must,perf,attr,ind,rev,que}` keeping hexes, update `contrastPairings` + comments -- palette remap
- [x] `kano-frontend/src/components/{CatBadge,KanoStackedBar,KanoCategoryPie,KanoCategoryReference}.vue` -- update fill/swatch class maps + scoped CSS selectors to `*-{must,perf,attr,ind,rev,que}` -- rendering
- [x] `kano-frontend/src/pages/dev/ThemeAudit.vue` -- replace hardcoded `Delighter`/old-label strings with new vocabulary -- dev audit consistency
- [x] `kano-frontend/tests/unit/**` + `kano-frontend/e2e/**` -- update fixtures/codes/labels/classes (`kano-category-pie`, `kano-stacked-bar`, `kano-stacked-bar-table`, `cat-badge`, `analysis-page`, `analysis-table`, `per-category-panels`, `kano-category-reference`, `useCopy`, `theme-audit-coverage` specs; `e2e/pm/analysis-page.spec.ts`, `e2e/pm/_seed-helpers.ts`) -- green suites
- [x] `docs/copy-deck.md` -- update category label table + terminology note -- doc consistency

**Acceptance Criteria:**
- Given the new matrix, when `compute_category` is called for all 25 (fq,dq) pairs, then results match the canonical grid exactly (25-cell parametrized test green).
- Given a fresh DB, when `alembic upgrade head` runs, then `responses.category` accepts only `A/M/O/I/R/Q` and rejects old codes; `alembic upgrade head && downgrade -1 && upgrade head` round-trips clean.
- Given an analysis response, when categories are listed (chips, stacked bar, table, panels, pie), then they render in M→O→A→I→R→Q order with correct labels and swatch colors, and no stale `Delighter`/`Contradictory`/`Doubtful`/`L`/`E`/`C`/`D` strings remain in shipped source.
- Given `grep -rn` for old codes/labels in `src/`, then zero functional references remain (migration `0001` history excepted).

## Verification

**Commands:**
- `cd kano-backend && pytest -q` -- expected: all green (matrix, analysis, alembic roundtrip, submission service)
- `cd kano-backend && ruff check . && mypy src` -- expected: clean
- `cd kano-frontend && npm run test:unit` -- expected: all green (incl. theme-contrast)
- `cd kano-frontend && npx vue-tsc --noEmit` (or project typecheck) -- expected: no type errors after `Category` union change
- `cd kano-frontend && npm run lint` -- expected: clean (inline-literal copy-key lint passes)
- `grep -rnE "MANDATORY|LINEAR|EXCITER|CONTRADICTORY|DOUBTFUL|Delighter|category-(del|cont|doub)" kano-backend/src kano-frontend/src` -- expected: no matches

**Manual checks:**
- E2E `analysis-page.spec.ts` renders the analysis page with the new labels/colors (run if Playwright env available; otherwise inspect CatBadge lineup order M→O→A→I→R→Q).

## Spec Change Log

### Review iteration 1 (blind hunter, edge-case hunter, acceptance auditor)

No `intent_gap` or `bad_spec` findings — no loopback. All findings were `patch`-level (comment/doc staleness) and auto-fixed:

- **patch** — `docs/copy-deck.md`: stale vocabulary note still said the bottom two labels were "Contradictory"/"Doubtful"; stale enum-name list + broken `docs/accessibility/…` path; "Maps to" column used non-existent enum names `MANDATORY`/`ONE_DIMENSIONAL`. Rewritten to standard A/M/O/I/R/Q vocabulary and real enum names.
- **patch** — `e2e/pm/_seed-helpers.ts` + `tests/unit/kano-stacked-bar-table.spec.ts`: comments referenced old enum names (`MANDATORY`/`ONE-DIMENSIONAL`/`L/E/I`); data values already correct, comments updated.
- **patch** — `src/theme/tixeo.ts`: remap-explanation comment contained old labels (`Delighter`/`Contradictory`/`Doubtful`) that tripped the verification grep; reworded to reference hex codes.
- **patch (found pre-review during implementation)** — two `Record<Category, number>` literals still held old keys (`KanoCategoryPie.vue` weights accumulator; `ThemeAudit.vue` demo distribution). Both fixed to `M/O/A/I/R/Q`. Also fixed: migration `0002` downgrade must wipe rows before re-adding the old CHECK (else new-domain codes O/A/R/Q violate it); the alembic-roundtrip test was switched from `downgrade -1` to `downgrade base` now that a second migration exists.
- **reject** — blind hunter flagged `Q` at cells (2,2)/(4,4) as "non-textbook"; this matches the user's reference image and the spec's authoritative grid exactly.
- **defer (pre-existing, unrelated)** — `useCopy.spec.ts` docs↔en.ts sync fails on `pm.features.editor.submit.aria`, undocumented since baseline `21f5e66` (feature-editor glyph). Appended to deferred-work.

## Suggested Review Order

**Source of truth — matrix & category model**

- Start here: the 25-cell matrix, transcribed from the reference image (canonical grid + docstring).
  [`kano_matrix.py:64`](../../kano-backend/src/kano/services/kano_matrix.py#L64)

- The six-member enum in canonical scan order M→O→A→I→R→Q; `.value` is the DB code.
  [`kano_matrix.py:40`](../../kano-backend/src/kano/services/kano_matrix.py#L40)

**Persistence — DB domain swap**

- New migration: clean-slate wipe + CHECK swap to `('A','M','O','I','R','Q')`; downgrade wipes too (highest-risk stop).
  [`0002_kano_category_standard_amoirq.py:36`](../../kano-backend/migrations/versions/0002_kano_category_standard_amoirq.py#L36)

- Model enum mirror + inline CHECK constraint kept in parity.
  [`response.py:62`](../../kano-backend/src/kano/models/response.py#L62)

**Ordering & wire contract**

- Backend canonical order drives dominant-category tie sorting.
  [`analysis.py:42`](../../kano-backend/src/kano/services/analysis.py#L42)

- Frontend wire-type union — TypeScript exhaustiveness anchor for every `Record<Category,…>`.
  [`types.ts:131`](../../kano-frontend/src/api/types.ts#L131)

**Frontend rendering — central config drives all surfaces**

- One place maps codes → copy keys, swatch/fill classes, and the M→O→A→I→R→Q lineup order.
  [`kano-categories.ts:24`](../../kano-frontend/src/components/kano-categories.ts#L24)

- Display labels (image vocabulary) + help/reference copy.
  [`en.ts:42`](../../kano-frontend/src/copy/en.ts#L42)

- Palette remapped by concept onto the existing AA-compliant hexes.
  [`tixeo.ts:56`](../../kano-frontend/src/theme/tixeo.ts#L56)

**Tests (supporting)**

- The literal expected grid — independent restatement of the matrix, not derived from it.
  [`test_kano_matrix.py:30`](../../kano-backend/tests/unit/test_kano_matrix.py#L30)
