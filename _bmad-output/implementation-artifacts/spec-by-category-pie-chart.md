---
title: 'Category-repartition pie chart in the "By category" panel'
type: 'feature'
created: '2026-06-01'
status: 'done'
context: []
baseline_commit: 'aed0e5fd32a91ebacfff7e887d574fed26768d09'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "By category" panel (`PerCategoryPanels`) currently opens straight into per-category feature lists. There is no at-a-glance visual of how features distribute across the six Kano categories — the repartition has to be read off the lists.

**Approach:** Add a hand-rolled SVG pie chart at the top of the panel that shows each feature's *dominant* category as a proportional slice. A feature tied across N dominant categories is split fractionally (1/N per category) so the slices always sum to exactly 100%. The existing per-category feature jump-lists stay below the pie unchanged (Story 5-6 cross-index navigation preserved). The pie carries a visible legend that doubles as its accessible enumeration, matching the codebase's "color + accessible fallback" pairing.

## Boundaries & Constraints

**Always:**
- Hand-roll the SVG (no charting dependency) and color slices with the existing `--v-theme-category-*` tokens, iterating the canonical `CATEGORY_CODES` (M→L→E→I→C→D) order.
- Pie weight per feature = 1, split evenly across that feature's `dominant_categories`; features with an empty `dominant_categories` contribute nothing. Total = sum of weights. Slice fraction = categoryWeight / total. Geometry uses exact fractions (legend may round for display).
- Pair the SVG (`role="img"` + copy-sourced aria-label) with a visible legend that enumerates each present category and its percentage as real text.
- All user-visible strings come from the copy deck (`src/copy/en.ts`); no inline literals.

**Ask First:**
- Adding a charting library, animating the pie, or changing the panel's `analysis.panels.heading` text.

