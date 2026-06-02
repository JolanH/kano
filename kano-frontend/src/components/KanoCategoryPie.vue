<script lang="ts">
/**
 * `FILL_CLASS` lives in a non-`setup` `<script>` block so the record
 * allocates once at module load instead of once per instance — mirroring
 * `<KanoStackedBar>`. The class names resolve to the scoped `.fill-*`
 * rules below (`category-*` theme tokens — the same suffix vocabulary as
 * CatBadge / KanoStackedBar). The map is declared locally here per the
 * convention noted in `kano-categories.ts` (components with their own
 * class-naming declare their maps locally rather than sharing one).
 */

import type { Category } from '@/api/types'

export const FILL_CLASS: Record<Category, string> = {
  M: 'fill-must',
  L: 'fill-perf',
  E: 'fill-del',
  I: 'fill-ind',
  C: 'fill-cont',
  D: 'fill-doub',
}

export interface Props {
  analysis: import('@/api/types').PollAnalysis
}
</script>

<script setup lang="ts">
/**
 * <KanoCategoryPie> — proportional SVG pie showing how features distribute
 * across the six Kano categories, keyed on each feature's *dominant*
 * category. It sits at the top of the "By category" panel as a visual
 * summary above the per-category feature jump-lists (which it does NOT
 * replace).
 *
 * Tie treatment: a feature dominant in N categories contributes weight
 * `1/N` to EACH — a fractional split — so the slices sum to exactly 100%
 * (unlike the panel lists below, where a tied feature appears whole in
 * every tied section). Features with an empty `dominant_categories` list
 * (the "no-data" feature shape from Story 5-1) contribute nothing.
 *
 * Slice iteration is the canonical M → L → E → I → C → D order
 * (`CATEGORY_CODES`), matching every other analysis surface. Zero-weight
 * categories are omitted. When a single category holds 100% of the weight
 * the slice is drawn as a full `<circle>` — a 0°→360° arc path collapses
 * to nothing because its start and end points coincide.
 *
 * Accessibility follows the codebase's "color + accessible fallback"
 * pairing (cf. KanoStackedBar↔KanoStackedBarTable): the SVG is
 * `role="img"` with a copy-sourced label, and the visible legend
 * enumerates each present category and its percentage as real text, so a
 * screen reader gets the numbers without parsing the geometry.
 *
 * Renders nothing when no feature has a dominant category (total weight
 * ≤ 0). The parent already guards the whole panel behind
 * `panels.length > 0`, so this is a belt-and-braces short-circuit.
 */

import { computed } from 'vue'

import { CATEGORY_CODES, COPY_KEY } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

// `Category` is imported in the sibling non-setup `<script>` block above;
// both blocks share one module scope, so a re-import here is a duplicate
// identifier under vue-tsc's stricter merged-scope check (cf. KanoStackedBar).

const props = defineProps<Props>()
const copy = useCopy()

// SVG geometry — a 100×100 viewBox centred at (50,50). The radius leaves a
// 1-unit margin so the white separating stroke isn't clipped at the edge.
const CENTER = 50
const RADIUS = 49

function formatTenths(tenths: number): string {
  // `tenths` is a percentage expressed in tenths-of-a-percent (e.g. 334 →
  // 33.4%). Mirror the panel / AnalysisTable rounding contract: whole
  // percentages render without a decimal ("50"); fractional ones keep one
  // ("33.4"). Driving the display off integer tenths (rather than a float)
  // lets the largest-remainder pass below guarantee the printed values sum
  // to exactly 100 — see `displayTenths`.
  const whole = tenths / 10
  return tenths % 10 === 0 ? `${whole}` : `${whole.toFixed(1)}`
}

// Largest-remainder apportionment so the *displayed* slice percentages
// always sum to exactly 100.0 — without it, three equal shares each round
// to "33.3" and the legend reads 99.9%. The pie geometry is already an
// exact full circle (it uses raw fractions); this only reconciles the
// rounded text. Input: each present slice's exact fraction (summing to 1).
// Output: per-slice percentage in integer tenths, summing to exactly 1000.
function displayTenths(fractions: number[]): number[] {
  const raw = fractions.map((f) => f * 1000)
  const floors = raw.map(Math.floor)
  const result = [...floors]
  let residue = 1000 - floors.reduce((sum, n) => sum + n, 0)
  // Hand the leftover tenths to the slices with the largest fractional
  // remainder first (standard largest-remainder / Hamilton method).
  const byRemainder = raw
    .map((v, i) => ({ i, rem: v - floors[i] }))
    .sort((a, b) => b.rem - a.rem)
  for (let k = 0; residue > 0 && k < byRemainder.length; k++, residue--) {
    result[byRemainder[k].i] += 1
  }
  return result
}

