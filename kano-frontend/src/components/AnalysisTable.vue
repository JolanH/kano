<script lang="ts">
/**
 * <AnalysisTable> — the Story 5.5 page-body table that renders one row per
 * feature with four columns: Feature, Dominant, Distribution, n.
 *
 * Composition-only: every interior primitive (<CatBadge>, <KanoStackedBar>,
 * <KanoStackedBarTable>) ships from earlier stories. This component owns
 * the v-data-table wiring + per-cell layout decisions; it does NOT solve
 * rendering, percentage formatting, or accessibility internals — those
 * live in the primitives.
 *
 * Per-row `n` is derived client-side as `sum(distribution.values())` per
 * feature. Under the FR24 full-submission invariant `n === total_submissions`
 * for every row, but deriving from the per-feature distribution is the
 * truth-source (a poll-level mismatch would otherwise hide silently).
 *
 * Row click is intentionally NOT wired (UX spec line 1312 / AC #7): no
 * `@click:row`, no `cursor: pointer`. The post-MVP drill-down affordance
 * lives in a follow-up story.
 */

import type { Category, FeatureAnalysis, PollAnalysis } from '@/api/types'

export interface AnalysisRow {
  feature_key: string
  name: string
  description: string | null
  dominant_categories: Category[]
  dominant_percentage: number
  distribution: Record<Category, number>
  n: number
}

export interface Props {
  analysis: PollAnalysis
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

import CatBadge from '@/components/CatBadge.vue'
import KanoStackedBar from '@/components/KanoStackedBar.vue'
import KanoStackedBarTable from '@/components/KanoStackedBarTable.vue'
import { useCopy } from '@/composables/useCopy'

const props = defineProps<Props>()
const copy = useCopy()

const rows = computed<AnalysisRow[]>(() =>
  props.analysis.features.map((f: FeatureAnalysis) => ({
    feature_key: f.feature_key,
    name: f.name,
    description: f.description,
    dominant_categories: f.dominant_categories,
    dominant_percentage: f.dominant_percentage,
    distribution: f.distribution,
    // Per-row truth: sum the distribution rather than reusing the poll-
    // level total. Equal under FR24, divergent under data corruption.
    n: Object.values(f.distribution).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0),
  })),
)

const headers = computed(() => [
  { title: copy('analysis.table.col.feature'), key: 'feature', sortable: false },
  { title: copy('analysis.table.col.dominant'), key: 'dominant', sortable: false },
  {
    title: copy('analysis.table.col.distribution'),
    key: 'distribution',
    sortable: false,
  },
  {
    title: copy('analysis.table.col.n'),
    key: 'n',
    sortable: false,
    align: 'end' as const,
  },
])

