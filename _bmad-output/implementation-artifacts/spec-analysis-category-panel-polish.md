---
title: 'Analysis category-panel polish: 30/70 layout split + distinct Doubtful color'
type: 'feature'
created: '2026-06-02'
status: 'done'
route: 'one-shot'
---

# Analysis category-panel polish: 30/70 layout split + distinct Doubtful color

## Intent

**Problem:** On the poll-analysis page the "By category" cross-index and the
categories-meaning glossary split the width roughly evenly (flex `480px` vs
`300px`), under-serving the meaning panel; and the Doubtful category swatch
(`#78716C`, warm stone gray) was a near-twin of the Indifferent swatch
(`#6B7280`, cool gray) — the two were almost indistinguishable side-by-side.

**Approach:** Re-split `PerCategoryPanels` into a CSS grid (`3fr / 7fr`) so the
"By category" main column takes 30% and the `KanoCategoryReference` meaning
aside takes 70%; recolor the `category-doub` theme token to a dark goldenrod
(`#8F6912`, ~5:1 on white) so Doubtful is unmistakable from Indifferent while
clearing the WCAG AA contrast floor.

## Suggested Review Order

1. [`kano-frontend/src/theme/tixeo.ts`](../../kano-frontend/src/theme/tixeo.ts) — **the color decision.** `category-doub` `#78716C` → `#8F6912`. A lighter gold (`#c6942c`) was rejected: it measured 2.74:1 and failed `theme-contrast.spec.ts`'s AA floor. The chosen shade is ~5:1.
2. [`kano-frontend/src/components/PerCategoryPanels.vue`](../../kano-frontend/src/components/PerCategoryPanels.vue) — **the layout decision.** Flexbox → `grid-template-columns: 3fr 7fr` (exact 30/70 after the 32px gutter). No stacking media query: the PM surface is hard-gated at 1280px by `PmLayout`, so a sub-720px column would be dead code.
3. [`kano-frontend/src/components/KanoCategoryReference.vue`](../../kano-frontend/src/components/KanoCategoryReference.vue) — follow-on: dropped the now-inert `flex: 0 0 300px` (it's a grid item sized by the parent track now); kept `align-self: start`.
4. [`kano-frontend/docs/accessibility/kano-palette-validation.md`](../../kano-frontend/docs/accessibility/kano-palette-validation.md) + [`kano-frontend/docs/a11y/kano-palette-simulator.md`](../../kano-frontend/docs/a11y/kano-palette-simulator.md) — CVD re-validation (mandatory on any `category-*` hex change). Indifferent↔Doubtful is now unambiguous; Contradictory↔Doubtful stays the marginal, label-reinforced pair (both warm) — same verdict the stone gray carried.

**Verification:** `npx vitest run tests/unit/theme-contrast.spec.ts tests/unit/per-category-panels.spec.ts tests/unit/kano-category-reference.spec.ts tests/unit/cat-badge.spec.ts` — all green; `vue-tsc --noEmit` clean. (ESLint can't load its flat config under Node 20 in this env — pre-existing, unrelated.)
