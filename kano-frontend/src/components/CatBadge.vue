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
 * Tooltip help text is intentionally NOT part of this surface — Story 5.7
 * composes `<v-tooltip>` around `<CatBadge>` at call sites that need it.
 */

import { computed, watchEffect } from 'vue'

import type { Category } from '@/api/types'
import { COPY_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

interface Props {
  category: Category
}

const props = defineProps<Props>()
const copy = useCopy()

const isValid = computed(() => props.category in COPY_KEY)
const label = computed(() => copy(COPY_KEY[props.category]))

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
  <span v-if="isValid" class="cat-badge" :data-category="category">
    <span :class="['cat-swatch', SWATCH_CLASS[category]]" aria-hidden="true" />
    <span class="cat-label">{{ label }}</span>
  </span>
</template>

<style scoped>
.cat-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: baseline;
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
