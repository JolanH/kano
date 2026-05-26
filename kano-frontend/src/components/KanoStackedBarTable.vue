<script setup lang="ts">
/**
 * <KanoStackedBarTable> — the accessible-fallback companion to
 * `<KanoStackedBar>`. Renders a plain `<table>` with all six Kano
 * categories in canonical M → L → E → I → C → D order, regardless of
 * which categories are zero. The full enumeration is the load-bearing
 * a11y contract: a screen reader announces "row 4 of 6, Indifferent, 0,
 * 0.0%" — the zero is informative, not noise (compare the bar, which
 * omits zero segments because an invisible-but-focusable rect is a
 * keyboard trap).
 *
 * Default `visible=false` applies the `.sr-only` clip pattern: the table
 * is in the accessibility tree but visually hidden. Story 5.5 wires a
 * sighted-user toggle that flips `visible=true`; this story ships the
 * capability.
 */

import { computed, watchEffect } from 'vue'

import type { Category } from '@/api/types'
import { CATEGORY_CODES, COPY_KEY } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

interface Props {
  /**
   * Per-feature distribution. Should contain all six Category keys; missing
   * keys fall back to 0 via `?? 0` below.
   */
  distribution: Record<Category, number>
  /**
   * Total submissions for percentage calculations. The convention across
   * `<KanoStackedBar>` and this component is that `total === sum(distribution.values())`
   * — passing the poll-level total to a feature with partial data produces
   * percentages that don't add to 100%. The bar component dev-warns on the
   * mismatch; this component does the same (see `watchEffect` below).
   */
  total: number
  /**
   * MUST be globally unique on the page. Story 5.5 renders one table per
   * feature; collision means duplicate DOM ids and an `aria-labelledby`
   * target on the companion `<KanoStackedBar>` that resolves to the wrong
   * table for screen readers. Recommended pattern: `stb-${feature_key}`
   * (Feature.feature_key is a UUID, so uniqueness is free).
   */
  id: string
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
})

const copy = useCopy()

interface Row {
  category: Category
  label: string
  count: number
  pct: string
}

const rows = computed<Row[]>(() =>
  CATEGORY_CODES.map((code) => {
    const count = props.distribution[code] ?? 0
    // Client-side `toFixed(1)` is rounding-half-away-from-zero; Python's
    // service-layer `round(x, 1)` is banker's rounding. For all integer
    // count/total ratios that don't land on a `.x5` half-case the two
    // agree to 1 decimal — the rounding-parity sweep in
    // `tests/unit/kano-stacked-bar-table.spec.ts` pins this for the
    // inputs the analysis path actually produces.
    const pct = props.total > 0 ? ((count / props.total) * 100).toFixed(1) : '0.0'
    return {
      category: code,
      label: copy(COPY_KEY[code]),
      count,
      pct,
    }
  }),
)

// Dev-mode contract warnings — wrapping the `watchEffect` call itself in the
// DEV guard (not just its body) so production builds tree-shake the reactive
// subscription, scheduler entry, and closure for every instance. Mirrors the
// same hoisting in `<KanoStackedBar>` and `<CatBadge>`.
if (import.meta.env.DEV) {
  watchEffect(() => {
    // Symmetric with `<KanoStackedBar>` (AC #8): the table is for the
    // FR37 empty state's *companion*, not the empty state itself.
    if (props.total <= 0) {
      console.warn(
        '[KanoStackedBarTable] mounted with total=' +
          String(props.total) +
          '; parent should render the empty state, not the table.',
      )
      return
    }

    // Contract: `total` MUST equal `sum(distribution.values())`. Diverging
    // produces percentage columns that don't add to 100% — credibility issue
    // for the analysis surface.
    let sum = 0
    for (const code of CATEGORY_CODES) {
      const v = props.distribution[code]
      if (v === undefined || !Number.isFinite(v)) continue
      sum += v
    }
    if (sum !== props.total) {
      console.warn(
        `[KanoStackedBarTable] sum(distribution)=${sum} !== total=${props.total}; ` +
          'caller should pass per-feature total, not poll-level total. ' +
          'Table percentage column will not add to 100%.',
      )
    }
  })
}
</script>

<template>
  <table
    v-if="total > 0"
    :id="id"
    class="kano-stacked-bar-table"
    :class="{ 'sr-only': !visible }"
  >
    <thead>
      <tr>
        <th scope="col">{{ copy('analysis.stackedBarTable.col.category') }}</th>
        <th scope="col">{{ copy('analysis.stackedBarTable.col.count') }}</th>
        <th scope="col">{{ copy('analysis.stackedBarTable.col.percentage') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.category" :data-category="row.category">
        <td>{{ row.label }}</td>
        <td class="tabular-nums num-cell">{{ row.count }}</td>
        <td class="tabular-nums num-cell">{{ row.pct }}%</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.kano-stacked-bar-table {
  /*
   * Visible-mode styling: a minimal table that inherits the surrounding
   * Vuetify typography. Story 5.5 may override via a parent class; the
   * defaults here are calibrated for the theme-audit page.
   */
  border-collapse: collapse;
  width: 100%;
  font-size: 14px;
}

.kano-stacked-bar-table th,
.kano-stacked-bar-table td {
  padding: 6px 12px;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
  text-align: left;
}

.kano-stacked-bar-table th {
  font-weight: 600;
}

.num-cell {
  text-align: right;
}

/*
 * SR-only clip pattern — the WebAIM/MDN-canonical recipe (clip-rect of a
 * 1×1 box, absolute positioning, overflow hidden). The table stays in
 * the accessibility tree (screen readers traverse it) but disappears
 * visually. `clip-path: inset(50%)` is the modern equivalent, but `clip`
 * is universally supported and still recommended for table elements
 * specifically — some SR engines stop reading clip-path-hidden tables.
 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
