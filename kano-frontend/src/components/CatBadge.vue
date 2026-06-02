<script setup lang="ts">
/**
 * <CatBadge> — color swatch + human-readable category name for a Kano
 * category code (M/L/E/I/C/D). The swatch is decorative (`aria-hidden`);
 * the label is the sole accessible information channel (NFR10, UX spec
 * line 580 — color never the sole signal).
 *
 * Suffix vocabulary (`cont`/`doub`) tracks the backend `Category` enum
 * (`Contradictory`/`Doubtful`), not the UX-draft `Reverse`/`Questionable`
 * the original story spec referenced — corrected during the Story 1-5
 * (5,1)→D reconciliation.
 *
 * Story 5-7 added the optional `withHelp` prop: when set, the badge is
 * wrapped in a `<v-tooltip>` whose text is a short first-use definition
 * of the category (`pm.category.help.*` copy keys). Default `withHelp =
 * false` preserves the no-tooltip surface used by the theme-audit page
 * and any other call site that doesn't want the overlay. Vuetify's
 * `v-tooltip` activator wiring takes care of `aria-describedby` on the
 * tab-focusable wrapper — the help text is supplementary, never load-
 * bearing (the visible label still carries the category identity).
 */

import { computed, watchEffect } from 'vue'

import type { Category } from '@/api/types'
import { COPY_KEY, HELP_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

interface Props {
  category: Category
  /**
   * When true, wrap the badge in a `<v-tooltip>` that displays a short
   * first-use definition of the category (Story 5-7). Default false.
   *
   * Open delay is 300 ms — Vuetify 4's `:open-delay` applies to BOTH hover
   * and keyboard focus (not just hover, despite the design intent's wish
   * for an immediate focus-reveal). 300 ms on focus is still WCAG SC 1.4.13
   * compliant (the clause covers dismissibility / hoverability / persistence,
   * not zero-delay reveal). Keyboard-primary users tabbing through 20+
   * badges accept the 300 ms cadence as the price of preventing hover-sweep
   * tooltip-spam.
   */
  withHelp?: boolean
}

const props = withDefaults(defineProps<Props>(), { withHelp: false })
const copy = useCopy()

const isValid = computed(() => props.category in COPY_KEY)
const label = computed(() => copy(COPY_KEY[props.category]))
// Guard the `HELP_KEY[…]` lookup against runtime drift: when `props.category`
// is not a valid Category, the indexed lookup returns `undefined` and
// `copy(undefined)` would propagate down to `useCopy`'s graceful-degradation
// fallback. The `v-if="isValid"` in the template short-circuits the help
// branch, but the computed itself is defined unconditionally; using
// `isValid.value` to gate the lookup keeps the reactive subscription
// honest and survives future refactors that consume `helpText` outside the
// `v-if` (e.g. inline-help patterns built on top of CatBadge).
const helpText = computed(() =>
  isValid.value ? copy(HELP_KEY[props.category]) : '',
)

// Belt-and-braces against runtime drift (API JSON casts, `as any` casts at
// call sites, hot-reload bleed). The DEV guard wraps the `watchEffect` call
// itself so production builds tree-shake the reactive subscription entirely —
// CatBadge is instantiated 6+ times per analysis-page row and any per-instance
// allocation matters at scale.
if (import.meta.env.DEV) {
  watchEffect(() => {
    if (!isValid.value) {
      console.warn(`[CatBadge] invalid category prop: ${String(props.category)}`)
    }
  })
}
</script>

<template>
  <template v-if="isValid">
    <v-tooltip
      v-if="withHelp"
      :text="helpText"
      location="top"
      :open-delay="300"
    >
      <template #activator="{ props: tipProps }">
        <span
          v-bind="tipProps"
          class="cat-badge cat-badge-help"
          :data-category="category"
          tabindex="0"
        >
          <span :class="['cat-swatch', SWATCH_CLASS[category]]" aria-hidden="true" />
          <span class="cat-label">{{ label }}</span>
        </span>
      </template>
    </v-tooltip>
    <span v-else class="cat-badge" :data-category="category">
      <span :class="['cat-swatch', SWATCH_CLASS[category]]" aria-hidden="true" />
      <span class="cat-label">{{ label }}</span>
    </span>
  </template>
</template>

<style scoped>
.cat-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: baseline;
}

/*
 * `with-help` badges are keyboard-focusable (tabindex="0") so the tooltip
 * reveals on focus per WCAG SC 1.4.13. The focus-visible outline uses the
 * Tixeo primary outline pattern (UX spec line 581).
 */
.cat-badge-help {
  cursor: help;
  border-radius: 4px;
}

.cat-badge-help:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.cat-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.cat-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.swatch-must { background-color: rgb(var(--v-theme-category-must)); }
.swatch-perf { background-color: rgb(var(--v-theme-category-perf)); }
.swatch-del  { background-color: rgb(var(--v-theme-category-del)); }
.swatch-ind  { background-color: rgb(var(--v-theme-category-ind)); }
.swatch-cont { background-color: rgb(var(--v-theme-category-cont)); }
.swatch-doub { background-color: rgb(var(--v-theme-category-doub)); }
</style>