**Never:**
- Do not remove, reorder, or alter the per-category feature jump-lists or their anchor/pulse behavior.
- Do not display fractional feature counts in the legend (show percentages only — "1.5 features" is confusing).
- Do not mount the pie on the zero-data path (the panel is already guarded by `panels.length > 0` / `total_submissions === 0`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single dominant cat per feature | features each with one `dominant_categories` entry | slices sized by integer counts, sum 100% | N/A |
| Tied feature (M+L) | one feature, `dominant_categories: ['M','L']` | +0.5 to M slice, +0.5 to L slice | N/A |
| One category only / 100% slice | all weight in one category | render a full `<circle>`, not a degenerate 0–360° arc path | N/A |
| Feature with empty dominant_categories | `dominant_categories: []` | excluded from total and from all slices | N/A |
| No features have a dominant category (total ≤ 0) | weights sum to 0 | render nothing (no SVG, no legend) | silent |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/components/KanoCategoryPie.vue` -- NEW. Presentational SVG pie + legend; accepts `analysis: PollAnalysis`, computes fractional category weights internally.
- `kano-frontend/src/components/PerCategoryPanels.vue` -- mount `<KanoCategoryPie :analysis="analysis" />` above the `v-for` section list.
- `kano-frontend/src/components/kano-categories.ts` -- reuse `CATEGORY_CODES` + `COPY_KEY`; declare pie `fill-*` map locally in the new component (per the file's stated convention).
- `kano-frontend/src/copy/en.ts` -- add `analysis.pie.*` keys (aria-label + slice tooltip template).
- `kano-frontend/tests/unit/kano-category-pie.spec.ts` -- NEW. Unit tests for weight math, tie split, edge cases, copy sourcing.
- `kano-frontend/tests/unit/per-category-panels.spec.ts` -- assert the pie renders above the section lists (stub `KanoCategoryPie`).

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- added `analysis.pie.ariaLabel` and `analysis.pie.sliceLabel` (`'{name}: {pct}%'`, mirroring `analysis.stackedBar.tooltip`). Also documented both in `docs/copy-deck.md` (required by the `useCopy.spec.ts` sync gate).
- [x] `kano-frontend/src/components/KanoCategoryPie.vue` -- computes fractional weights from `analysis.features[].dominant_categories`, renders proportional SVG wedges (full `<circle>` when one category is 100%) with local `fill-*` classes + thin white separating stroke, and a visible legend (inline-SVG swatch reusing the `fill-*` class + `sliceLabel` text). `role="img"`, `aria-label` from copy; per-slice `<v-tooltip>` using `sliceLabel`. Renders nothing when total ≤ 0.
- [x] `kano-frontend/src/components/PerCategoryPanels.vue` -- imports and mounts `<KanoCategoryPie :analysis="analysis" />` directly under the panel `<h2>`, above the `v-for` sections. (Also fixed a pre-existing latent type error on the file's `pulseTimers` map — `window.setTimeout` returns a DOM `number`, not Node's `Timeout`.)
- [x] `kano-frontend/tests/unit/kano-category-pie.spec.ts` -- covers the I/O matrix rows (single-cat, tie split, 100% single-slice → `<circle>`, empty dominant list, total ≤ 0 → empty render) plus order, tooltip↔legend parity, and copy-deck sourcing.
- [x] `kano-frontend/tests/unit/per-category-panels.spec.ts` -- stubs `KanoCategoryPie` and asserts it mounts before the first `<section>`; existing list assertions still pass.

**Acceptance Criteria:**
- Given a poll where one feature is tied across two categories, when the pie renders, then that feature adds 0.5 to each category's slice and all slices sum to 100%.
- Given all dominant features belong to a single category, when the pie renders, then it draws one full circle (no malformed arc) sized at 100%.
- Given the panel is shown, when the pie is present, then the per-category feature jump-lists still render below it with their anchors and pulse behavior intact.
- Given a screen reader, when it reaches the pie, then the SVG is announced via its copy-sourced label and the legend conveys each present category and percentage as text.

## Verification

**Commands:**
- `npm run test:unit` -- expected: new `kano-category-pie` spec + updated `per-category-panels` spec pass; no regressions.
- `npm run type-check` -- expected: clean (vue-tsc).
- `npm run lint` -- NOT runnable in this environment: the flat-config loader needs Node ≥ 21 (box has 20.19.4) and `eslint-config-vuetify` breaks on Node 22 here. The inline-literal gate (`vue/no-bare-strings-in-template`) is instead verified by `tests/unit/no-bare-strings-rule.spec.ts` (passing) — and the new template binds every user-facing string via `copy()` (no bare strings).

**Manual checks:**
- Open the analysis page for a poll with mixed categories incl. a tie; confirm the pie sits above the lists, slices match the legend percentages, and a 100%-single-category poll renders a full circle.

## Suggested Review Order

**Repartition logic (the new code)**

- Entry point — fractional tie split: each feature worth 1, shared 1/N across its dominant categories.
  [`KanoCategoryPie.vue:132`](../../kano-frontend/src/components/KanoCategoryPie.vue#L132)

- Slice assembly — exact fractions drive geometry; largest-remainder tenths drive the printed label.
  [`KanoCategoryPie.vue:160`](../../kano-frontend/src/components/KanoCategoryPie.vue#L160)

- Largest-remainder apportionment — guarantees the displayed percentages sum to exactly 100.
  [`KanoCategoryPie.vue:93`](../../kano-frontend/src/components/KanoCategoryPie.vue#L93)

- SVG arc math — clockwise from 12 o'clock; full `<circle>` when one category owns 100%.
  [`KanoCategoryPie.vue:125`](../../kano-frontend/src/components/KanoCategoryPie.vue#L125)

**Rendering & a11y**

- `role="img"` SVG + copy-sourced aria-label; the visible legend carries the numbers as real text.
  [`KanoCategoryPie.vue:196`](../../kano-frontend/src/components/KanoCategoryPie.vue#L196)

**Wiring**

- Pie mounted above the per-category jump-lists, which are left untouched.
  [`PerCategoryPanels.vue:206`](../../kano-frontend/src/components/PerCategoryPanels.vue#L206)

- Incidental fix: `pulseTimers` typed `number` (DOM `window.setTimeout` handle), not Node `Timeout`.
  [`PerCategoryPanels.vue:144`](../../kano-frontend/src/components/PerCategoryPanels.vue#L144)

**Copy**

- New `analysis.pie.*` keys (mirrored into `docs/copy-deck.md` for the sync gate).
  [`en.ts:369`](../../kano-frontend/src/copy/en.ts#L369)

**Tests**

- Arc-geometry assertions — broken arc math now fails (review gap closed).
  [`kano-category-pie.spec.ts:159`](../../kano-frontend/tests/unit/kano-category-pie.spec.ts#L159)

- Largest-remainder / 100%-sum coverage.
  [`kano-category-pie.spec.ts:139`](../../kano-frontend/tests/unit/kano-category-pie.spec.ts#L139)

- Pie mounts above the section lists; existing list/anchor tests unchanged.
  [`per-category-panels.spec.ts:312`](../../kano-frontend/tests/unit/per-category-panels.spec.ts#L312)
