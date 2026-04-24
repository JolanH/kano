# Story 5.7: Category help tooltips on first use

Status: ready-for-dev

## Story

As Paola on her first analysis-page visit,
I want an on-demand help affordance that explains each Kano category and the meaning of dominant-category ties,
so that I can onboard myself without documentation or a guided walkthrough.

## Acceptance Criteria

1. **Given** I'm on the analysis page (Story 5.5 populated state), **when** I hover or keyboard-focus any `<CatBadge>` instance on the page — anywhere: in the Dominant column, in `<KanoStackedBarTable>`, in `<PerCategoryPanels>` section headers, in `<PerCategoryPanels>` tied-dominant displays — **then** after a ~300 ms hover/focus delay a `v-tooltip` appears with a short (≤ 2 lines) explanation of that Kano category from the copy deck (e.g., "Must-have: users expect this feature; its absence causes frustration").
2. **Given** the tooltip displays, **when** it's rendered, **then** the tooltip text is sourced from copy-deck keys `pm.category.help.must`, `pm.category.help.perf`, `pm.category.help.del`, `pm.category.help.ind`, `pm.category.help.rev`, `pm.category.help.que` — one short definition per category (content owned by the copy deck; this story seeds them). Lines are concise: ≤ 2 lines at the 14 px body-size Vuetify tooltip default.
3. **Given** a screen reader (VoiceOver / NVDA / TalkBack) is active, **when** keyboard focus lands on a `<CatBadge>`, **then** the tooltip content is announced as supplementary info via `aria-describedby` wiring (NOT `aria-label`, which would replace the visible label). The `<CatBadge>`'s primary label remains the category name; the help text is secondary.
4. **Given** the confidence-beat meta line in the analysis-page header (Story 5.5 AC #1), **when** I examine it, **then** a small help (i) icon (`mdi-information-outline` via `v-icon`, 16 px) appears immediately to the right of the `"{total} responses"` text. Clicking, hovering, or keyboard-focusing the icon opens a `v-tooltip` (or popover for longer content) explaining the meaning of a dominant-category tie: copy-deck key `analysis.help.tieMeaning` — e.g., "When two categories share the top position, customer opinion is genuinely split — both categories are equally dominant."
5. **Given** keyboard navigation across the analysis page, **when** the user tabs to a `<CatBadge>` or the tie-help icon, **then** the tooltip activator receives focus, the tooltip reveals on focus (not only on hover), and **Escape dismisses it**. This matches WCAG SC 1.4.13 Content on Hover or Focus: dismissible, hoverable, persistent.
6. **Given** `prefers-reduced-motion: reduce` is set, **when** tooltips appear, **then** the default Vuetify fade-transition is suppressed (instant show, instant hide) — same pattern as Story 4.5's reduced-motion treatment.
7. **Given** the analysis page, **when** the tooltips are interacted with, **then** they are **never load-bearing** information: every category on the page is ALSO labeled visibly via its `<CatBadge>`'s text label (Story 5.3). The tie-help icon is purely for first-use curiosity; a user who never hovers it has no handicap understanding the analysis (FR39).
8. All tooltip strings sourced from the copy deck — no inline literals.
9. **CatBadge modification contract**: this story extends `<CatBadge>` to OPTIONALLY wrap itself in a `v-tooltip` when a `:with-help="true"` prop is set. Default `:with-help="false"` preserves backward compatibility with any call site that doesn't want the tooltip. Call sites on the analysis page set `with-help` to `true`; call sites elsewhere (theme-audit, future surfaces) leave it default.
10. Vitest unit tests:
    - `CatBadge.spec.ts` extended: `with-help="true"` renders a tooltip activator; `aria-describedby` attribute wired; tooltip content resolved from the correct copy key per category; default (`with-help="false"`) has NO tooltip
    - New `AnalysisHelpIcon.spec.ts` (or inline within the analysis-page spec): the tie-help icon renders with `mdi-information-outline`, has a tooltip, is keyboard-focusable, Escape dismisses
11. Playwright E2E extension in `analysis-page.spec.ts`:
    - Hover a `<CatBadge>` → tooltip text matches the expected copy-deck string
    - Tab to a `<CatBadge>` → tooltip appears on focus
    - Press Escape → tooltip dismisses
    - Hover the tie-help icon → tie-meaning tooltip appears
    - axe-core run on the analysis page with tooltips open → zero violations

## Tasks / Subtasks

- [ ] Extend `<CatBadge>` with optional tooltip (AC: #1, #2, #3, #5, #6, #8, #9)
  - [ ] Update `src/components/CatBadge.vue`:
    ```vue
    <script setup lang="ts">
    import { computed } from 'vue'
    import { useCopy } from '@/composables/useCopy'
    import type { Category } from '@/api/types'

    interface Props {
      category: Category
      withHelp?: boolean
    }
    const props = withDefaults(defineProps<Props>(), { withHelp: false })
    const copy = useCopy()

    const COPY_KEY: Record<Category, string> = {
      M: 'pm.category.must',
      L: 'pm.category.perf',
      E: 'pm.category.del',
      I: 'pm.category.ind',
      C: 'pm.category.rev',
      D: 'pm.category.que',
    }
    const HELP_KEY: Record<Category, string> = {
      M: 'pm.category.help.must',
      L: 'pm.category.help.perf',
      E: 'pm.category.help.del',
      I: 'pm.category.help.ind',
      C: 'pm.category.help.rev',
      D: 'pm.category.help.que',
    }

    const isValid = computed(() => props.category in COPY_KEY)
    const label = computed(() => copy(COPY_KEY[props.category]))
    const helpText = computed(() => copy(HELP_KEY[props.category]))
    const swatchClass = computed(() => `swatch-${props.category.toLowerCase()}`)
    </script>

    <template>
      <template v-if="isValid && withHelp">
        <v-tooltip :text="helpText" location="top" :open-delay="300">
          <template #activator="{ props: tipProps }">
            <span
              v-bind="tipProps"
              class="cat-badge cat-badge-help"
              :data-category="category"
              tabindex="0"
            >
              <span :class="['cat-swatch', swatchClass]" aria-hidden="true" />
              <span class="cat-label">{{ label }}</span>
            </span>
          </template>
        </v-tooltip>
      </template>
      <span v-else-if="isValid" class="cat-badge" :data-category="category">
        <span :class="['cat-swatch', swatchClass]" aria-hidden="true" />
        <span class="cat-label">{{ label }}</span>
      </span>
    </template>
    ```
  - [ ] Key detail: in the `with-help` branch, the outer `<span>` gets `tabindex="0"` so it's keyboard-focusable; Vuetify's `v-tooltip` activator wiring handles `aria-describedby` internally on the spread `tipProps`. Verify in the test that `aria-describedby` appears on the focused element.
  - [ ] The non-help branch stays exactly as Story 5.3 emitted it — no regression to the non-tooltip case (theme-audit, etc.).
  - [ ] Dev-mode invalid-category warning continues to fire (inherited from Story 5.3).
  - [ ] Reduced-motion: Vuetify `v-tooltip` respects the global `prefers-reduced-motion` CSS via its built-in transition CSS; verify by setting `@media (prefers-reduced-motion: reduce) { .v-tooltip > .v-overlay__content { transition: none !important; } }` in `src/styles/a11y.scss` if Vuetify 4 doesn't suppress it out-of-box.
- [ ] Wire `with-help` at analysis-page call sites (AC: #1)
  - [ ] Extend `src/components/AnalysisTable.vue` (Story 5.5) — Dominant cell's `<CatBadge>`s get `:with-help="true"`:
    ```vue
    <CatBadge :category="c" :with-help="true" />
    ```
  - [ ] Extend `src/components/PerCategoryPanels.vue` (Story 5.6) — section header's `<CatBadge>` gets `:with-help="true"` too.
  - [ ] **Do NOT** set `with-help` on the `<CatBadge>` row in the theme-audit page (Story 5.3 extension) — theme-audit shows primitive examples without the help overlay.
  - [ ] `<KanoStackedBarTable>` (Story 5.4) does **not** use `<CatBadge>` internally (it renders plain text via `<td>{{ row.label }}</td>`) — no change needed there.
- [ ] Tie-meaning help icon in the analysis-page header (AC: #4, #5, #6, #8)
  - [ ] Extend `src/routes/app/Analysis.vue` (Story 5.5) — add the help icon after the confidence-beat line:
    ```vue
    <div class="confidence-beat">
      <span>{{ copy('analysis.confidenceBeat', { total: analysis.total_submissions }) }}</span>
      <v-tooltip :text="copy('analysis.help.tieMeaning')" location="top" :open-delay="300" max-width="300">
        <template #activator="{ props: tipProps }">
          <v-icon
            v-bind="tipProps"
            icon="mdi-information-outline"
            size="16"
            class="help-icon"
            tabindex="0"
            :aria-label="copy('analysis.help.tieIconAriaLabel')"
          />
        </template>
      </v-tooltip>
    </div>
    ```
  - [ ] Scoped CSS:
    ```css
    .confidence-beat { display: inline-flex; align-items: center; gap: 6px; color: rgb(var(--v-theme-on-surface-variant)); font-size: 14px; }
    .help-icon { cursor: help; color: rgb(var(--v-theme-on-surface-variant)); }
    .help-icon:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: 50%; }
    ```
  - [ ] The `aria-label` on the icon ensures SRs announce the icon's role ("tie meaning help") before the tooltip's `aria-describedby` content is read. Without aria-label, the icon announces as just "information icon, button" — unclear.
  - [ ] `max-width="300"` on the tooltip allows the longer tie-explanation text to wrap naturally; category tooltips (≤ 2 lines short definitions) don't need it.
- [ ] Copy-deck extensions (AC: #2, #4, #8)
  - [ ] `src/copy/en.ts` — seed the 6 category help strings + the tie-meaning string + the icon aria-label:
    - `pm.category.help.must` → `"Users expect this feature. Its absence causes frustration."`
    - `pm.category.help.perf` → `"Satisfaction scales with quality. More is better."`
    - `pm.category.help.del` → `"Aspirational. Users don't expect it, but love it when present."`
    - `pm.category.help.ind` → `"Users don't care whether this feature exists or not."`
    - `pm.category.help.rev` → `"Users actively prefer the feature's absence."`
    - `pm.category.help.que` → `"Responses were inconsistent. More data needed."`
    - `analysis.help.tieMeaning` → `"When two categories share the top position, customer opinion is genuinely split — both categories are equally dominant."`
    - `analysis.help.tieIconAriaLabel` → `"About dominant-category ties"`
  - [ ] The strings above are **starting points** — the copy deck is Paige's (tech writer) domain; if the Product or UX reviewers refine them during low-fidelity review, update both `en.ts` and `docs/copy-deck.md`. Commit this story's strings as-is; follow-up PR can refine wording.
- [ ] Vitest tests (AC: #10)
  - [ ] Extend `src/components/CatBadge.spec.ts`:
    ```ts
    it('renders tooltip activator when with-help is true', async () => {
      const wrapper = mount(CatBadge, {
        props: { category: 'M', withHelp: true },
        global: { plugins: [createVuetifyForTest()] },
      })
      // Vuetify v-tooltip stamps aria-describedby on the activator when open
      await wrapper.find('.cat-badge-help').trigger('focus')
      await nextTick()
      // Depending on Vuetify test helpers, assert the tooltip text is in the overlay
      // Or: assert the activator has a tooltip-id reference
      expect(wrapper.find('.cat-badge-help').attributes('tabindex')).toBe('0')
    })

    it('does NOT render tooltip when with-help is false', () => {
      const wrapper = mount(CatBadge, { props: { category: 'M' } })
      expect(wrapper.find('.cat-badge-help').exists()).toBe(false)
      expect(wrapper.find('.cat-badge').exists()).toBe(true)
    })

    it('tooltip content resolves from correct copy key per category', async () => {
      // With a useCopy mock that returns the key itself, or a real copy deck:
      const wrapper = mount(CatBadge, {
        props: { category: 'M', withHelp: true },
        global: { plugins: [createVuetifyForTest()] },
      })
      // Inspect the v-tooltip's text prop via component tree
      const tooltip = wrapper.findComponent({ name: 'VTooltip' })
      expect(tooltip.props('text')).toContain('Must-have:') // or the exact expected seeded text
    })
    ```
  - [ ] If Vuetify's test integration is complex, fall back to testing the **conditional branches** (does `.cat-badge-help` render vs `.cat-badge`?) and the **prop wiring** (does `v-tooltip`'s `text` prop equal the expected copy result?). Skip full DOM tooltip-open assertions for unit tests; cover that in the E2E.
- [ ] Playwright E2E (AC: #11)
  - [ ] Extend `kano-frontend/e2e/pm/analysis-page.spec.ts`:
    ```ts
    test('category tooltip on hover', async ({ page, request }) => {
      const { projectId, pollId } = await seedPopulatedPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      const mustBadge = page.locator('.cat-badge-help').filter({ hasText: 'Must-have' }).first()
      await mustBadge.hover()
      await expect(page.getByRole('tooltip')).toContainText(/Users expect this feature/)
    })

    test('category tooltip on keyboard focus', async ({ page, request }) => {
      const { projectId, pollId } = await seedPopulatedPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      // Tab until a CatBadge is focused (may take several presses depending on focus order)
      const firstBadge = page.locator('.cat-badge-help').first()
      await firstBadge.focus()
      await expect(page.getByRole('tooltip')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('tooltip')).toBeHidden()
    })

    test('tie-meaning help icon', async ({ page, request }) => {
      const { projectId, pollId } = await seedPollWithTie(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.locator('.help-icon').hover()
      await expect(page.getByRole('tooltip')).toContainText(/customer opinion is genuinely split/)
    })

    test('axe-core on analysis page with tooltip open', async ({ page, request }) => {
      const { projectId, pollId } = await seedPopulatedPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.locator('.cat-badge-help').first().hover()
      const axe = await new AxeBuilder({ page }).include('body').analyze()
      expect(axe.violations).toEqual([])
    })
    ```

## Dev Notes

### FR39's exact requirement: first-use affordance, not documentation

FR39: "The PM-facing analysis page provides on-demand explanatory content (tooltips or help) describing each Kano category and the meaning of a dominant-category tie, available on first use without dependency on human pairing."

Two elements:
1. **Per-category explanation** — achieved by tooltip on every `<CatBadge>` (AC #1–2)
2. **Tie-meaning explanation** — achieved by the help (i) icon near the confidence beat (AC #4)

FR39 says "tooltips OR help." We do both: tooltip for categories (short, inline), icon→tooltip for the meta-concept of ties (logically separate, needs its own surface). This matches UX spec line 1344 exactly.

**Do NOT** build a full help-page route, a modal tutorial, a guided tour, a first-launch onboarding splash — FR39 explicitly rejects those ("without dependency on human pairing" = no tutorial required).

### Content is non-load-bearing (AC #7)

Every `<CatBadge>` already shows the category name visibly. The tooltip adds **definition**, not **identity**. A user who never hovers a badge still understands the analysis because:
- Dominant column names categories (via `<CatBadge>`)
- Per-category panels name categories (via `<CatBadge>` in section headers)
- Stacked bar has `<KanoStackedBarTable>` accessible fallback

The tooltip is first-use curiosity support, nothing more. This is why it's `aria-describedby` (supplementary) rather than `aria-label` (replacement label).

**Implication**: don't stress about tooltip wording perfection in this story. If Paola's mental model of "Delighter" differs from our wording, it's a copy-deck refinement, not a functional bug.

### WCAG SC 1.4.13 — Content on Hover or Focus

Three requirements for any tooltip content shown on hover/focus:
1. **Dismissible**: Escape dismisses without moving focus (verified in AC #5)
2. **Hoverable**: moving the pointer over the tooltip itself doesn't dismiss it (Vuetify `v-tooltip` default behavior)
3. **Persistent**: doesn't auto-dismiss until the user indicates (pointer-leaves the activator, or Escape, or focus-leaves) — Vuetify default

Vuetify 4's `v-tooltip` satisfies all three out-of-box. Do NOT override `close-on-content-click`, `close-on-back`, or `persistent` props.

### Why tabindex="0" on the badge wrapper

Without `tabindex`, the `<CatBadge>` is unfocusable — keyboard users can never trigger the tooltip. AC #5 requires focus-based reveal. `tabindex="0"` adds it to the natural tab order; Vuetify's `v-tooltip` then binds `aria-describedby` to it via `tipProps`.

The tradeoff: every `<CatBadge :with-help="true">` becomes a tab stop. On the analysis page with 20 features × (1 badge in Dominant + N badges in PerCategoryPanels entries) = potentially 60+ tab stops just for badges. That's a lot of Tab presses to cross the page.

**Acceptable trade-off**: keyboard users who want to scan past need only press Tab once per badge (it's a single-shot focus, not a trap), and arrow-key jump within landmarks is a standard SR navigation strategy. Paola as a keyboard-happy user is less common than keyboard-primary SR users; for the latter, each badge-as-tabstop is appropriate (the SR can jump by heading or landmark).

If this feels excessive during manual a11y testing in Story 5.8, a follow-up could add a `roving tabindex` pattern (one tab-stop per panel, arrow keys to navigate within) — but it's not in scope here.

### Reduced-motion handling

Vuetify 4's `v-tooltip` uses a CSS transition on open/close. Users with `prefers-reduced-motion: reduce` should see instant appearance. Verify Vuetify's default CSS respects the media query; if not, add the `src/styles/a11y.scss` override listed in the tasks. Story 4.5 established the reduced-motion precedent via `window.matchMedia`; this story reuses the infrastructure (no new composable, no new pattern).

### 300 ms hover-open delay — UX pattern, not from AC

UX spec line 1343: "after ~300 ms a `v-tooltip` appears." This delay prevents tooltip-spam when the pointer sweeps across multiple badges (e.g., scanning the Dominant column). 300 ms is Vuetify's recommended value for help tooltips vs faster feedback tooltips (which use 0–100 ms).

`:open-delay="300"` on the tooltip. Keyboard focus has no equivalent delay (Vuetify opens on focus immediately per WCAG); document in a code comment that this is intentional — hover has delay (prevent sweep spam), focus does not (keyboard users expect immediate reveal).

### NOT adding tooltips to KanoStackedBarTable rows

`<KanoStackedBarTable>` rows contain category names as plain text — not `<CatBadge>` components. Adding tooltips to those `<td>` cells would require either:
- Wrapping the text in `<CatBadge>` with `with-help` (pulls in the full CatBadge render, breaks the SR-only table simplicity)
- Adding `v-tooltip` inline on the `<td>` (new pattern)

Neither is worth it. The SR-only table is for screen-reader users, who already get a clearer "table, 6 rows, Category column" announcement than a sighted-user-oriented tooltip would add. Visible users of the bar have the tooltip on the **segment** itself (Story 5.4 AC #3) — that serves the same help purpose without redundancy.

Document the non-change in a code comment on the `<KanoStackedBarTable>` rows.

### Not in scope

- Full glossary page / help center — post-MVP
- First-launch onboarding splash — explicitly rejected by FR39
- Interactive category-explanation modal — FR39 says tooltip/help, not modal
- Localized category definitions for fr.ts / de.ts — post-MVP i18n
- Category-specific example features in tooltips — copy deck can iterate later; v1 strings are category-only definitions
- Analytics on tooltip-open events — post-MVP (would require an analytics backend; none in v1)
- Tooltip on respondent-facing surfaces — respondent flow doesn't expose category codes (they're derived from Likert answers); no place to hang a tooltip

### Project Structure Notes

Files:
- `kano-frontend/src/components/CatBadge.vue` (extend — optional `with-help` prop wires a `v-tooltip`)
- `kano-frontend/src/components/CatBadge.spec.ts` (extend — `with-help` true/false branches)
- `kano-frontend/src/components/AnalysisTable.vue` (extend — pass `:with-help="true"` to CatBadges)
- `kano-frontend/src/components/PerCategoryPanels.vue` (extend — pass `:with-help="true"` to panel header CatBadges)
- `kano-frontend/src/routes/app/Analysis.vue` (extend — add tie-meaning help icon next to confidence beat)
- `kano-frontend/src/copy/en.ts` (extend — 6 category help keys + tie-meaning + icon aria-label)
- `kano-frontend/src/styles/a11y.scss` (conditional — add reduced-motion tooltip override only if Vuetify default doesn't suppress)
- `kano-frontend/e2e/pm/analysis-page.spec.ts` (extend — tooltip hover/focus/Escape/axe tests)
- `kano-frontend/docs/copy-deck.md` (update with 8 new keys)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR39] — on-demand explanatory content, first-use, no pairing
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG AA, axe-core
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Vuetify wrapping pattern (line 410)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Custom Components] — `<cat-badge>` spec (lines 855–864)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow 3] — analysis scan with tooltip + panels (lines 719–722)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX Consistency Patterns] — tooltip pattern consistency (reference §Feedback Patterns around line 982)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.7] — original AC
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — copy-deck seeding conventions, `useCopy`
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — reduced-motion detection pattern + `v-radio-group` composition precedent
- [Source: _bmad-output/implementation-artifacts/5-3-catbadge-component-for-kano-category-rendering.md] — this story EXTENDS `<CatBadge>` with a `with-help` prop; preserves default non-help behavior
- [Source: _bmad-output/implementation-artifacts/5-5-analysis-page-table-composition-with-dominant-tie-empty-state-confidence-beat.md] — confidence-beat location + analysis-page composition where the help icon sits
- [Source: _bmad-output/implementation-artifacts/5-6-percategorypanels-secondary-cross-index.md] — panel-header CatBadges consume the `with-help` prop too

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