// Round SVG coordinates so the emitted `d` attribute stays compact and
// stable (helps snapshot-free assertions and keeps the DOM readable).
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function point(fraction: number): { x: number; y: number } {
  // Start the sweep at 12 o'clock (−90°) and run clockwise, the
  // conventional pie orientation.
  const angle = 2 * Math.PI * fraction - Math.PI / 2
  return {
    x: round(CENTER + RADIUS * Math.cos(angle)),
    y: round(CENTER + RADIUS * Math.sin(angle)),
  }
}

function arcPath(startFraction: number, endFraction: number): string {
  const start = point(startFraction)
  const end = point(endFraction)
  const largeArc = endFraction - startFraction > 0.5 ? 1 : 0
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

const weights = computed<Record<Category, number>>(() => {
  const acc: Record<Category, number> = { M: 0, L: 0, E: 0, I: 0, C: 0, D: 0 }
  for (const feature of props.analysis.features) {
    const cats = feature.dominant_categories
    if (!cats || cats.length === 0) continue
    // Fractional tie split: each feature is worth exactly 1, shared evenly
    // across its dominant categories.
    const share = 1 / cats.length
    for (const cat of cats) {
      if (cat in acc) acc[cat] += share
    }
  }
  return acc
})

const total = computed(() =>
  CATEGORY_CODES.reduce((sum, cat) => sum + weights.value[cat], 0),
)

interface Slice {
  category: Category
  fillClass: string
  pathD: string | null
  isFullCircle: boolean
  pctStr: string
  label: string
}

const slices = computed<Slice[]>(() => {
  const denom = total.value
  if (!(denom > 0)) return []
  const present = CATEGORY_CODES.filter((cat) => weights.value[cat] > 0)
  // A lone present category owns 100% — draw a full circle rather than a
  // degenerate full-turn arc whose endpoints coincide.
  const single = present.length === 1
  const fractions = present.map((cat) => weights.value[cat] / denom)
  const tenths = displayTenths(fractions)
  let cursor = 0
  return present.map((cat, idx) => {
    // Geometry uses the exact fraction (so the wedges close a full circle);
    // the label uses the largest-remainder-adjusted tenths (so the printed
    // percentages sum to exactly 100).
    const fraction = fractions[idx]
    const startFraction = cursor
    cursor += fraction
    const pctStr = formatTenths(tenths[idx])
    const label = copy('analysis.pie.sliceLabel', {
      name: copy(COPY_KEY[cat]),
      pct: pctStr,
    })
    return {
      category: cat,
      fillClass: FILL_CLASS[cat],
      pathD: single ? null : arcPath(startFraction, cursor),
      isFullCircle: single,
      pctStr,
      label,
    }
  })
})
</script>

<template>
  <div v-if="slices.length > 0" class="kano-category-pie" data-testid="kano-category-pie">
    <svg
      class="pie-svg"
      viewBox="0 0 100 100"
      role="img"
      :aria-label="copy('analysis.pie.ariaLabel')"
    >
      <template v-for="slice in slices" :key="slice.category">
        <v-tooltip :text="slice.label" location="top">
          <template #activator="{ props: tipProps }">
            <circle
              v-if="slice.isFullCircle"
              v-bind="tipProps"
              :cx="CENTER"
              :cy="CENTER"
              :r="RADIUS"
              :class="['pie-slice', slice.fillClass]"
              :data-category="slice.category"
            />
            <path
              v-else
              v-bind="tipProps"
              :d="slice.pathD ?? undefined"
              :class="['pie-slice', slice.fillClass]"
              :data-category="slice.category"
            />
          </template>
        </v-tooltip>
      </template>
    </svg>
    <ul class="pie-legend" data-testid="kano-category-pie-legend">
      <li
        v-for="slice in slices"
        :key="slice.category"
        :data-category="slice.category"
      >
        <svg class="legend-swatch" viewBox="0 0 10 10" aria-hidden="true">
          <rect width="10" height="10" rx="2" :class="slice.fillClass" />
        </svg>
        <span class="legend-text">{{ slice.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.kano-category-pie {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
  margin: 0 0 24px;
}

.pie-svg {
  display: block;
  width: 180px;
  height: 180px;
  flex: 0 0 auto;
}

/*
 * White hairline between wedges so adjacent category colors read as
 * distinct slices rather than one blended mass. `paint-order: stroke`
 * keeps the stroke from eating into the fill area.
 */
.pie-slice {
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 1;
  paint-order: stroke;
}

.fill-must { fill: rgb(var(--v-theme-category-must)); }
.fill-perf { fill: rgb(var(--v-theme-category-perf)); }
.fill-del  { fill: rgb(var(--v-theme-category-del)); }
.fill-ind  { fill: rgb(var(--v-theme-category-ind)); }
.fill-cont { fill: rgb(var(--v-theme-category-cont)); }
.fill-doub { fill: rgb(var(--v-theme-category-doub)); }

.pie-legend {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pie-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-swatch {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
}

.legend-text {
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
</style>