function dominantPercent(row: AnalysisRow): string {
  const pct = row.dominant_percentage
  // Defensive guard: the wire contract is `number` (Story 5.1's
  // rounding-to-one-decimal), but a schema regression sending `NaN` /
  // `Infinity` / `null` would otherwise render literal "NaN%" / "Infinity%"
  // or throw on `null.toFixed`. Render an em-dash and let the row stay in
  // the table — the bar / per-row n still convey meaning.
  if (!Number.isFinite(pct)) return '—'
  // Render "71%" when the value is integer-on-the-nose, "33.3%" otherwise.
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

function dominantLabel(row: AnalysisRow): string {
  const pct = dominantPercent(row)
  // Under FR24 (Story 4.2's full-submission invariant) every active feature
  // receives exactly one response per submission, so `dominant_categories`
  // is non-empty for every row in a populated payload. The `<= 1` branch
  // therefore covers both single-dominant and the theoretical `length === 0`
  // case — that empty-array shape only appears at the type level (see
  // `api/types.ts`'s docstring) and never at runtime when this table
  // mounts (the page replaces the whole table with the empty-state surface
  // when `total_submissions === 0`).
  if (row.dominant_categories.length <= 1) return pct
  return copy('analysis.dominant.tiedPercent', { pct })
}
</script>

<template>
  <v-data-table
    :headers="headers"
    :items="rows"
    :items-per-page="-1"
    density="comfortable"
    hover
    class="analysis-table"
    data-testid="analysis-table"
  >
    <!--
      Row click is reserved for the post-MVP drill-down (UX spec line 1312).
      Do NOT add `@click:row`, `:row-props` cursor styling, or any hover
      affordance beyond Vuetify's default surface-bright row tint.

      The full-row `#item` slot is required by Story 5-6: each `<tr>` needs
      a stable `id="feature-{feature_key}"` (so PerCategoryPanels anchor
      links resolve) plus `tabindex="-1"` (so they're programmatically
      focusable for the panel-jump pattern without being in the natural
      Tab order — WCAG H91 / SC 2.4.3). Vuetify 4's `v-data-table` doesn't
      expose per-row HTML attributes via the per-cell slots, so we
      compose the whole row here. Per-column cell content is unchanged
      from the per-cell-slot version; only the outer `<tr>` is new.
    -->
    <template #item="{ item }">
      <tr
        :id="`feature-${item.feature_key}`"
        :tabindex="-1"
        class="analysis-row"
      >
        <td>
          <div class="feature-cell" :data-testid="`analysis-row-${item.feature_key}`">
            <div class="feature-name">{{ item.name }}</div>
            <div v-if="item.description" class="feature-desc">{{ item.description }}</div>
          </div>
        </td>

        <td>
          <div class="dominant-cell">
            <div class="pct-text" data-testid="analysis-dominant-pct">
              {{ dominantLabel(item) }}
            </div>
            <div v-if="item.dominant_categories.length > 0" class="badges">
              <template
                v-for="(cat, idx) in item.dominant_categories"
                :key="cat"
              >
                <!--
                  Story 5-7 — `:with-help="true"` opts the badge into the
                  first-use category tooltip (FR39). The dominant cell is the
                  primary surface where Paola needs the "what does Must-have
                  mean" explainer; theme-audit and other surfaces leave the
                  prop at its default `false`.
                -->
                <CatBadge :category="cat" :with-help="true" />
                <span
                  v-if="idx < item.dominant_categories.length - 1"
                  class="badge-sep"
                  aria-hidden="true"
                >/</span>
              </template>
            </div>
          </div>
        </td>

        <td>
          <div class="dist-cell">
            <KanoStackedBar
              :distribution="item.distribution"
              :total="item.n"
              :ariaLabelledBy="`stb-${item.feature_key}`"
              variant="default"
            />
            <KanoStackedBarTable
              :id="`stb-${item.feature_key}`"
              :distribution="item.distribution"
              :total="item.n"
            />
          </div>
        </td>

        <td class="text-right">
          <span class="tabular-num" :data-testid="`analysis-n-${item.feature_key}`">
            {{ item.n }}
          </span>
        </td>
      </tr>
    </template>
  </v-data-table>
</template>

<style scoped>
.analysis-table {
  /*
   * 1440 px centered container mirrors the PM home (Story 3.7) and the
   * project-detail surfaces so Paola's screenshot workflow produces
   * dimensionally-consistent artifacts (UX-DR22).
   */
  max-width: 1440px;
  margin: 0 auto;
}

.feature-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-name {
  font-weight: 700;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.4;
}

.feature-desc {
  font-size: 12px;
  color: rgb(var(--v-theme-on-surface-variant));
  line-height: 1.4;
}

.dominant-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pct-text {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.badges {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.badge-sep {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 14px;
}

.dist-cell {
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tabular-num {
  font-variant-numeric: tabular-nums;
}

/*
 * Row hover — the Vuetify `hover` prop already paints rows on hover; the
 * override below pins the tint to Tixeo's `surface-bright` token so the
 * row background matches Story 5-5 AC #7 (no cursor change, hover only).
 */
.analysis-table :deep(tbody tr:hover) {
  background-color: rgb(var(--v-theme-surface-bright));
}

/*
 * Row-pulse animation for PerCategoryPanels anchor jumps (Story 5-6 AC #7).
 * `.row-pulse` is added by PerCategoryPanels.onAnchorClick() and removed
 * after ~1s (or 0 ms under reduced-motion). The transition smooths the
 * background fade in/out; the focus-visible outline gives the keyboard
 * landing a visible focus ring without bleeding outside the row (negative
 * outline-offset keeps the outline inside the row box).
 */
.analysis-row {
  transition: background-color 200ms ease;
}

.analysis-row.row-pulse {
  background-color: rgb(var(--v-theme-surface-bright));
}

.analysis-row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .analysis-row {
    transition: none;
  }
}
</style>
