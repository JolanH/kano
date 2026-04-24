# Story 5.4: KanoStackedBar SVG with KanoStackedBarTable accessible fallback

Status: ready-for-dev

## Story

As a PM reading the analysis,
I want a `<KanoStackedBar>` SVG showing the per-feature category distribution plus an accompanying `<KanoStackedBarTable>` hidden from sighted users but fully available to screen readers,
so that I can see the distribution at a glance AND users of assistive tech get the same information via a tabular reading.

## Acceptance Criteria

1. **Given** `<KanoStackedBar :distribution="d" :total="n" :aria-labelled-by="'stb-42'" variant="default" />` is rendered with a non-empty distribution (at least one category with count > 0), **when** the component mounts, **then** an inline `<svg>` renders 6 proportional horizontal segments in the **fixed order** Must-have → Performance → Delighter → Indifferent → Reverse → Questionable (M → L → E → I → C → D), using Kano palette tokens from the theme (same tokens consumed by `<CatBadge>` from Story 5.3). The `default` variant is 12 px tall; `large` is 16 px; `mini` is 4 px.
2. **Given** the component is rendered, **when** the DOM is inspected, **then** the outer `<svg>` carries `role="img"` and `aria-labelledby="<id-of-companion-table>"` — the caller passes the companion table's `id` via the `aria-labelled-by` prop; the component never auto-generates the table or its id (separation of concerns — see Dev Notes).
3. **Given** each segment, **when** keyboard focus lands on it, **then** the segment has `tabindex="0"` and shows a visible focus ring (2 px Tixeo primary outline, 3:1 contrast against both adjacent backgrounds per UX spec line 581); mouse hover and keyboard focus both trigger an identical `v-tooltip` showing `"<Category name>: N responses (X%)"` — all strings from the copy deck (no inline literals).
4. **Given** `<KanoStackedBarTable :distribution="d" :total="n" :id="'stb-42'" />` is rendered as a sibling of the bar, **when** it mounts, **then** it renders a `<table>` with `<thead>` Category | Count | Percentage and 6 `<tbody>` rows (one per category in the fixed M→L→E→I→C→D order), populated from the same `distribution` + `total` props. The table carries the caller-supplied `id` matching the `<KanoStackedBar>`'s `aria-labelledby`.
5. **Given** the table is rendered in its default state, **when** the DOM is inspected, **then** the root `<table>` is hidden from sighted users via the screen-reader-only CSS class (`clip: rect(0 0 0 0); width: 1px; height: 1px; position: absolute; overflow: hidden; white-space: nowrap;`) but remains in the accessibility tree. Screen readers announce it when the companion bar's SVG gains focus.
6. **Given** `<KanoStackedBarTable :visible="true" ...>`, **when** the `visible` prop is true, **then** the SR-only class is removed and the table renders as a standard visible `v-data-table` styled via Vuetify tokens. An optional `<ToggleDataTable>` sibling affordance in Story 5.5 toggles this prop for sighted-user-preference; this story ships the **capability**, Story 5.5 wires the toggle.
7. **Given** a distribution with `total > 0` and some categories at 0 count, **when** the bar renders, **then** zero-count segments do **not** render as invisible 0-width rects — they are **omitted from the SVG entirely** (no wasted focus target, no empty tooltip). Conversely, the `<KanoStackedBarTable>` **always** shows all 6 rows including zeros (tabular reading needs the full category list for completeness).
8. **Given** a distribution with `total == 0` (empty state), **when** either component renders, **then** both return **empty markup** — the page-level empty state from Story 5.5 / FR37 replaces the bar entirely, so neither the bar nor the table should render in the zero-submissions case. A dev-mode `console.warn` fires if either is mounted with `total == 0` (anti-pattern safety net).
9. **Colorblind validation**: Kano palette (Story 5.3 tokens) passes protanopia / deuteranopia / tritanopia simulator checks, validated via a committed artifact — a screenshot or generated simulator image at `kano-frontend/docs/a11y/kano-palette-simulator.png` (or `.md` with embedded screenshots). Use Chromium DevTools' "Emulate vision deficiencies" feature on the theme-audit `<CatBadge>` row OR the [Colorblindly browser extension](https://chromewebstore.google.com/detail/colorblindly) on the analysis page; attach the resulting PNG. This is the load-bearing NFR10 evidence; Story 5.3's palette tokens are validated **here**.
10. Vitest unit tests (`KanoStackedBar.spec.ts` + `KanoStackedBarTable.spec.ts`):
    - Bar: renders exactly N non-zero segments in M→L→E→I→C→D order; each segment's width is proportional to its count / total; `role="img"` present; each segment has `tabindex="0"`; all 3 variants render at the correct height; empty distribution returns empty markup + warns
    - Table: renders 6 rows regardless of distribution; row order is fixed M→L→E→I→C→D; percentages are computed from count/total with 1-decimal rounding matching Story 5.1's service-layer rounding (e.g., 33.3, 66.7); `visible` prop toggles the SR-only class
    - Shared: both consume the same `useCopy` keys; no inline literals
