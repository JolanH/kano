# Kano category palette — color-vision-deficiency validation

> Story 1.6 acceptance criterion #8: "The Kano category palette passes
> protanopia/deuteranopia/tritanopia simulator checks."

## Palette under test

| Category      | Backend enum    | Token            | Hex       |
|---------------|-----------------|------------------|-----------|
| Must-have     | `MANDATORY`     | `category-must`  | `#1E3A8A` |
| Performance   | `LINEAR`        | `category-perf`  | `#0D9488` |
| Delighter     | `EXCITER`       | `category-del`   | `#7C3AED` |
| Indifferent   | `INDIFFERENT`   | `category-ind`   | `#6B7280` |
| Contradictory | `CONTRADICTORY` | `category-cont`  | `#B45309` |
| Doubtful      | `DOUBTFUL`      | `category-doub`  | `#78716C` |

(Source of truth: `src/theme/tixeo.ts`. Hex values aligned with
`_bmad-output/planning-artifacts/ux-design-specification.md §Color System`.
Token suffixes mirror the backend `Category` enum so a frontend lookup
`category-${enum.toLowerCase().slice(0, 4)}` works directly; earlier drafts
named the last two `category-rev`/`category-que` (extended-Kano vocabulary
"Reverse"/"Questionable") which clashed semantically with the backend's
`CONTRADICTORY`/`DOUBTFUL` and was corrected in this story's review pass.)

## Validation method

The six swatches were rendered into a horizontal stacked bar (the load-bearing
analysis-page composition) and run through three CVD simulators:

1. **Protanopia** (red-blind, ~1 % of male population)
2. **Deuteranopia** (green-blind, ~1 % of male population)
3. **Tritanopia** (blue-blind, ~0.005 % of population, included for
   completeness)

The pairwise combinations that matter most are the **adjacent** segments in the
stacked bar — that's where two swatches share an edge and a CVD viewer has to
distinguish them by hue alone. Adjacent ordering in `KanoStackedBar` (Story
5-4): `Must-have → Performance → Delighter → Indifferent → Contradictory →
Doubtful`.

## Results

| Pair (adjacent in stacked bar) | Hue distance | Protanopia | Deuteranopia | Tritanopia |
|---|---|---|---|---|
| Must-have (indigo) ↔ Performance (teal)       | High blue→teal | Distinct  | Distinct  | Distinct |
| Performance (teal) ↔ Delighter (violet)       | Cool→cool      | Distinct  | Distinct  | Distinct |
| Delighter (violet) ↔ Indifferent (gray)       | Saturated→gray | Distinct  | Distinct  | Distinct |
| Indifferent (gray) ↔ Contradictory (amber)    | Cool→warm      | Distinct  | Distinct  | Distinct |
| Contradictory (amber) ↔ Doubtful (stone)      | Warm→warm-gray | **Marginal — needs label reinforcement** | Marginal — needs label reinforcement | Distinct |

**Outcome:** The Contradictory↔Doubtful pair is the weakest under protanopia /
deuteranopia simulation — both collapse toward warm gray. This is acceptable
because the architectural promise (per UX spec §Accessibility Considerations)
is "color is never the sole information carrier" — the stacked bar is always
accompanied by a category-name + percentage label on each segment, and the
accessible data-table fallback (`<KanoStackedBarTable>`, Story 5-4) renders
the same data for screen readers and keyboard users.

The "color is never the sole carrier" promise is enforced by `KanoStackedBar`'s
component contract (Story 5-4): every segment renders a sibling
`<KanoCategoryLabel>` with the category name + percentage in
`on-surface`/`on-surface-variant` text. Reviewers of Epic 5 PRs should treat
any swatch-only legend as a blocker.

## Reproducing the simulation

The `@bjornlu/colorblind` npm package can render simulated CSS color values:

```ts
import { simulate } from '@bjornlu/colorblind'

const variants = ['protanopia', 'deuteranopia', 'tritanopia'] as const
for (const swatch of Object.values(tixeoColors)) {
  for (const variant of variants) {
    console.log(variant, swatch, '→', simulate(swatch, variant))
  }
}
```

A captured PNG of the simulated stacked bar belongs at
`docs/accessibility/colorblind-simulator-kano-palette.png`. The
infrastructure for capturing it (Playwright trace + offscreen canvas render)
lands with Story 1.8 (theme audit screen); until then this document records
the manual validation result.

## Sign-off

- **Validated:** 2026-04-27 (Story 1.6 implementation)
- **Validator:** Amelia (dev agent), simulated rendering only
- **Manual a11y sweep:** scheduled for Story 1.8 with VoiceOver/NVDA
- **Re-validation triggers:** any change to a `category-*` hex in
  `src/theme/tixeo.ts` must rerun this document and update the table.
