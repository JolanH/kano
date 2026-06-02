# Kano palette — color-vision-deficiency simulator validation (Story 5-4)

> Story 5.4 AC #9 — NFR10 load-bearing artifact: "Kano palette passes
> protanopia / deuteranopia / tritanopia simulator checks."

This document is the Epic 5 NFR10 evidence: the six Kano category swatches
must remain distinguishable for users with the three common color-vision
deficiencies, when rendered side-by-side on the analysis surface (the
`<KanoStackedBar>` + `<CatBadge>` lineup).

## Source-of-truth palette

(See `kano-frontend/src/theme/tixeo.ts` — these hex values feed every
analysis surface via `--v-theme-category-*` CSS vars; never inline.)

| Category      | Theme token       | Hex      | Backend enum    |
|---------------|-------------------|----------|-----------------|
| Must-have     | `category-must`   | #1E3A8A  | `MANDATORY`     |
| Performance   | `category-perf`   | #0D9488  | `LINEAR`        |
| Delighter     | `category-del`    | #7C3AED  | `EXCITER`       |
| Indifferent   | `category-ind`    | #6B7280  | `INDIFFERENT`   |
| Contradictory | `category-cont`   | #B45309  | `CONTRADICTORY` |
| Doubtful      | `category-doub`   | #8F6912  | `DOUBTFUL`      |

Note — the bottom-two suffix vocabulary (`cont` / `doub`, not `rev` /
`que` as the original Story 5-4 spec text referenced) tracks the backend
`Category` enum names per the Story 1-5 (5,1)→D reconciliation.

Doubtful was recolored stone gray `#78716C` → dark goldenrod `#8F6912` on
2026-06-02 because the stone gray was visually indistinguishable from the
cool gray Indifferent (`#6B7280`) for normal vision. See the analytical
breakdown in `docs/accessibility/kano-palette-validation.md` for the CVD
re-validation (Contradictory↔Doubtful remains the marginal, label-reinforced
pair).

## Simulation procedure (Chrome DevTools)

The Chrome DevTools "Emulate vision deficiencies" panel runs the rendered
page through six color-transform filters. Capture each as a PNG.

1. `npm run dev` and open `http://localhost:5173/dev/theme-audit` in
   Chromium.
2. Scroll to **Colors** → the `<CatBadge>` row (Story 5-3 regression
   anchor — six badges, one per category in canonical M→L→E→I→C→D order).
3. Open DevTools → ⋮ menu → More tools → **Rendering**.
4. Scroll to "Emulate vision deficiencies."
5. For each of the six modes — **No emulation**, **Blurred vision**,
   **Reduced contrast**, **Protanopia**, **Deuteranopia**, **Tritanopia**,
   **Achromatopsia** — screenshot the `<CatBadge>` row (or the
   `<KanoStackedBar>` row in the new "Analysis primitives" section, which
   shows the same six colors as adjacent stacked segments — the worst case
   for distinguishability because the swatches share edges).
6. Commit the seven PNGs as `kano-palette-<mode>.png` siblings of this
   markdown.

## PASS criteria

- **PASS** — All six categories remain visually distinguishable under
  protanopia, deuteranopia, and tritanopia. Adjacent pairs in the stacked
  bar (Must↔Perf, Perf↔Del, Del↔Ind, Ind↔Cont, Cont↔Doub) are the worst
  cases.
- **CONDITIONAL PASS** — One or more adjacent pairs collapse visually,
  BUT each segment carries a sibling text label so the failure does not
  block comprehension. UX spec line 580: "color is never the sole
  information carrier" — the analysis surface always pairs each swatch
  with the human-readable category name + percentage.
- **FAIL** — Two non-adjacent categories collapse AND a labelled element
  could be mistaken for the other one (e.g., a screen-reader user toggling
  the table off and back relies on color recognition to scan). If this
  happens, switch the affected token(s) to a more deficiency-safe value
  (UX spec line 501 mentions the Okabe-Ito colorblind-safe palette as a
  substitute candidate).

## Status — analytical PASS, screenshot capture deferred

The analytical / pairwise-simulation validation done in Story 1-6 already
records the palette as **CONDITIONAL PASS**: the Contradictory ↔ Doubtful
pair is marginal under protanopia and deuteranopia (both collapse toward
warm gray), but it does not block comprehension because the bar always
ships paired with the accessible-fallback table and the on-page label
text — see `kano-frontend/docs/accessibility/kano-palette-validation.md`
for the pairwise breakdown.

The Chrome-DevTools-captured PNG evidence is deferred to the manual a11y
sweep that already owes evidence for Stories 2-13 and 4-8 (VoiceOver +
NVDA), batched together so the operator opens the browser once. Tracked
in `_bmad-output/implementation-artifacts/deferred-work.md` against
Story 5-8 (the Epic 5 a11y close-out gate). The functional component
contract (`<KanoStackedBar>` SVG + `<KanoStackedBarTable>` accessible
fallback) and the analytical PASS together discharge NFR10 for code-
review purposes; the captured PNGs close the visual-evidence gap before
the MVP a11y gate.

## Re-validation triggers

Any change to a `category-*` hex in `src/theme/tixeo.ts` MUST re-run this
procedure and update the analytical doc + screenshots. The Story 1-6
validation table is the authoritative pairwise record.
