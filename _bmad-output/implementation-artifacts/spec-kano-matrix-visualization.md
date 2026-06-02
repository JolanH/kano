---
title: 'Kano evaluation-matrix visualization under the "categories meaning" panel'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: '2ff45393be1305a4e113b5c7dce1ba823be3b04f'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "categories meaning" panel (`KanoCategoryReference`) tells a PM what each Kano category *is*, but never shows *how a poll answer becomes a category*. The functional × dysfunctional → category mapping (the 25-cell Kano evaluation table) lives only in the backend (`kano_matrix.py`) and the respondent flow; on the analysis page it is invisible.

**Approach:** Add a static, prop-less `<KanoMatrixReference>` card rendered directly **under** the `KanoCategoryReference` aside (same right-hand column of the "By category" layout). It draws the classic 5×5 Kano matrix exactly as the reference image: rows = functional answer (feature present), columns = dysfunctional answer (feature absent), each of the 25 cells filled with the resulting category. Axis answer labels use the **classic Kano wording** (Like it / Expect it / Neutral / Can tolerate it / Dislike it). Cell coloring reuses **this product's** `--v-theme-category-*` palette (the same colors as the swatches directly above it) — the image is a structural reference, not a color reference. The matrix mapping is a frontend mirror of `kano_matrix.py`, used only for display.

## Boundaries & Constraints

**Always:**
- The 25 cells MUST match `kano-backend/src/kano/services/kano_matrix.py` exactly (rows fq 1..5, cols dq 1..5): `Q A A A O / R Q I I M / R I I I M / R I I Q M / R R R R Q`. The frontend matrix constant is documented as a mirror whose single source of truth is the backend module.
- Reuse the existing `--v-theme-category-*` tokens and the existing `COPY_KEY` category names for cell labels. Color is reinforcement, never the sole channel: each cell shows the category **name as real text** (NFR10 / "color + accessible fallback", as in `CatBadge` / `KanoCategoryReference`).
- Render as a semantic `<table>` with `<th scope="col">` / `<th scope="row">` answer-label headers plus a `sr-only` `<caption>` explaining the functional/dysfunctional axes, so a screen reader announces row + column context per cell.
- All user-visible strings come from the copy deck (`src/copy/en.ts`) and are mirrored into `docs/copy-deck.md` (the `useCopy.spec.ts` bidirectional sync gate). No inline literals.
- The matrix sits in the same 70% reference column, stacked below `KanoCategoryReference`, styled as a sibling card (border / radius / `surface-bright` background) consistent with the reference aside.

**Ask First:**
- Matching the image's pastel palette instead of the product's category palette (decided: use the product palette).
- Changing the axis answer wording away from the classic Kano labels (decided: classic labels).
- Any change to `kano_matrix.py` or the persisted-category contract — this feature is display-only and must not touch categorization logic.

