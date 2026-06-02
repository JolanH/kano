<script setup lang="ts">
/**
 * <PerCategoryPanels> — Story 5-6 secondary cross-index rendered below the
 * analysis table. One `<section>` per Kano category that has at least one
 * feature for which it is dominant (FR36); zero-dominant-feature categories
 * are omitted entirely (AC #2 — zero DOM, no placeholder).
 *
 * Tie treatment (FR35 / AC #5): when a feature is tied-dominant across
 * multiple categories, it appears in EACH tied panel — no deduplication.
 * Counts across panels therefore don't sum to `features.length` when ties
 * exist; that's correct, not a bug (see story Dev Notes — do NOT add a
 * total-features footer that would surface the discrepancy).
 *
 * Anchor links target the analysis-table row's stable
 * `id="feature-{feature_key}"` (AnalysisTable Story 5-5 + the Story 5-6
 * full-row-slot extension). The click handler smooth-scrolls + focuses the
 * target row and adds a transient `.row-pulse` class for ~1 s to communicate
 * "here it is." `prefers-reduced-motion: reduce` collapses both the scroll
 * behavior (`auto`) and the pulse-hold timing (0 ms).
 *
 * The parent (`Analysis.vue`) must guard this component behind
 * `v-if="!isEmpty"` — `total_submissions === 0` paths render the empty-state
 * surface in place of the whole non-empty body (AC #8). The internal
 * `total_submissions === 0` short-circuit is a belt-and-braces dev warning
 * for accidental mounts.
 */

import { computed, onBeforeUnmount } from 'vue'

import CatBadge from '@/components/CatBadge.vue'
import KanoCategoryPie from '@/components/KanoCategoryPie.vue'
import KanoCategoryReference from '@/components/KanoCategoryReference.vue'
import { CATEGORY_CODES } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'
import type { Category, PollAnalysis } from '@/api/types'

interface Props {
  analysis: PollAnalysis
}

const props = defineProps<Props>()
const copy = useCopy()

interface PanelEntry {
  feature_key: string
  name: string
  percentageStr: string
  isTied: boolean
}

interface Panel {
  category: Category
  entries: PanelEntry[]
}

// Feature keys flow into a URL fragment (`href="#feature-…"`) AND into a
// `getElementById` lookup at click time. Today the backend emits UUIDs only
// so this is invariably safe, but the wire type is unconstrained `string`;
// guard against future drift (or hand-crafted fixtures with spaces / `#` /
// `:` in the key) by validating at the component boundary. The regex is
// intentionally narrow — anything that breaks a CSS-selector or a URL
// fragment is excluded; we don't try to "fix" the value because the cross-
// index then disagrees with the table row's `id` attribute.
const SAFE_FEATURE_KEY = /^[A-Za-z0-9._-]+$/

function isSafeFeatureKey(key: string): boolean {
  return SAFE_FEATURE_KEY.test(key)
}

