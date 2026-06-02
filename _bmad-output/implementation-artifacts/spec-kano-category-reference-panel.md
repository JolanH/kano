---
title: 'Kano category reference panel beside the "By category" section'
type: 'feature'
created: '2026-06-01'
status: 'in-review'
context: []
baseline_commit: 'aed0e5fd32a91ebacfff7e887d574fed26768d09'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "By category" section (`PerCategoryPanels`) shows the repartition pie and per-category jump-lists, but a PM reading it has no on-page explanation of what each Kano category actually *means*. The only definitions live in transient first-use `<CatBadge>` tooltips — easy to miss, gone on blur.

**Approach:** Add a standing reference panel to the right of the "By category" content listing all six Kano categories in canonical order — each with its theme color swatch, its name, and a short, Kano-faithful description (researched against standard Kano literature, kept consistent with this product's own semantics for Contradictory / Doubtful). The existing pie + jump-lists become the left/main column; the reference is a right-hand `<aside>` that stacks below on narrow viewports. No data dependency — the reference is static glossary content.

## Boundaries & Constraints

**Always:**
- Render **all six** categories iterating the canonical `CATEGORY_CODES` (M→L→E→I→C→D) order, regardless of which categories the poll's features fall into — this is a glossary, not a data view.
- Reuse the existing `--v-theme-category-*` color tokens (declare local `swatch-*` `fill`/`background` classes per the component-local convention) and the existing `COPY_KEY` category names. Swatches are decorative (`aria-hidden`); name + description are the accessible channel.
- All user-visible strings come from the copy deck (`src/copy/en.ts`) and are mirrored into `docs/copy-deck.md` (the `useCopy.spec.ts` bidirectional sync gate). No inline literals.
- Descriptions of **Contradictory** and **Doubtful** must match this product's matrix semantics (C = the respondent's paired answers contradict each other / inconclusive; D = an extreme or questionable answer pattern), not the textbook "Reverse" reading the product does not model.

**Ask First:**
- Rewording or shortening the existing `pm.category.help.*` `<CatBadge>` tooltip copy (Story 5-7) — this feature adds a separate, fuller description namespace and leaves the tooltips alone.
- Changing the `analysis.panels.heading` ("By category") text, or adding a charting/layout dependency.