**Never:**
- Do not remove, reorder, or restyle `KanoCategoryReference`, `KanoCategoryPie`, or the per-category jump-lists / anchors / pulse behavior.
- Do not gate the matrix on the poll's data — it is static glossary content, always rendered when the "By category" section renders.
- Do not mount on the zero-data path (it lives inside `PerCategoryPanels`, already guarded by `panels.length > 0`).
- Do not introduce a charting dependency — plain HTML table + scoped CSS.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard render | any non-empty analysis | 5×5 = 25 cells, each colored by its category and labeled with the category name; row/col headers = 5 classic answer labels | N/A |
| Matrix parity | the rendered cell categories | equal the documented `kano_matrix.py` grid, cell-for-cell | N/A |
| Screen reader | a cell reached | announced with its row header (functional answer) + column header (dysfunctional answer) + category name; color conveys nothing alone | N/A |
| Axis disambiguation | both axes share the same 5 labels | `sr-only` caption + axis labels state which axis is functional (present) vs dysfunctional (absent) | N/A |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/components/KanoMatrixReference.vue` -- NEW. Prop-less, presentational. Renders the 5×5 matrix as a `<table>` inside a labelled card; iterates `KANO_MATRIX`; each cell = category color (local `cell-*` class → `--v-theme-category-*`) + `copy(COPY_KEY[cat])`. Axis labels + `sr-only` caption from the new copy namespace.
- `kano-frontend/src/components/kano-categories.ts` -- add `KANO_MATRIX` (the 5×5 `Category` grid, documented as a mirror of `kano_matrix.py`) and `MATRIX_ANSWER_KEYS` (ordered `CopyKey[]` for the 5 Likert answer labels, shared by both axes).
- `kano-frontend/src/components/PerCategoryPanels.vue` -- wrap `<KanoCategoryReference />` and `<KanoMatrixReference />` in a `.panels-reference-column` (vertical flex) occupying the existing 7fr grid track, so the matrix stacks directly under the reference. Pie / lists / grid columns otherwise untouched.
- `kano-frontend/src/copy/en.ts` -- add the `analysis.kanoMatrix.*` keys (heading, functionalAxis, dysfunctionalAxis, `answer.{like,expect,neutral,tolerate,dislike}`, tableCaption).
- `docs/copy-deck.md` -- add a "Kano evaluation matrix" section documenting each new key (sync gate).
- `kano-frontend/tests/unit/kano-matrix-reference.spec.ts` -- NEW. 25 cells, cell-for-cell parity with the documented matrix, axis labels + headers sourced from copy, category names rendered as text, `<caption>` present.
- `kano-frontend/tests/unit/per-category-panels.spec.ts` -- stub `KanoMatrixReference`, assert it mounts under the reference; existing pie / list / anchor assertions still pass.

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- added `analysis.kanoMatrix.heading`, `.functionalAxis`, `.dysfunctionalAxis`, `.answer.{like,expect,neutral,tolerate,dislike}`, `.tableCaption`. Classic Kano answer wording; no "epoch".
- [x] `docs/copy-deck.md` -- added a "Kano evaluation matrix" section with one table row per new key (bidirectional sync gate). Also fixed a PRE-EXISTING gate failure: documented `pm.features.editor.submit.aria` (added in commit 21f5e66, never doc'd) — out of spec but unblocked the shared `useCopy.spec.ts` gate.
- [x] `kano-frontend/src/components/kano-categories.ts` -- added `KANO_MATRIX` (typed `readonly (readonly Category[])[]`, the documented backend grid) and `MATRIX_ANSWER_KEYS` (typed `readonly CopyKey[]`). Doc-comment names `kano_matrix.py` as the source of truth.
- [x] `kano-frontend/src/components/KanoMatrixReference.vue` -- new prop-less component; labelled card with heading, axis labels, and a `<table>` (col/row `<th scope>` answer headers, `sr-only` `<caption>`); 25 `<td>` cells colored via local `cell-*` classes + category name text.
- [x] `kano-frontend/src/components/PerCategoryPanels.vue` -- introduced `.panels-reference-column` wrapping the reference + matrix in the 7fr track; mounted `<KanoMatrixReference />` below `<KanoCategoryReference />`.
- [x] `kano-frontend/tests/unit/kano-matrix-reference.spec.ts` -- asserts 25 cells, cell-for-cell parity with an independently-pinned canonical grid, axis labels + headers from copy, names as text, caption present.
- [x] `kano-frontend/tests/unit/per-category-panels.spec.ts` -- stubbed the matrix, asserts it mounts in the reference column under the reference; pie/list/anchor assertions unchanged.

**Acceptance Criteria:**
- Given any poll with at least one dominant category, when the "By category" section renders, then a Kano matrix card appears directly under the "categories meaning" panel showing a 5×5 grid whose cells reproduce the standard Kano evaluation table.
- Given the rendered matrix, when each cell is read, then its category matches `kano_matrix.py` for that (functional, dysfunctional) answer pair, colored with the product's `--v-theme-category-*` token and labeled with the category name.
- Given a screen reader, when a cell is reached, then the functional (row) and dysfunctional (column) answer labels and the category name are announced as real text, and color carries no information alone.
- Given the matrix is present, when the pie, jump-lists, and reference panel are inspected, then they render unchanged.

## Design Notes

Layout: `.panels-layout` stays a `3fr 7fr` grid. Today `<KanoCategoryReference />` is the 7fr child directly; wrap it together with the matrix in a `.panels-reference-column { display:flex; flex-direction:column; gap:24px }` so both share the 70% track and the matrix lands beneath the reference (the requested "under" placement) — no second grid row, no column reflow.

Cell coloring mirrors the `CatBadge` / `KanoCategoryReference` local-class convention (scoped styles don't cross components): declare `cell-must … cell-que` → `background-color: rgb(var(--v-theme-category-*))` locally. Cell text is white (`on` color) over the saturated brand backgrounds; the category **name** is the accessible channel, color is reinforcement.

Canonical grid (rows = functional fq 1..5, cols = dysfunctional dq 1..5), mirror of `kano_matrix.py`:

```
            like  expect neutral tolerate dislike