function formatPercent(pct: number): string {
  // Defensive guard — same em-dash fallback as AnalysisTable.dominantPercent.
  // A schema-regressed `NaN` / `Infinity` upstream would otherwise render
  // "NaN%" / "Infinity%".
  if (!Number.isFinite(pct)) return '—'
  // Mirror Story 5-1's rounding contract: integer-on-the-nose values render
  // without a decimal ("70%"); fractional values keep one decimal ("33.3%").
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

const panels = computed<Panel[]>(() => {
  if (props.analysis.total_submissions === 0) {
    // Parent should branch to the empty-state surface; this short-circuit
    // is a dev-only safety net.
    if (import.meta.env.DEV) {
      console.warn(
        '[PerCategoryPanels] mounted with total_submissions=0; parent should render the empty state instead.',
      )
    }
    return []
  }
  // Iterate the canonical M → L → E → I → C → D order from
  // `kano-categories.ts` so the visual scan-order stays consistent with
  // <KanoStackedBar> / <KanoStackedBarTable>. Within each panel, features
  // appear in `analysis.features` order — which is `created_at` ascending
  // per Story 5-1's GROUP BY query — so a top-entry click jumps to the
  // topmost matching row (the "scan and jump" mental model from UX spec
  // line 720).
  return CATEGORY_CODES.map<Panel>((cat) => ({
    category: cat,
    entries: props.analysis.features
      .filter((f) => f.dominant_categories.includes(cat))
      .filter((f) => {
        if (isSafeFeatureKey(f.feature_key)) return true
        if (import.meta.env.DEV) {
          console.warn(
            `[PerCategoryPanels] skipping feature with unsafe feature_key for URL fragment: ${String(f.feature_key)}`,
          )
        }
        return false
      })
      .map<PanelEntry>((f) => ({
        feature_key: f.feature_key,
        name: f.name,
        percentageStr: formatPercent(f.dominant_percentage),
        isTied: f.dominant_categories.length > 1,
      })),
  })).filter((panel) => panel.entries.length > 0)
})

function entryAriaLabel(entry: PanelEntry): string {
  // FR35 — tied features render the same `pct` in every tied panel; a SR
  // user hearing "50 percent dominant" could parse it as "50 percent is
  // dominant" and miss that the percentage applies in each tied category.
  // The `Tied` copy variant disambiguates without changing the visible text.
  const key = entry.isTied
    ? 'analysis.panels.entryAriaLabelTied'
    : 'analysis.panels.entryAriaLabel'
  return copy(key, { feature: entry.name, pct: entry.percentageStr })
}

// Track in-flight pulse timers keyed by feature_key so rapid re-clicks on
// the same anchor don't truncate the pulse (the second click's longer
// timer should win), and so component unmount can cancel any pending
// timers cleanly. The cleanup callback re-resolves the target by ID at
// timer-fire instead of using a closure-captured reference: if the table
// re-renders between the click and the timer (epoch swap, retry refetch),
// the freshly-rendered row carries the same id, and we want to remove
// `.row-pulse` from the *current* element, not from an orphan in a
// detached subtree (which would leave the stale class on the live row
// indefinitely).
// `window.setTimeout` returns a DOM `number` handle (cf. EpochBumpBanner) —
// not the Node `Timeout` that `ReturnType<typeof window.setTimeout>` would
// resolve to under the merged DOM + @types/node lib, which mismatches the
// `number` the call actually yields.
const pulseTimers = new Map<string, number>()

function clearPulseTimer(featureKey: string): void {
  const existing = pulseTimers.get(featureKey)
  if (existing !== undefined) {
    window.clearTimeout(existing)
    pulseTimers.delete(featureKey)
  }
}

onBeforeUnmount(() => {
  pulseTimers.forEach((id) => window.clearTimeout(id))
  pulseTimers.clear()
})

function onAnchorClick(event: MouseEvent, featureKey: string): void {
  event.preventDefault()
  if (!isSafeFeatureKey(featureKey)) return
  const target = document.getElementById(`feature-${featureKey}`)
  if (!target) return

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'center',
  })
  // Focus comes after the scroll request so the keyboard landing is on the
  // target row — subsequent Tab keystrokes continue from there in the table
  // instead of jumping to the next panel entry.
  target.focus({ preventScroll: true })

  // Transient pulse so the eye locks onto the landing row. Under
  // reduced-motion the class is added and removed on the same tick — the
  // function of the pulse (a momentary visual differentiation) still fires,
  // but the CSS transition is suppressed via the `prefers-reduced-motion`
  // media query in AnalysisTable.vue's row-pulse styles.
  clearPulseTimer(featureKey)
  target.classList.add('row-pulse')
  const timerId = window.setTimeout(() => {
    pulseTimers.delete(featureKey)
    // Re-resolve at timer-fire — the `target` closure-captured above may
    // have been detached by an intervening re-render.
    const live = document.getElementById(`feature-${featureKey}`)
    live?.classList.remove('row-pulse')
  }, reduceMotion ? 0 : 1000)
  pulseTimers.set(featureKey, timerId)
}
</script>