**Never:**
- Do not remove, reorder, or alter the pie (`KanoCategoryPie`) or the per-category jump-lists / anchors / pulse behavior.
- Do not gate the reference on per-category feature counts — it always lists all six.
- Do not mount on the zero-data path (it lives inside `PerCategoryPanels`, already guarded by `panels.length > 0`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard render | any non-empty analysis | exactly 6 rows, M→L→E→I→C→D order, each = swatch + name + description | N/A |
| Category absent from poll | e.g. no Delighter features | Delighter row still present (glossary, not data) | N/A |
| Screen reader | aside reached | announced via its labelled heading; each name + description read as text; swatch skipped (`aria-hidden`) | N/A |
| Narrow viewport | container below the two-column breakpoint | reference stacks below the pie + lists, full width | N/A |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/components/KanoCategoryReference.vue` -- NEW. Presentational, prop-less. Iterates `CATEGORY_CODES`; renders swatch (local `swatch-*` class → `--v-theme-category-*`) + `copy(COPY_KEY[cat])` name + `copy(DESC_KEY[cat])` description, under a heading.
- `kano-frontend/src/components/kano-categories.ts` -- add `DESC_KEY: Record<Category, CopyKey>` mapping each code to its `analysis.categoryRef.desc.*` key (mirrors the existing `COPY_KEY` / `HELP_KEY` pattern).
- `kano-frontend/src/components/PerCategoryPanels.vue` -- wrap the pie + `v-for` sections in a `.panels-main` column; add `<KanoCategoryReference />` as a sibling `.panels-reference` aside inside a flex `.panels-layout`. Pie/lists untouched.
- `kano-frontend/src/copy/en.ts` -- add `analysis.categoryRef.heading` + `analysis.categoryRef.desc.{must,perf,del,ind,cont,doub}`.
- `docs/copy-deck.md` -- document the new keys (sync gate).
- `kano-frontend/tests/unit/kano-category-reference.spec.ts` -- NEW. Order, all-six-present, copy sourcing, swatch `aria-hidden`.
- `kano-frontend/tests/unit/per-category-panels.spec.ts` -- stub `KanoCategoryReference`, assert it mounts; existing pie/list/anchor assertions still pass.

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- added `analysis.categoryRef.heading` and the six `analysis.categoryRef.desc.*` descriptions (researched, Kano-faithful, C/D matching product semantics).
- [x] `docs/copy-deck.md` -- added a "Kano category reference panel" section + a table row per new key (bidirectional sync gate).
- [x] `kano-frontend/src/components/kano-categories.ts` -- added `DESC_KEY` record typed against `CopyKey`.
- [x] `kano-frontend/src/components/KanoCategoryReference.vue` -- new prop-less component; iterates `CATEGORY_CODES`, renders swatch + name + description in a `<dl>`, labelled `<aside>` with heading from `analysis.categoryRef.heading`. Swatch `aria-hidden`; local `swatch-*` → `--v-theme-category-*` rules.
- [x] `kano-frontend/src/components/PerCategoryPanels.vue` -- restructured into `.panels-layout` flexbox (main column = pie + sections; aside = reference); wraps to full-width stack on narrow viewports without a media query.
- [x] `kano-frontend/tests/unit/kano-category-reference.spec.ts` -- asserts 6 rows in canonical order, names + descriptions sourced from copy, swatches `aria-hidden`, aside labelled by its heading.
- [x] `kano-frontend/tests/unit/per-category-panels.spec.ts` -- stubs the reference, asserts it mounts alongside the pie + section lists.

**Acceptance Criteria:**
- Given any poll with at least one dominant category, when the "By category" section renders, then a reference panel sits to the right (stacking below on narrow viewports) listing all six categories in M→L→E→I→C→D order, each with its theme color swatch, name, and a short description.
- Given a screen reader, when it reaches the reference, then each category name and description is read as real text and the color swatches are skipped (`aria-hidden`).
- Given the reference is present, when the user inspects the pie and jump-lists, then they render unchanged with anchors and pulse behavior intact.
- Given the existing `<CatBadge>` first-use tooltips, when this feature ships, then their `pm.category.help.*` copy is unchanged (the reference uses its own description namespace).

## Design Notes

Two separate description surfaces is intentional, not duplication: `pm.category.help.*` is a terse ≤2-line first-use nudge on `<CatBadge>` (Story 5-7); `analysis.categoryRef.desc.*` is a standing glossary entry with room for a fuller, Kano-textbook-grounded sentence. Different length budgets, different surfaces — kept apart so neither constrains the other.

Researched descriptions (Kano literature, reconciled with this product's matrix):
- must: basic expectation — absence strongly dissatisfies, presence taken for granted (price of entry).
- perf: linear — satisfaction rises/falls in proportion to how well it's delivered ("more is better").
- del: unexpected extra — not asked for, but its presence sparks delight and differentiates.
- ind: users unmoved either way; presence or absence barely moves satisfaction.
- cont: respondents' paired answers worked against each other → no stable preference; inconclusive.
- doub: an extreme/unlikely answer pattern; signal is questionable until more responses arrive.

## Verification

**Commands:**
- `npm run test:unit` -- expected: new `kano-category-reference` spec passes; updated `per-category-panels` + `useCopy` (sync gate) specs pass; no regressions.
- `npm run type-check` -- expected: clean (vue-tsc); `DESC_KEY` typed against `CopyKey`.

**Manual checks:**
- Open the analysis page for a poll with data; confirm the reference sits to the right of the pie + lists, lists all six categories with matching swatch colors, and stacks below the content when the window is narrowed.
