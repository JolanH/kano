<script setup lang="ts">
/**
 * <KanoCategoryReference> — standing Kano glossary rendered as an `<aside>`
 * to the right of the "By category" section (PerCategoryPanels). Lists ALL
 * six categories in the canonical `CATEGORY_CODES` order (M→L→E→I→C→D),
 * each with its theme color swatch, name, and a short Kano-faithful
 * description. This is reference content, not a data view: every category
 * is always present, independent of which categories the poll's features
 * fall into.
 *
 * Accessibility mirrors the codebase's "color + accessible fallback"
 * pairing — the swatch is decorative (`aria-hidden`); the category name and
 * its description are the sole accessible channel (NFR10, UX spec line 580).
 * The aside is labelled by its own heading so a screen reader announces the
 * region before reading the entries.
 *
 * Descriptions come from the `analysis.categoryRef.desc.*` copy namespace —
 * deliberately separate from the terse `pm.category.help.*` CatBadge
 * first-use tooltips (Story 5-7): a standing glossary has room for a fuller
 * sentence than a hover nudge. The swatch class names are shared with
 * CatBadge (`SWATCH_CLASS`) but their background rules are declared locally
 * (scoped styles don't cross component boundaries) — same convention as
 * KanoStackedBar's local `fill-*` map.
 */

import { CATEGORY_CODES, COPY_KEY, DESC_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const HEADING_ID = 'kano-category-reference-heading'
</script>

<template>
  <aside
    class="category-reference"
    :aria-labelledby="HEADING_ID"
    data-testid="kano-category-reference"
  >
    <h3 :id="HEADING_ID" class="reference-heading">
      {{ copy('analysis.categoryRef.heading') }}
    </h3>
    <dl class="reference-list">
      <div
        v-for="cat in CATEGORY_CODES"
        :key="cat"
        class="reference-item"
        :data-testid="`category-reference-item-${cat}`"
      >
        <dt class="reference-term">
          <span :class="['ref-swatch', SWATCH_CLASS[cat]]" aria-hidden="true" />
          <span class="ref-name">{{ copy(COPY_KEY[cat]) }}</span>
        </dt>
        <dd class="reference-desc">{{ copy(DESC_KEY[cat]) }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.category-reference {
  /*
   * Width is owned by the parent `.panels-layout` grid track (70% of the
   * frame — the meaning panel is the dominant column). This component only
   * declares its own box styling; `align-self: start` keeps it pinned to the
   * top of the row rather than stretching to the taller main column.
   */
  align-self: start;
  padding: 16px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface-bright));
}

.reference-heading {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
}

.reference-list {
  margin: 0;
}

.reference-item {
  margin-bottom: 14px;
}

.reference-item:last-child {
  margin-bottom: 0;
}

.reference-term {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.ref-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.ref-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.reference-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgb(var(--v-theme-on-surface-variant));
}

.swatch-must { background-color: rgb(var(--v-theme-category-must)); }
.swatch-perf { background-color: rgb(var(--v-theme-category-perf)); }
.swatch-del  { background-color: rgb(var(--v-theme-category-del)); }
.swatch-ind  { background-color: rgb(var(--v-theme-category-ind)); }
.swatch-cont { background-color: rgb(var(--v-theme-category-cont)); }
.swatch-doub { background-color: rgb(var(--v-theme-category-doub)); }
</style>
