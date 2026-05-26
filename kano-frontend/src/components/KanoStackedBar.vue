<script lang="ts">
/**
 * `FILL_CLASS` lives in a non-`setup` `<script>` block so the record
 * allocates once at module load instead of once per `<KanoStackedBar>`
 * instance. The analysis page (Story 5.5) renders one bar per feature
 * row — could be 20+ on a real poll — so per-instance allocation matters.
 *
 * `Props` also lives here (rather than in `<script setup>`) so vue-tsc's
 * template typing can resolve it from the merged module scope without
 * tripping the "private name in __VLS_export" check that two-block SFCs
 * hit when the props interface is setup-local.
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
  distribution: Record<Category, number>
  total: number
  ariaLabelledBy: string
  variant?: 'default' | 'large' | 'mini'
}
</script>

<script setup lang="ts">
/**
 * <KanoStackedBar> — proportional horizontal SVG showing the per-feature
 * Kano-category distribution. The bar is the visual half of the
 * "color + accessible fallback" pairing — its sighted-only signal is
 * delivered alongside `<KanoStackedBarTable>` (this component's screen-
 * reader companion). The caller wires the two via the `aria-labelled-by`
 * prop (pointing at the table's `id`); the bar carries `role="img"`.
 *
 * Segment iteration order is fixed M → L → E → I → C → D regardless of
 * the prop's object-key insertion order — the Kano-textbook canonical
 * order (UX spec line 1277). Zero-count segments are omitted from the
 * SVG entirely (a 0-width rect would still receive Tab focus and a
 * "0 responses" tooltip — both noise). The companion table renders all
 * six rows including zeros: tabular reading needs the full enumeration.
 *
 * Theme tokens (`category-*`, not the original story spec's `kano-*`)
 * track the Story 1-5 (5,1)→D reconciliation — same suffix vocabulary
 * landing decision as `<CatBadge>`.
 */

import { computed, watchEffect } from 'vue'

import { CATEGORY_CODES, COPY_KEY } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

// `Category` is imported in the sibling non-setup `<script>` block above;
// both blocks share one module scope, so a re-import here is a duplicate
// identifier under vue-tsc's stricter merged-scope check.

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

const copy = useCopy()

interface Segment {
  category: Category
  x: number
  width: number
  fillClass: string
  tooltip: string
}

const segments = computed<Segment[]>(() => {
  if (props.total <= 0) return []
  const out: Segment[] = []
  let cursor = 0
  for (const code of CATEGORY_CODES) {
    const count = props.distribution[code] ?? 0
    // `Number.isFinite` rejects NaN / Infinity / -Infinity; the `> 0` covers
    // both "no responses for this category" (skip — zero-segment is silent
    // by AC #7) and "negative count from a corrupted upstream" (also skip,
    // logged via the dev-mode contract warning below).
    if (!Number.isFinite(count) || count <= 0) continue
    const width = (count / props.total) * 100
    const pct = (count / props.total * 100).toFixed(1)
    out.push({
      category: code,
      x: cursor,
      width,
      fillClass: FILL_CLASS[code],
      tooltip: copy('analysis.stackedBar.tooltip', {
        name: copy(COPY_KEY[code]),
        count,
        pct,
      }),
    })
    cursor += width
  }
  return out
})

