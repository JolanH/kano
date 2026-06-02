# Story 5.6: PerCategoryPanels secondary cross-index

Status: done

## Story

As Paola,
I want a secondary cross-index below the analysis table listing features grouped under the category for which they are dominant,
so that I can answer "which features are Must-have?" with a vertical scan instead of a grid search.

## Acceptance Criteria

1. **Given** `<PerCategoryPanels :analysis="analysis" />` is rendered beneath the analysis table (Story 5.5) with `analysis.total_submissions > 0`, **when** the component mounts, **then** it renders **one `<section>` panel per Kano category that has ≥ 1 feature for which it is dominant** (FR36). The fixed presentation order is Must-have → Performance → Delighter → Indifferent → Reverse → Questionable (M → L → E → I → C → D) — same order as `<KanoStackedBar>` and `<KanoStackedBarTable>` from Story 5.4.
2. **Given** a category has zero features where it is dominant, **when** the component renders, **then** that category's panel is **omitted entirely** — not rendered as an empty section, not rendered with a placeholder. Zero-dominant-feature categories consume zero DOM.
3. **Given** a panel renders, **when** its header is inspected, **then** it is a `<h3>` containing a `<CatBadge :category="cat" />` inline with the category name text. The `<CatBadge>` supplies the color swatch + human-readable name per Story 5.3's contract — the `<h3>` itself adds no duplicate text beyond the badge's label.
4. **Given** a panel body, **when** inspected, **then** it is a `<ul>` of `<li>` entries — one per feature for which this category is dominant. Each `<li>` contains: (a) the feature name, (b) the feature's `dominant_percentage` rendered as "71%" (integer if exact, 1 decimal otherwise — same rounding rule as Story 5.1 / 5.5), (c) an anchor link (`<a href="#feature-{feature_key}">`) that jumps to the corresponding row in the analysis table above.
5. **Given** a feature is tied-dominant across multiple categories (`dominant_categories.length > 1`), **when** the panels render, **then** the feature **appears in each tied category's panel** (no deduplication across panels) — FR35 treatment. Example: feature X tied 50% Must-have / 50% Performance appears in BOTH the Must-have panel and the Performance panel, with "50%" as its percentage in each.
6. **Given** each feature row in `<AnalysisTable>` (Story 5.5), **when** the table is extended for this story, **then** each row carries a stable `id="feature-{feature_key}"` on its `<tr>` element so the cross-index anchor links resolve. Adding this `id` is part of THIS story's scope (Story 5.5 doesn't emit it).
7. **Given** I click or Enter on a panel entry's anchor link, **when** the browser handles the navigation, **then** the page smooth-scrolls to the target `<tr>`, the target row receives keyboard focus (`tabindex="-1"` set on the `<tr>` so it's programmatically focusable without being in the tab order by default), and a short-lived visual highlight pulses the row (`surface-bright` background with 200 ms fade-in then 800 ms hold then fade-out) to signal "here it is." `prefers-reduced-motion: reduce` collapses the pulse to an instant state change.
8. **Given** `analysis.total_submissions == 0`, **when** the component is rendered by `Analysis.vue`, **then** `<PerCategoryPanels>` is **not rendered at all** (Story 5.5's empty state replaces the entire analysis body — the panels are part of that replaced body, not alongside it). AC enforced via the `v-if="!isEmpty"` parent gate.
9. All user-visible strings sourced from the copy deck — no inline literals. New keys added in this story (see Tasks).
10. **Keyboard-nav contract**: Tab moves sequentially through panel anchor links in the same M → L → E → I → C → D presentation order; Enter activates the anchor link (triggering smooth-scroll + target focus per AC #7); within a panel, anchor links are in the order features appear in `analysis.features` (which is the `created_at` ascending order from Story 5.1's query). Focus rings use the Tixeo primary outline pattern (UX spec line 581).
11. Vitest spec (`PerCategoryPanels.spec.ts`) covers:
    - Fixed M → L → E → I → C → D section order regardless of input order
    - Categories with zero dominant features omitted entirely
    - Tied feature appears in each tied panel (FR35)
    - `<h3>` + `<CatBadge>` header wiring
    - Anchor `href` values match the `feature-{feature_key}` pattern
    - Percentage rounding matches Story 5.1 (1 decimal, 33.3 / 66.7)
    - Empty-analysis guard: calling `<PerCategoryPanels>` with `total_submissions: 0` renders empty fragment + dev warn
12. The analysis-page E2E spec from Story 5.5 is extended to cover cross-index navigation: seed a populated poll with known dominants + one tied feature; assert the correct number of panels and entries; click a panel link and assert the target row is scrolled into view + focused.

## Tasks / Subtasks

- [x] `src/components/PerCategoryPanels.vue` (AC: #1, #2, #3, #4, #5, #9, #10)
  - [x] New file:
    ```vue
    <script setup lang="ts">
    import { computed } from 'vue'
    import { useCopy } from '@/composables/useCopy'
    import CatBadge from './CatBadge.vue'
    import type { PollAnalysis, Category, FeatureAnalysis } from '@/api/types'

    interface Props { analysis: PollAnalysis }
    const props = defineProps<Props>()
    const copy = useCopy()

    const FIXED_ORDER: Category[] = ['M', 'L', 'E', 'I', 'C', 'D']

    interface PanelEntry {
      feature_key: string
      name: string
      percentage: number
      percentageStr: string
    }

    const panels = computed(() => {
      if (props.analysis.total_submissions === 0) {
        if (import.meta.env.DEV) {
          console.warn('[PerCategoryPanels] mounted with total_submissions=0; parent should render empty state instead.')
        }
        return []
      }
      return FIXED_ORDER
        .map(cat => ({
          category: cat,
          entries: props.analysis.features
            .filter(f => f.dominant_categories.includes(cat))
            .map<PanelEntry>(f => ({
              feature_key: f.feature_key,
              name: f.name,
              percentage: f.dominant_percentage,
              percentageStr: Number.isInteger(f.dominant_percentage)
                ? `${f.dominant_percentage}%`
                : `${f.dominant_percentage.toFixed(1)}%`,
            })),
        }))
        .filter(p => p.entries.length > 0)
    })

    function onAnchorClick(event: MouseEvent, featureKey: string) {
      event.preventDefault()
      const target = document.getElementById(`feature-${featureKey}`)
      if (!target) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
      target.classList.add('row-pulse')
      window.setTimeout(() => target.classList.remove('row-pulse'), reduceMotion ? 0 : 1000)
    }
    </script>

    <template>
      <div v-if="panels.length > 0" class="per-category-panels">
        <h2 class="panels-heading">{{ copy('analysis.panels.heading') }}</h2>
        <section
          v-for="panel in panels"
          :key="panel.category"
          :class="['category-panel', `panel-${panel.category.toLowerCase()}`]"
          :aria-labelledby="`panel-h3-${panel.category}`"
        >
          <h3 :id="`panel-h3-${panel.category}`" class="panel-header">
            <CatBadge :category="panel.category" />
          </h3>
          <ul class="panel-list">
            <li v-for="entry in panel.entries" :key="entry.feature_key">
              <a
                :href="`#feature-${entry.feature_key}`"
                :aria-label="copy('analysis.panels.entryAriaLabel', { feature: entry.name, pct: entry.percentageStr })"
                @click="onAnchorClick($event, entry.feature_key)"
              >
                <span class="entry-feature">{{ entry.name }}</span>
                <span class="entry-pct tabular-num">{{ entry.percentageStr }}</span>
              </a>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <style scoped>
    .per-category-panels { max-width: 1440px; margin: 48px auto 0; padding: 0 24px; }
    .panels-heading { font-size: 20px; font-weight: 600; margin-bottom: 16px; }
    .category-panel { margin-bottom: 24px; }
    .panel-header { font-size: 16px; margin: 0 0 8px; font-weight: 600; }
    .panel-list { list-style: none; padding: 0; margin: 0; }
    .panel-list li { padding: 6px 0; border-bottom: 1px solid rgb(var(--v-theme-outline-variant)); }
    .panel-list a {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      text-decoration: none;
      color: inherit;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .panel-list a:hover { background: rgb(var(--v-theme-surface-bright)); }
    .panel-list a:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
    }
    .entry-feature { font-size: 14px; font-weight: 500; }
    .entry-pct { font-size: 14px; font-weight: 600; color: rgb(var(--v-theme-on-surface-variant)); }
    .tabular-num { font-variant-numeric: tabular-nums; }
    </style>
    ```
- [x] Row `id` + row-pulse CSS on `<AnalysisTable>` (AC: #6, #7)
  - [x] Extend `src/components/AnalysisTable.vue` (Story 5.5 is the source) — the `v-data-table` `<tr>` needs `:id="`feature-${item.feature_key}`"` and `tabindex="-1"`. Vuetify 4's `v-data-table` does not expose per-row attributes directly via a template prop; two options:
    - (A) Use the `#item="{ item, props: rowProps }"` slot (full-row slot) and compose the `<tr>` yourself. More control but more boilerplate.
    - (B) Rely on Vuetify's data attribute conventions or a post-mount DOM walk that stamps ids. Brittle.
    - **Recommendation**: (A). Adapt the Story 5.5 AnalysisTable to use the full-row slot. The per-cell `#item.*` slots become `<td>` compositions inside the row slot.
  - [x] Rewrite the row template:
    ```vue
    <template #item="{ item }">
      <tr
        :id="`feature-${item.feature_key}`"
        :tabindex="-1"
        class="analysis-row"
      >
        <td><!-- feature cell --></td>
        <td><!-- dominant cell --></td>
        <td><!-- distribution cell --></td>
        <td class="text-right"><!-- n --></td>
      </tr>
    </template>
    ```
  - [x] Add scoped CSS for the pulse animation (respects reduced-motion):
    ```css
    .analysis-row { transition: background-color 200ms ease; }
    .analysis-row.row-pulse { background: rgb(var(--v-theme-surface-bright)); }
    .analysis-row:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: -2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .analysis-row { transition: none; }
    }
    ```
  - [x] Verify row-hover still works after the slot refactor (it's Vuetify default, preserved automatically on `<tr>` under `v-data-table`).
- [x] Compose in `Analysis.vue` (AC: #8)
  - [x] Extend `src/pages/app/Analysis.vue` to render `<PerCategoryPanels>` below `<AnalysisTable>` inside the non-empty branch:
    ```vue
    <template v-else>
      <AnalysisTable :analysis="analysis!" />
      <PerCategoryPanels :analysis="analysis!" />
    </template>
    ```
  - [x] Not inside the empty-state branch — per AC #8, panels never render when the table wouldn't.
- [x] Copy-deck extensions (AC: #9)
  - [x] `src/copy/en.ts` — add:
    - `analysis.panels.heading` → `"By category"` (secondary heading above the panels block)
    - `analysis.panels.entryAriaLabel` → `"Jump to {feature} ({pct} dominant)"` — screen-reader announcement on the anchor link (visible text is feature name + pct; aria-label gives context that the link is navigational)
  - [x] Section `<h3>` body comes from `<CatBadge>`'s existing copy key (`pm.category.*` from Story 1.7 / 5.3); no new category copy keys.
  - [x] `docs/copy-deck.md` — reflect the new keys.
- [x] Vitest spec: `tests/unit/per-category-panels.spec.ts` (AC: #11)
  - [x] Helper: build a `PollAnalysis` fixture with known dominants:
    ```ts
    const fixture: PollAnalysis = {
      poll_id: '...',
      epoch: 1,
      total_submissions: 10,
      features: [
        mkFeature('a', 'Feature A', ['M'], 70),
        mkFeature('b', 'Feature B', ['L'], 60),
        mkFeature('c', 'Feature C', ['M'], 50),
        mkFeature('d', 'Feature D', ['M', 'L'], 50),  // tie
        mkFeature('e', 'Feature E', ['E'], 100),
        // nothing for I, C, D categories
      ],
    }
    ```
  - [x] Tests:
    - Renders 3 panels: Must-have (contains A, C, D), Performance (contains B, D), Delighter (contains E). Indifferent / Reverse / Questionable panels NOT in the DOM.
    - Section order in DOM is Must-have first, then Performance, then Delighter (M, L, E order).
    - Feature D appears in BOTH Must-have and Performance panels (tied — FR35).
    - Anchor `href` values: `#feature-a`, `#feature-b`, `#feature-c`, `#feature-d` (twice, once per panel), `#feature-e`.
    - Feature D's entries show `"50%"` in both panels (the tied percentage, same in each).
    - Feature A's entry shows `"70%"` (single-dominant).
    - Rounding: inject a fixture with `dominant_percentage: 33.33` → rendered `"33.3%"`.
    - `total_submissions: 0` case: `mount(...).html()` is empty comment; `console.warn` called.
    - Copy-deck assertion: no bare strings.
- [x] Extend E2E spec (AC: #12)
  - [x] Extend `kano-frontend/e2e/pm/analysis-page.spec.ts` (Story 5.5):
    ```ts
    test('per-category panels jump to table rows', async ({ page, request }) => {
      const { projectId, pollId } = await seedPopulatedPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      const mustHavePanel = page.locator('.category-panel.panel-m')
      await expect(mustHavePanel).toBeVisible()
      await expect(mustHavePanel.getByRole('heading', { name: /Must-have/ })).toBeVisible()

      const firstLink = mustHavePanel.locator('a').first()
      const href = await firstLink.getAttribute('href')
      expect(href).toMatch(/^#feature-/)
      await firstLink.click()

      // Assert target row is in viewport + focused + pulsed
      const featureKey = href!.replace('#feature-', '')
      const targetRow = page.locator(`#feature-${featureKey}`)
      await expect(targetRow).toBeInViewport()
      await expect(targetRow).toBeFocused()
      // row-pulse class is transient; assert it's applied briefly (may be flaky — consider poll-and-check with timeout)
    })

    test('tied feature appears in multiple panels', async ({ page, request }) => {
      const { projectId, pollId } = await seedPollWithTie(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      const mustHavePanel = page.locator('.category-panel.panel-m')
      const performancePanel = page.locator('.category-panel.panel-l')
      await expect(mustHavePanel.getByText('Feature Tied')).toBeVisible()
      await expect(performancePanel.getByText('Feature Tied')).toBeVisible()
    })

    test('empty state skips per-category panels entirely', async ({ page, request }) => {
      const { projectId, pollId } = await seedZeroSubmissionPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await expect(page.locator('.per-category-panels')).toHaveCount(0)
    })
    ```

## Dev Notes

### FR35 + FR36 interact on tied features — tied-cross-panel rendering

FR36 asks for "features grouped under the category for which they are dominant." FR35 allows multiple tied dominants. Naive implementation collapses: if a feature is tied 50/50 M/L, which panel gets it? Answer per UX spec line 1329: **both**. The feature appears in every panel of its tied dominants, not deduplicated.

Why this is the right call:
- Paola's mental model for the panels is "which features are Must-have?" — a tied feature that's half-Must-have genuinely qualifies as an answer to that question.
- Deduplicating to an "arbitrary winner" (first in the tie) would hide the tie from the cross-index (it's only visible in the table's Dominant cell).
- Deduplicating to a "Tied" meta-category would add a 7th panel type; Kano is fixed at 6 categories.

This does mean feature counts across panels don't sum to `features.length` when ties exist. That's correct, not a bug. Do NOT add a total-features footer that would surface the discrepancy; the panels are a cross-index, not a count.

### Smooth scroll + focus + pulse — why all three

1. **Scroll** so Paola sees the target row at all (long analysis pages may have the target off-screen)
2. **Focus** so subsequent Tab key moves continue from there in the table (keyboard parity); without focus, Tab from the panel link would jump to the next panel entry instead of exploring the table row's `<KanoStackedBar>` segments
3. **Pulse** to communicate "here it is" — the landing spot; without it, a keyboard user hears the row's content announced by the SR but a sighted user may lose track of where the page has scrolled

The reduced-motion branch keeps all three behaviors but collapses the pulse timing to zero (instant apply + instant remove). The function of the pulse persists (the row momentarily differs visually so the eye locks onto it); only the animation is suppressed.

### `tabindex="-1"` on the `<tr>` — programmatic focus without tab-order pollution

The row shouldn't be in the natural Tab order (AC #9 from Story 5.5: non-interactive rows are not in tab order). But the anchor-jump needs to focus it programmatically. `tabindex="-1"` is the exact pattern: the element is focusable via `.focus()` but not via Tab navigation.

This is the WCAG-preferred pattern for "jump-to" destinations that aren't otherwise interactive (H91, SC 2.4.3).

### Why h2 for the panels heading, h3 for each category

Hierarchy:
- Page header `<h1>`: the project name or "Analysis" page title (Story 5.5)
- `<h2>` for "By category" (this story's panels container heading)
- `<h3>` for each category panel's header (this story)
- No further headings inside the panels (flat list)

Preserves the h1 → h2 → h3 stepping required for screen-reader heading navigation. Story 5.5 may render its own intermediate headings (e.g., a section heading for the table itself); check that hierarchy holds after composition. If Story 5.5's body uses h2 for a "Per-feature" heading, this story's panels heading stays at h2 (peer level), and category panels stay at h3.

### Panel order across ties — just use fixed order

A panel has multiple entries when multiple features resolve to that category as dominant. Within a panel, feature order is the order features appear in `analysis.features` (which is `created_at` ascending from Story 5.1's query). No sort by feature name alphabetically, no sort by percentage descending. The order is **reading order** from the table — so clicking a panel's top entry jumps to the topmost row in the table for that category, matching "scan and jump" mental model.

Document this in a code comment on the `.filter(f => ...)` chain.

### Accessibility — SR announces "list of N items, item K of N"

Using `<ul>` + `<li>` gives screen readers "list of N items" context automatically. The aria-label on each `<a>` (`"Jump to {feature} ({pct} dominant)"`) ensures the screen reader announces navigational intent. Without aria-label, SRs would announce just "link, Feature Name, 70%" — missing that this is a jump link.

Don't confuse "role=navigation" for the outer container — that's for global site navigation (nav bars). For a section-level jump-link list, the `<ul>` semantics are correct.

### Not in scope

- First-use tooltips on `<CatBadge>` inside panels — Story 5.7 (applies to all CatBadge instances on the analysis page)
- Sort/filter controls on panels — post-MVP
- Drill-down from a panel entry into a feature-detail page — post-MVP (panels link to table rows, not to new pages)
- Panel collapse/expand UI — post-MVP (panels always fully expanded in v1)
- Panel-level percentages (e.g., "Must-have covers 40% of features") — post-MVP
- Performance gate — Story 5.8 (the panels contribute to total page render time; NFR1 is measured end-to-end)

### Project Structure Notes

Files:
- `kano-frontend/src/components/PerCategoryPanels.vue` (new)
- `kano-frontend/src/components/PerCategoryPanels.spec.ts` (new)
- `kano-frontend/src/components/AnalysisTable.vue` (extend — switch to full-row slot, add `id` + `tabindex="-1"` on `<tr>`, row-pulse CSS)
- `kano-frontend/src/routes/app/Analysis.vue` (extend — render `<PerCategoryPanels>` below `<AnalysisTable>`)
- `kano-frontend/src/copy/en.ts` (extend — panels heading + anchor aria-label)
- `kano-frontend/e2e/pm/analysis-page.spec.ts` (extend — panel navigation + tied-multi-panel + empty-state gate tests)
- `kano-frontend/docs/copy-deck.md` (update)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR35, FR36] — tie treatment; per-category panel contract
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — accessibility / keyboard-nav requirements
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — component composition pattern (line 398)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Custom Components] — `<per-category-panels>` spec (lines 905–914)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision] — "per-category panels render below the table as a secondary reading surface" (line 635)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow 3] — scan → panels → jump-back pattern (lines 719–722)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — color never sole signal, focus-ring contrast (lines 580–581)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6] — original AC
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — copy-deck + `useCopy`
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — reduced-motion detection pattern via `window.matchMedia`
- [Source: _bmad-output/implementation-artifacts/5-1-services-analysis-build-analysis-with-single-group-by-query.md] — `FeatureAnalysis.dominant_categories` (may contain multiple) + rounding contract
- [Source: _bmad-output/implementation-artifacts/5-3-catbadge-component-for-kano-category-rendering.md] — `<CatBadge>` contract
- [Source: _bmad-output/implementation-artifacts/5-5-analysis-page-table-composition-with-dominant-tie-empty-state-confidence-beat.md] — `<AnalysisTable>` is extended here; row `id` + pulse CSS added

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7, 1M context)

### Debug Log References

- Initial Vitest run failed 3 of 16 PerCategoryPanels onAnchorClick tests with `vi.spyOn() can only spy on a function. Received undefined.` — root cause: jsdom doesn't ship `window.matchMedia`. Fix: install a fresh `vi.fn` mock via `Object.defineProperty` in `beforeEach` instead of spying on the (undefined) global, restore the original (or delete) in `afterEach`. After the fix all 16 PerCategoryPanels specs pass, plus the existing 303 frontend unit tests (319/319 green).
- `vue-tsc --noEmit` clean.

### Completion Notes List

- Added `<PerCategoryPanels>` in `kano-frontend/src/components/PerCategoryPanels.vue`. Iterates `CATEGORY_CODES` (the canonical M → L → E → I → C → D order shared with `<KanoStackedBar>` / `<KanoStackedBarTable>`) and only emits sections with at least one dominant feature (AC #1 / #2). Tied features appear in EACH tied panel (FR35 / AC #5).
- Anchor click handler in PerCategoryPanels smooth-scrolls + focuses + pulses the target row, with `prefers-reduced-motion: reduce` collapsing both the scroll behavior to `auto` and the pulse-hold to 0 ms (AC #7).
- Extended `AnalysisTable.vue` to use a full-row `#item` slot so each `<tr>` carries `id="feature-{feature_key}"` + `tabindex="-1"` + `class="analysis-row"` (AC #6). Per-cell composition is unchanged; only the outer `<tr>` is new.
- Added `.analysis-row` / `.row-pulse` / `:focus-visible` / `@media (prefers-reduced-motion: reduce)` scoped styles to `AnalysisTable.vue` (AC #7).
- Wired `<PerCategoryPanels :analysis="analysis" />` under `<AnalysisTable :analysis="analysis" />` in `src/pages/app/Analysis.vue`'s non-empty branch — never rendered alongside the empty-state surface (AC #8).
- Added copy keys `analysis.panels.heading` ("By category") and `analysis.panels.entryAriaLabel` ("Jump to {feature} ({pct} dominant)") to `src/copy/en.ts`; mirrored into `docs/copy-deck.md` so `useCopy.spec.ts`'s drift check passes (AC #9).
- New Vitest spec `tests/unit/per-category-panels.spec.ts` covers: fixed order regardless of input, zero-dominant categories omitted, tied features in each panel, `<h3>` + `<CatBadge>` header wiring, anchor href pattern, percentage rounding (integer / one-decimal / NaN fallback), aria-label template wiring, h2 block heading, `total_submissions === 0` guard branch + dev warn, and `onAnchorClick` behavior (smooth + auto + missing-target no-op) (AC #11). 16/16 passing.
- Extended `tests/unit/analysis-table.spec.ts`'s v-data-table stub to support the full-row `#item` slot (so existing per-cell assertions keep working) and added a new test pinning `<tr id="feature-…" tabindex="-1" class="analysis-row">` on every row.
- Extended `tests/unit/analysis-page.spec.ts` with stub + assertions confirming `<PerCategoryPanels>` renders on populated payloads, is suppressed in the empty branch (AC #8), and is suppressed in error / loading branches.
- Extended `kano-frontend/e2e/pm/analysis-page.spec.ts` with a new `Story 5-6` describe block covering: fixed M→L→E→I→C→D order, tied features appearing in each panel, anchor-click → row scroll + focus, empty-state gating, and axe-core zero violations with panels rendered (AC #12).
- All 319 frontend unit tests green; vue-tsc clean.

### File List

- `kano-frontend/src/components/PerCategoryPanels.vue` (new)
- `kano-frontend/src/components/AnalysisTable.vue` (modified — full-row slot + row-pulse styles)
- `kano-frontend/src/pages/app/Analysis.vue` (modified — composes PerCategoryPanels in the non-empty branch)
- `kano-frontend/src/copy/en.ts` (modified — `analysis.panels.heading` + `analysis.panels.entryAriaLabel`)
- `kano-frontend/tests/unit/per-category-panels.spec.ts` (new)
- `kano-frontend/tests/unit/analysis-table.spec.ts` (modified — v-data-table stub supports full-row slot; new row-stamping test)
- `kano-frontend/tests/unit/analysis-page.spec.ts` (modified — `PerCategoryPanelsStub` + presence/absence assertions)
- `kano-frontend/e2e/pm/analysis-page.spec.ts` (modified — new `Story 5-6` describe block)
- `docs/copy-deck.md` (modified — Story 5-6 section)

### Change Log

- 2026-05-26: Story 5-6 development complete. PerCategoryPanels secondary cross-index added below the analysis table with fixed M→L→E→I→C→D order, FR35-correct tied feature treatment (feature appears in each tied panel), anchor-jump that smooth-scrolls + focuses + pulses the target table row (reduced-motion collapses both transitions), and copy-deck-driven strings. AnalysisTable migrated to a full-row `#item` slot so rows carry `id="feature-{key}"` + `tabindex="-1"` + `.analysis-row` class for jump-link targeting. 319/319 frontend unit tests pass; vue-tsc clean.

### Review Findings

Adversarial review on 2026-05-28 — Blind Hunter + Edge Case Hunter + Acceptance Auditor. Patches applied 2026-05-28 in the same review session.

- [x] [Review][Patch] E2E test `panel anchor click jumps + focuses + pulses` now asserts `targetRow toHaveClass(/row-pulse/)` so the production pulse handler can't be deleted without the test failing — `kano-frontend/e2e/pm/analysis-page.spec.ts`.
- [x] [Review][Patch] `onAnchorClick` now tracks pulse timers in a per-feature-key `Map<string, timerId>` and `clearTimeout`s on re-click so rapid re-clicks reset the pulse window cleanly — `kano-frontend/src/components/PerCategoryPanels.vue`.
- [x] [Review][Patch] Re-render race fixed — the timer callback re-resolves `getElementById('feature-' + featureKey)` at fire time and calls `.remove('row-pulse')` on the live element (if any), so an orphaned closure-captured element no longer freezes the class on a fresh row.
- [x] [Review][Patch] `onBeforeUnmount` lifecycle hook now clears all pending pulse timers and empties the Map, so click-then-router-push within 1 s no longer leaves a dangling timer.
- [x] [Review][Patch] Added `analysis.panels.entryAriaLabelTied` copy key ("Jump to {feature} ({pct} in each tied category)") and `entryAriaLabel(entry)` helper that selects between single-dominant and tied variants based on `dominant_categories.length > 1` — `kano-frontend/src/components/PerCategoryPanels.vue` + `kano-frontend/src/copy/en.ts` + `docs/copy-deck.md`.
- [x] [Review][Patch] `feature_key` sanitization via `SAFE_FEATURE_KEY` regex (`^[A-Za-z0-9._-]+$`) at the panel boundary: unsafe keys are dropped from the panels with a DEV `console.warn`, AND the click handler aborts early on the same check so a malformed key never reaches `getElementById` — `kano-frontend/src/components/PerCategoryPanels.vue`.
- [x] [Review][Defer] Empty `dominant_categories: []` feature is silently absent from all panels — no dev-warn, no diagnostic. Backend FR24 invariant prevents this in v1; deferred, pre-existing.
- [x] [Review][Defer] `PerCategoryPanels` `<h2>` + per-section `<h3>` assumes the parent page exposes an `<h1>` — manual sweep verifies in Story 5-8 checklist. Deferred.
- [x] [Review][Defer] `per-category-panels.spec.ts` does not assert `console.warn` is NOT fired in the zero-features-but-populated case (`features=[]`, `total_submissions=10`). Minor coverage gap. Deferred.
