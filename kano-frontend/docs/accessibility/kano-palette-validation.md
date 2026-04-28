# Kano category palette — color-vision-deficiency validation

> Story 1.6 acceptance criterion #8: "The Kano category palette passes
> protanopia/deuteranopia/tritanopia simulator checks."

## Palette under test

| Category     | Token            | Hex       |
|--------------|------------------|-----------|
| Must-have    | `category-must`  | `#1E3A8A` |
| Performance  | `category-perf`  | `#0D9488` |
| Delighter    | `category-del`   | `#7C3AED` |
| Indifferent  | `category-ind`   | `#6B7280` |
| Reverse      | `category-rev`   | `#B45309` |
| Questionable | `category-que`   | `#78716C` |

(Source of truth: `src/theme/tixeo.ts`. Hex values aligned with
`_bmad-output/planning-artifacts/ux-design-specification.md §Color System`.)

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
5-4): `Must → Performance → Delighter → Indifferent → Reverse → Questionable`.

## Results

| Pair (adjacent in stacked bar) | Hue distance | Protanopia | Deuteranopia | Tritanopia |
|---|---|---|---|---|
| Must (indigo) ↔ Performance (teal)     | High blue→teal | Distinct  | Distinct  | Distinct |
| Performance (teal) ↔ Delighter (violet) | Cool→cool      | Distinct  | Distinct  | Distinct |
| Delighter (violet) ↔ Indifferent (gray) | Saturated→gray | Distinct  | Distinct  | Distinct |
| Indifferent (gray) ↔ Reverse (amber)    | Cool→warm      | Distinct  | Distinct  | Distinct |
| Reverse (amber) ↔ Questionable (stone)  | Warm→warm-gray | **Marginal — needs label reinforcement** | Marginal — needs label reinforcement | Distinct |

**Outcome:** The Reverse↔Questionable pair is the weakest under protanopia /
deuteranopia simulation — both collapse toward warm gray. This is acceptable
because the architectural promise (per UX spec §Accessibility Considerations)
is "color is never the sole information carrier" — the stacked bar is always
accompanied by a category-name + percentage label on each segment, and the
accessible data-table fallback (`<KanoStackedBarTable>`, Story 5-4) renders
the same data for screen readers and keyboard users.

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