// Dev-mode contract warnings — wrapping the `watchEffect` call itself in the
// DEV guard (not just its body) so production builds tree-shake the reactive
// subscription, scheduler entry, and closure for every instance. The bar is
// instantiated once per feature row on the analysis page (20+ at scale); a
// no-op watchEffect per instance is real cost.
if (import.meta.env.DEV) {
  watchEffect(() => {
    // Anti-pattern safety net (AC #8): the bar should never mount when
    // there are zero submissions — Story 5.5's page-level FR37 empty state
    // replaces it.
    if (props.total <= 0) {
      console.warn(
        '[KanoStackedBar] mounted with total=' +
          String(props.total) +
          '; parent should render the empty state, not the bar.',
      )
      return
    }

    // Contract: `total` MUST equal `sum(distribution.values())`. Passing the
    // poll-level total to a feature with all-zero distribution produces a
    // visually-blank-but-mounted bar; passing a per-feature sum mismatched
    // with the actual responses produces a sub-100% rendering.
    let sum = 0
    let nonFiniteSeen = false
    let negativeSeen = false
    for (const code of CATEGORY_CODES) {
      const v = props.distribution[code]
      if (v === undefined) continue
      if (!Number.isFinite(v)) {
        nonFiniteSeen = true
        continue
      }
      if (v < 0) negativeSeen = true
      sum += v
    }
    if (nonFiniteSeen) {
      console.warn('[KanoStackedBar] distribution contains NaN / Infinity — segments dropped silently')
    }
    if (negativeSeen) {
      console.warn('[KanoStackedBar] distribution contains negative counts — segments dropped silently')
    }
    if (Number.isFinite(sum) && sum !== props.total) {
      console.warn(
        `[KanoStackedBar] sum(distribution)=${sum} !== total=${props.total}; ` +
          'caller should pass per-feature total, not poll-level total. ' +
          'Bar percentages will not add to 100% on the page.',
      )
    }

    // Empty / whitespace-only ariaLabelledBy silently breaks the bar↔table
    // a11y pairing — `aria-labelledby=""` is invalid per ARIA and the SVG
    // falls back to a generic graphic announcement.
    if (!props.ariaLabelledBy?.trim()) {
      console.warn(
        '[KanoStackedBar] empty ariaLabelledBy — the bar↔table a11y pairing is broken. ' +
          'Pass the id of the companion KanoStackedBarTable.',
      )
    }
  })
}
</script>

<template>
  <svg
    v-if="total > 0"
    class="kano-stacked-bar"
    :class="`variant-${variant}`"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    role="img"
    :aria-labelledby="ariaLabelledBy"
  >
    <!--
      `viewBox` is normalized to 100 × 100 — widths feed in as percentages
      directly, and the rendered height is driven by the variant CSS
      (`height: 12px / 16px / 4px`). `preserveAspectRatio="none"` lets
      the SVG stretch independently in X and Y so the variant height
      isn't compressed by the aspect ratio.
    -->
    <v-tooltip
      v-for="seg in segments"
      :key="seg.category"
      :text="seg.tooltip"
      location="top"
    >
      <template #activator="{ props: tipProps }">
        <rect
          v-bind="tipProps"
          :x="seg.x"
          :width="seg.width"
          y="0"
          height="100"
          :class="seg.fillClass"
          tabindex="0"
          :data-category="seg.category"
        />
      </template>
    </v-tooltip>
  </svg>
</template>

<style scoped>
.kano-stacked-bar {
  display: block;
  width: 100%;
  /*
   * The viewBox's Y axis is normalized (0..100) so the visible height
   * is driven entirely by the variant rule below. `preserveAspectRatio
   * ="none"` in the template lets the SVG render at the rule's height
   * without letterboxing.
   */
}

.variant-default { height: 12px; }
.variant-large   { height: 16px; }
.variant-mini    { height:  4px; }

.fill-must { fill: rgb(var(--v-theme-category-must)); }
.fill-perf { fill: rgb(var(--v-theme-category-perf)); }
.fill-del  { fill: rgb(var(--v-theme-category-del)); }
.fill-ind  { fill: rgb(var(--v-theme-category-ind)); }
.fill-cont { fill: rgb(var(--v-theme-category-cont)); }
.fill-doub { fill: rgb(var(--v-theme-category-doub)); }

/*
 * Focus ring — 2 px Tixeo primary outline + 1 px offset (per AC #3 and
 * UX spec line 581). The single-color outline meets 3:1 contrast against
 * most of the Kano palette but lands closer to 2:1 against the
 * Contradictory amber-700 segment. If the Story 5-8 manual a11y sweep
 * flags this, escalate to a composed pattern (orange outline + 1 px
 * inner white ring via `box-shadow`); the Dev Notes pin the recipe.
 */
.kano-stacked-bar rect:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
</style>