11. **NFR10 integration**: both components together render a `<KanoStackedBar>` + `<KanoStackedBarTable>` pairing in the Story 1.8 theme-audit page with a known distribution so visual regression + SR-only behavior is captured by Story 1.8's baseline screenshot and axe-core run.

## Tasks / Subtasks

- [ ] `src/components/KanoStackedBar.vue` (AC: #1, #2, #3, #7, #8)
  - [ ] Props interface:
    ```ts
    interface Props {
      distribution: Record<Category, number>  // full 6 keys, API guarantees all 6 per Story 5.2 AC #2
      total: number
      ariaLabelledBy: string                  // id of the companion KanoStackedBarTable
      variant?: 'default' | 'large' | 'mini'  // default 'default'
    }
    ```
  - [ ] Template:
    ```vue
    <template>
      <svg
        v-if="total > 0"
        :class="['kano-stacked-bar', `variant-${variant ?? 'default'}`]"
        :viewBox="`0 0 ${totalWidth} ${height}`"
        preserveAspectRatio="none"
        role="img"
        :aria-labelledby="ariaLabelledBy"
      >
        <g v-for="seg in segments" :key="seg.category">
          <v-tooltip :text="seg.tooltip" location="top">
            <template #activator="{ props: tipProps }">
              <rect
                v-bind="tipProps"
                :x="seg.x"
                :width="seg.width"
                y="0"
                :height="height"
                :class="`fill-${seg.category.toLowerCase()}`"
                :tabindex="0"
                :data-category="seg.category"
              />
            </template>
          </v-tooltip>
        </g>
      </svg>
    </template>
    ```
  - [ ] Computed `segments`: iterate `FIXED_ORDER = ['M','L','E','I','C','D']`, skip categories where `distribution[cat] === 0`, accumulate `x` offset, compute `width = distribution[cat] / total * 100` (percent-based viewBox; see Dev Notes on why percent). Build tooltip string via `copy('analysis.stackedBar.tooltip', { name: label, count: n, pct: pctString })`.
  - [ ] Variant height: `default=12, large=16, mini=4`. `totalWidth` is always 100 (the viewBox is normalized to 100 × height; the SVG stretches to fill its container via CSS `width: 100%`).
  - [ ] Dev-mode empty-state warning:
    ```ts
    if (import.meta.env.DEV && props.total === 0) {
      console.warn('[KanoStackedBar] mounted with total=0; parent should render empty state, not the bar.')
    }
    ```
  - [ ] Scoped styles use theme-token colors:
    ```css
    .fill-m { fill: var(--v-theme-kano-must); }
    .fill-l { fill: var(--v-theme-kano-perf); }
    .fill-e { fill: var(--v-theme-kano-del); }
    .fill-i { fill: var(--v-theme-kano-ind); }
    .fill-c { fill: var(--v-theme-kano-rev); }
    .fill-d { fill: var(--v-theme-kano-que); }
    .variant-default { height: 12px; width: 100%; }
    .variant-large   { height: 16px; width: 100%; }
    .variant-mini    { height:  4px; width: 100%; }
    rect:focus-visible { outline: 2px solid var(--v-theme-primary); outline-offset: 1px; }
    ```
- [ ] `src/components/KanoStackedBarTable.vue` (AC: #4, #5, #6, #8)
  - [ ] Props interface:
    ```ts
    interface Props {
      distribution: Record<Category, number>
      total: number
      id: string         // referenced by KanoStackedBar.ariaLabelledBy
      visible?: boolean  // default false (SR-only)
    }
    ```
  - [ ] Template — render a plain HTML `<table>` (not `v-data-table`; overkill for 6 rows and pulls in extra dependencies):
    ```vue
    <template>
      <table
        v-if="total > 0"
        :id="id"
        :class="['kano-stacked-bar-table', { 'sr-only': !visible }]"
      >
        <thead>
          <tr>
            <th>{{ copy('analysis.stackedBarTable.col.category') }}</th>
            <th>{{ copy('analysis.stackedBarTable.col.count') }}</th>
            <th>{{ copy('analysis.stackedBarTable.col.percentage') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.category">
            <td>{{ row.label }}</td>
            <td class="tabular-num">{{ row.count }}</td>
            <td class="tabular-num">{{ row.pct }}%</td>
          </tr>
        </tbody>
      </table>
    </template>
    ```
  - [ ] Computed `rows`: iterate `FIXED_ORDER` (all 6, including zeros); for each, `count = distribution[cat]`, `pct = round(count / total * 100, 1).toFixed(1)` — matches Story 5.1's service-layer rounding rule (Dev Notes line there).
  - [ ] SR-only CSS class — define once in a shared location (`src/styles/a11y.scss` or inside the component's scoped style; prefer the shared location if another component later needs it):
    ```css
    .sr-only {
      clip: rect(0 0 0 0);
      width: 1px;
      height: 1px;
      position: absolute;
      overflow: hidden;
      white-space: nowrap;
      border: 0;
      padding: 0;
      margin: -1px;
    }
    ```
  - [ ] Dev-mode empty-state warning symmetric with the bar.
- [ ] Copy-deck extensions (AC: #3, #10)
  - [ ] `src/copy/en.ts` — add:
    - `analysis.stackedBar.tooltip` — `"{name}: {count} responses ({pct}%)"` (uses `useCopy`'s `{variable}` interpolation from Story 1.7)
    - `analysis.stackedBarTable.col.category` — `"Category"`
    - `analysis.stackedBarTable.col.count` — `"Count"`
    - `analysis.stackedBarTable.col.percentage` — `"Percentage"`
  - [ ] Category label keys (`pm.category.must` etc.) come from Story 1.7 / 5.3; reuse via `useCopy(COPY_KEY[cat])` — do NOT hard-code category names in this story's code.
- [ ] Vitest unit specs (AC: #10)
  - [ ] `src/components/KanoStackedBar.spec.ts`:
    - Mount with `{ M: 3, L: 2, E: 0, I: 0, C: 0, D: 0 }, total: 5` → assert exactly 2 `<rect>` elements, first with `data-category="M"` width 60 (3/5), second with `data-category="L"` width 40
    - Order check: mount with all 6 categories non-zero → assert `data-category` attributes appear in order M, L, E, I, C, D regardless of object-key insertion order in the prop
    - `role="img"` + `aria-labelledby` wired correctly
    - Each segment has `tabindex="0"`
    - Tooltip text matches copy-deck interpolation for a known input
    - Empty distribution (`total: 0`): assert markup is empty; assert `console.warn` called (via `vi.spyOn(console, 'warn')`)
    - Variants: `default`, `large`, `mini` render with correct heights (via computed CSS class match)
  - [ ] `src/components/KanoStackedBarTable.spec.ts`:
    - Always 6 rows regardless of which categories are zero
    - Row order fixed M → L → E → I → C → D
    - Percentage rounding: `{ M: 1, L: 1, E: 1 }, total: 3` → each row shows `33.3%`
    - `visible=false` (default): root element has `sr-only` class
    - `visible=true`: `sr-only` class absent
    - `id` prop surfaces on root `<table>` element
    - Empty distribution: empty markup + warn
  - [ ] Mock `useCopy` via the existing test-setup pattern; verify no bare strings leak into rendered output
- [ ] Colorblind-palette validation (AC: #9)
  - [ ] `kano-frontend/docs/a11y/kano-palette-simulator.md` (or `.png`):
    - Run `npm run dev`, navigate to `/dev/theme-audit`, find the CatBadge row (from Story 5.3 AC #5)
    - Open Chrome DevTools → Rendering → Emulate vision deficiencies
    - For each of: Blurred vision / Reduced contrast / Protanopia / Deuteranopia / Tritanopia / Achromatopsia — capture a screenshot of the 6 CatBadges side-by-side
    - Compose into a single image or a `.md` file with embedded screenshots
    - Visual judgment call: the 6 categories must remain distinguishable under protanopia, deuteranopia, and tritanopia. If two categories collapse visually, flag it here and open a follow-up; the analysis-page experience degrades but is not blocked (text labels carry the meaning per AC #3 of Story 5.3). If all 6 remain distinct, mark the validation `PASS` in the doc.
  - [ ] Commit the artifact. Reference it from Story 5.8's a11y close-out.
- [ ] Theme-audit extension (AC: #11)
  - [ ] Extend `src/routes/dev/ThemeAudit.vue` (Story 1.8) with a new "Analysis primitives" section:
    ```vue
    <section>
      <h2>Analysis primitives</h2>
      <KanoStackedBar
        :distribution="{ M: 7, L: 2, E: 1, I: 0, C: 0, D: 0 }"
        :total="10"
        aria-labelled-by="theme-audit-stb"
      />
      <KanoStackedBarTable
        :distribution="{ M: 7, L: 2, E: 1, I: 0, C: 0, D: 0 }"
        :total="10"
        id="theme-audit-stb"
        :visible="true"
      />
    </section>
    ```
  - [ ] Re-baseline the visual-regression screenshot if the theme-audit layout changes materially.
- [ ] Accessibility spot-check in CI
  - [ ] If Story 1.8's theme-audit E2E already runs axe-core on the page (it does per AC #7), the new Analysis primitives section is covered by extension — no new E2E file needed. The integration-level a11y check on the live analysis page is Story 5.8.

## Dev Notes

### Why the caller owns the `id` (aria-labelledby coupling)

Vue encourages self-contained components, but `aria-labelledby` inherently couples two DOM elements by `id`. The component pair accepts the `id` from the caller for three reasons:

1. **Multiple pairs on one page**: Story 5.5 renders one `<KanoStackedBar>` per table row. If each component auto-generated its own `id` internally, pairing them would be awkward (shared refs, provide/inject, etc.).
2. **Avoid id collisions**: auto-generated ids via `useId()` are unique per-mount but not human-debuggable. A caller like `stb-<feature_key>` is both unique and meaningful.
3. **Accessibility-test clarity**: the wiring is explicit in the parent, so a reader inspecting the analysis page sees `aria-labelledby` → `id` relationships at the composition site, not buried in child components.

Caller pattern in Story 5.5:
```vue
<KanoStackedBar
  :distribution="f.distribution"
  :total="analysis.total_submissions"
  :aria-labelled-by="`stb-${f.feature_key}`"
/>
<KanoStackedBarTable
  :distribution="f.distribution"
  :total="analysis.total_submissions"
  :id="`stb-${f.feature_key}`"
/>
```

### Why the bar skips zero segments but the table shows all 6 rows

**Bar**: a 0-width rect is invisible anyway; adding `tabindex="0"` to it would create an invisible keyboard trap ("Tab, Tab, Tab — what just got focused?"). Worse, a per-segment tooltip on a 0-count category ("Delighter: 0 responses (0%)") is noise that the sighted user doesn't need.

**Table**: the accessible contract is *tabular*. A screen reader announces "row 4 of 6, Indifferent, 0, 0.0%" — the full 6-row structure communicates completeness and the zero itself is informative (you're being told *explicitly* that no one indifferenced the feature). Hiding zero rows in the table would mirror the bar's elision but lose that explicit signal.

Document both in the component docstrings — this is an easy mistake to "correct" later.

### Why percent-based viewBox

`viewBox="0 0 100 12"` normalizes the SVG coordinate system so segment widths are percentages directly (`x: 0, width: 60` is "the first 60% of the bar"). The outer `<svg>` uses `width: 100%` CSS to stretch to its container. This sidesteps the need to know the container's pixel width and makes the SVG responsive for free.

`preserveAspectRatio="none"` is critical: without it, the default `xMidYMid meet` would letterbox the bar when the container aspect differs from 100:12.

### Why plain `<table>`, not `v-data-table`

`v-data-table` is a rich Vuetify component with sorting, pagination, row-selection, density variants — all of which would be misapplied here. The accessible-fallback table has 6 fixed rows, no interactivity, no sorting. A plain `<table>` is:
- Smaller (avoids pulling `v-data-table` into a bundle where we're already tight on budget)
- Semantically equivalent (a `<table>` is what SRs read; Vuetify's wrapper adds nothing)
- Easier to style with the SR-only pattern (the SR-only CSS applies cleanly without Vuetify-internal class interference)

Story 5.5's **analysis page composition** uses `v-data-table` for the outer features-list table — that one has multiple columns, potential row interactions, and benefits from Vuetify's affordances. Different level of complexity.

### Fixed M → L → E → I → C → D order — THE visual contract

UX spec line 1277 pins this order. It's not alphabetical, not frequency-sorted, not semantically-clustered — it's the Kano textbook's canonical order. Every surface that renders the 6 categories (bar, table, CatBadge lineup in theme-audit, per-category panels in Story 5.6) MUST use this order. Deviations break visual scan-consistency across the analysis page.

Represent it as a module-level constant in both components:
```ts
const FIXED_ORDER: Category[] = ['M', 'L', 'E', 'I', 'C', 'D']
```
Sort any input against this array; never sort by distribution count or alphabetical category name.

### Focus-ring contrast

The segment `focus-visible` outline is 2 px Tixeo primary (`#E36A2F`) — per UX spec line 581, focus rings must hit 3:1 contrast against **both** adjacent backgrounds. When focus lands on a Must-have segment (indigo-800, `#1E3A8A`), the orange outline needs to contrast against indigo on one side and whatever's next (teal-600 or the page surface) on the other. Orange vs indigo: high contrast. Orange vs teal-600: hue-distinct; compute the luminance ratio before locking — if it fails 3:1, fall back to a black outline with a white shadow (browser default "double-ring" pattern) OR a 2 px orange + 1 px white inner ring.

**Assertion**: the AC calls for "visible focus ring meeting 3:1" but doesn't prescribe the exact implementation. If the simple outline fails the ratio, pick a composed pattern; document the choice in a code comment.

### Colorblind-simulator evidence is THE NFR10 load-bearing artifact

NFR10's literal text: "accessible data-table fallback." The fallback is this story's `<KanoStackedBarTable>`. The **color-independence** commitment from UX spec line 497 ("Test with a color-blindness simulator...Adjust any categories that collapse visually in the stacked bar") lands here too. Both artifacts (the table component + the simulator screenshot) must ship in this story. If either is missing, the analysis experience fails NFR10 review.

Do NOT defer the simulator to Story 5.8 — 5.8 is the a11y close-out, but the palette decision is made here. If the simulator shows two categories collapse, you fix the palette here (coordinate with UX spec §Color System — "Consider the Okabe-Ito colorblind-safe palette as a substitute" per line 501), not in 5.8.

### Tabular numerals for the percentage column

The `.tabular-num` CSS class applies `font-feature-settings: "tnum"` to make digits fixed-width. Prevents "33.3" and "100.0" from misaligning in the right-aligned percentage column. Tixeo's base typography config (Story 1.6) may already enable tabular numerals on specific tokens; verify and reuse if so.

### Rounding must match Story 5.1

Story 5.1 rounds `dominant_percentage` to 1 decimal with standard (round-half-to-even) `round()`. The table here must produce the same visible output for the **same** distribution — e.g., a feature with `{ M: 1, L: 1, E: 1 }` total=3 shows `33.3%` in the Dominant cell (via Story 5.5 using the service-computed `dominant_percentage`) and shows `33.3%` in the table rows for M, L, and E individually. Divergence between these two paths would be a trust-breaking inconsistency.

The rounding happens independently in two places:
1. Service-layer `_dominant()` in Story 5.1 (Python `round(x, 1)`)
2. Client-side percentage computation in this story (`Number(x).toFixed(1)`)

`toFixed` and Python's `round` agree on most values but can diverge on half-cases due to floating-point representation. Add a shared unit test in this story that exercises the same inputs against both paths and asserts equality to 1-decimal precision. Candidates: `33.333...`, `66.666...`, `16.666...`, `83.333...`. If they diverge, document the discrepancy and pick one as authoritative (the service-computed value when available; this component's output elsewhere).

### Not in scope

- Page-level analysis composition (table of features, per-feature rows) — Story 5.5
- Per-category cross-index panels — Story 5.6
- First-use tooltips on CatBadge — Story 5.7 (stacked-bar segment tooltips ARE in scope here per AC #3)
- Performance under load — Story 5.8 (component-level rendering is cheap; the NFR1 gate is end-to-end)
- Printable / export variants — post-MVP (Paola's workflow is screenshot-based per UX spec line 706–728)

### Project Structure Notes

Files:
- `kano-frontend/src/components/KanoStackedBar.vue` (new)
- `kano-frontend/src/components/KanoStackedBar.spec.ts` (new)
- `kano-frontend/src/components/KanoStackedBarTable.vue` (new)
- `kano-frontend/src/components/KanoStackedBarTable.spec.ts` (new)
- `kano-frontend/src/copy/en.ts` (extend — tooltip template + 3 table column labels)
- `kano-frontend/src/styles/a11y.scss` (new, or colocated scoped — `.sr-only` class if not already present)
- `kano-frontend/src/routes/dev/ThemeAudit.vue` (extend — Analysis primitives section)
- `kano-frontend/docs/a11y/kano-palette-simulator.md` or `.png` (new — colorblind simulator evidence)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR33, FR34, FR35, FR37] — stacked bar, dominant + %, tie rendering, empty state
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG AA, accessible fallback, axe-core
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — "Analysis-page `<kano-stacked-bar>` SVG rendered inline, no charting library" (line 406)
- [Source: _bmad-output/planning-artifacts/architecture.md#Accessibility] — ARIA defaults, axe-core gate, focus rings, keyboard parity (lines 408–412)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color System] — Kano palette hex tokens + colorblind-simulator requirement (lines 482–501)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Custom Components] — `<kano-stacked-bar>` + `<kano-stacked-bar-table>` specs (lines 835–854)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — color never sole signal; focus-ring contrast (lines 580–581)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — original AC
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — `useCopy` + `{variable}` interpolation pattern
- [Source: _bmad-output/implementation-artifacts/1-8-theme-audit-screen-as-day-zero-verification-artifact.md] — theme-audit extension + Playwright visual baseline
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — composed component precedent (token-driven styling, Vitest)
- [Source: _bmad-output/implementation-artifacts/5-1-services-analysis-build-analysis-with-single-group-by-query.md] — `distribution` shape contract (all 6 keys always present); rounding convention
- [Source: _bmad-output/implementation-artifacts/5-2-public-poll-analysis-endpoint.md] — API-level confirmation that `distribution` arrives with all 6 keys
- [Source: _bmad-output/implementation-artifacts/5-3-catbadge-component-for-kano-category-rendering.md] — theme tokens (`--v-theme-kano-*`); palette reuse; fixed color-letter mapping

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