<template>
  <div
    v-if="panels.length > 0"
    class="per-category-panels"
    data-testid="per-category-panels"
  >
    <h2 class="panels-heading">{{ copy('analysis.panels.heading') }}</h2>
    <!--
      Two-column grid: the "By category" main column (repartition pie +
      per-category jump-lists) takes 30% of the frame; a reference `<aside>`
      (KanoCategoryReference) takes the remaining 70% as a standing Kano
      glossary — the meaning panel is the dominant column. The aside collapses
      below the main column on narrow viewports (see `.panels-layout` media
      query). The pie and jump-lists are unchanged from Story 5-6 / the pie
      followup.
    -->
    <div class="panels-layout">
      <div class="panels-main">
        <!--
          Story-followup — a pie chart of the dominant-category repartition
          sits above the per-category jump-lists as a visual summary. It keys
          on each feature's dominant category (tied features split
          fractionally so the slices total 100%); the lists below are
          unchanged.
        -->
        <KanoCategoryPie :analysis="analysis" />
        <section
          v-for="panel in panels"
          :key="panel.category"
          :class="['category-panel', `panel-${panel.category.toLowerCase()}`]"
          :aria-labelledby="`panel-h3-${panel.category}`"
          :data-testid="`per-category-panel-${panel.category}`"
        >
          <h3 :id="`panel-h3-${panel.category}`" class="panel-header">
            <!--
              Story 5-7 — section-header CatBadges opt into the first-use help
              tooltip via `:with-help="true"`. The panel header is the most
              visible category label on the analysis page, so it carries the
              help affordance alongside the Dominant-cell badges.
            -->
            <CatBadge :category="panel.category" :with-help="true" />
          </h3>
          <ul class="panel-list">
            <li
              v-for="entry in panel.entries"
              :key="`${panel.category}-${entry.feature_key}`"
            >
              <a
                :href="`#feature-${entry.feature_key}`"
                :aria-label="entryAriaLabel(entry)"
                :data-testid="`per-category-entry-${panel.category}-${entry.feature_key}`"
                @click="onAnchorClick($event, entry.feature_key)"
              >
                <span class="entry-feature">{{ entry.name }}</span>
                <span class="entry-pct tabular-num">{{ entry.percentageStr }}</span>
              </a>
            </li>
          </ul>
        </section>
      </div>
      <KanoCategoryReference />
    </div>
  </div>
</template>

<style scoped>
.per-category-panels {
  /*
   * Mirrors the Story 5-5 AnalysisTable 1440 px frame (UX-DR22) so the
   * cross-index sits directly under the table in the same horizontal
   * column. Vertical spacing (48 px above) marks the secondary-surface
   * boundary without a divider rule.
   */
  max-width: 1440px;
  width: 100%;
  margin: 48px auto 0;
  padding: 0 24px;
}

.panels-heading {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}

.panels-layout {
  /*
   * Two-column grid: the "By category" main column (pie + jump-lists) takes
   * 30% of the frame, the categories-meaning reference aside takes the
   * remaining 70%. `fr` units split the space *after* the 32px gutter, so
   * 3fr/7fr is an exact 30/70 with no gap-overflow math.
   *
   * No responsive single-column fallback: the PM analysis surface is
   * desktop-only, hard-gated at 1280px by `PmLayout` (`useBreakpoint`'s
   * `PM_DESKTOP_BREAKPOINT`) — below that the route renders the
   * unsupported-viewport surface, not this component, so a stacking media
   * query here would be dead code. At the 1280px floor the 30% column is
   * still ~360px, comfortable for the jump-list rows.
   */
  display: grid;
  grid-template-columns: 3fr 7fr;
  gap: 32px;
  align-items: start;
}

.panels-main {
  min-width: 0;
}

.category-panel {
  margin-bottom: 24px;
}

.category-panel:last-child {
  margin-bottom: 0;
}

.panel-header {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.panel-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.panel-list li {
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}

.panel-list li:last-child {
  border-bottom: none;
}

.panel-list a {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 8px;
  text-decoration: none;
  color: inherit;
  border-radius: 4px;
}

.panel-list a:hover {
  background-color: rgb(var(--v-theme-surface-bright));
}

.panel-list a:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.entry-feature {
  font-size: 14px;
  font-weight: 500;
}

.entry-pct {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface-variant));
}

.tabular-num {
  font-variant-numeric: tabular-nums;
}
</style>