like it      Q     A      A       A        O
expect it    R     Q      I       I        M
neutral      R     I      I       I        M
tolerate     R     I      I       Q        M
dislike it   R     R      R       R        Q
```

The frontend `KANO_MATRIX` is a display mirror, not a categorization path — every persisted category is computed server-side by `compute_category`. The parity unit test pins the rendered cells to this grid so silent drift from the backend fails CI.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: new `kano-matrix-reference` spec passes; updated `per-category-panels` + `useCopy` (sync gate) specs pass; no regressions.
- `cd kano-frontend && npm run type-check` -- expected: clean (vue-tsc); `KANO_MATRIX` typed `Category`, `MATRIX_ANSWER_KEYS` typed `CopyKey`.

**Manual checks:**
- Open the analysis page for a poll with data; confirm the 5×5 matrix sits directly under the "categories meaning" panel, cell categories/colors match the image's layout (with product colors), and the pie + lists + reference are unchanged.

## Suggested Review Order

**The matrix component (design intent)**

- Entry point — prop-less card; cells loop `KANO_MATRIX` × `MATRIX_ANSWER_KEYS`, name as text + color class.
  [`KanoMatrixReference.vue:88`](../../kano-frontend/src/components/KanoMatrixReference.vue#L88)

- Performance-cell contrast override — only category where white text fails AA; switches to dark `on-surface`.
  [`KanoMatrixReference.vue:218`](../../kano-frontend/src/components/KanoMatrixReference.vue#L218)

**The data (backend parity)**

- The 25-cell grid — frontend display mirror of `kano_matrix.py`; must match cell-for-cell.
  [`kano-categories.ts:86`](../../kano-frontend/src/components/kano-categories.ts#L86)

**Layout wiring**

- Matrix mounted under the glossary aside in the shared 70% column.
  [`PerCategoryPanels.vue:262`](../../kano-frontend/src/components/PerCategoryPanels.vue#L262)

- Block-stacking wrapper — avoids the flex `align-self` cross-axis collapse; cards fill the track.
  [`PerCategoryPanels.vue:314`](../../kano-frontend/src/components/PerCategoryPanels.vue#L314)

**Copy (sync gate)**

- New `analysis.kanoMatrix.*` keys (classic Kano answer labels + axes + caption).
  [`en.ts:407`](../../kano-frontend/src/copy/en.ts#L407)

- Mirrored into the copy deck — `useCopy.spec.ts` bidirectional gate.
  [`copy-deck.md:397`](../../docs/copy-deck.md#L397)

**Tests**

- Independent parity pin — fails CI if either the frontend grid or the component drifts from the backend.
  [`kano-matrix-reference.spec.ts:44`](../../kano-frontend/tests/unit/kano-matrix-reference.spec.ts#L44)

- Mount-placement assertion — matrix renders after the reference in the column.
  [`per-category-panels.spec.ts:379`](../../kano-frontend/tests/unit/per-category-panels.spec.ts#L379)
