<script setup lang="ts">
/**
 * <KanoMatrixReference> — static 5×5 Kano evaluation table rendered as a card
 * directly under <KanoCategoryReference> (the "categories meaning" panel). It
 * reminds the PM how a pair of poll answers becomes a category: rows are the
 * respondent's *functional* answer (feature present), columns the
 * *dysfunctional* answer (feature absent), and each of the 25 cells shows the
 * resulting Kano category. The layout follows the classic Kano evaluation
 * table; the cell fill stays neutral and the category color shows only as a
 * discreet left bar, reusing THIS product's `--v-theme-category-*` palette so
 * the matrix stays coherent with the swatches in the reference above it.
 *
 * Reference content, not a data view: the grid is identical for every poll. It
 * is a display mirror of the backend `kano_matrix.py` (via `KANO_MATRIX`) — it
 * never categorizes anything; the server computes every persisted category.
 *
 * Accessibility mirrors the codebase's "color + accessible fallback" pairing:
 * each cell carries the category NAME as real text (color is reinforcement,
 * not the sole channel — NFR10). The grid is a semantic `<table>` with
 * `<th scope>` answer headers on both axes plus an `sr-only` `<caption>` that
 * disambiguates the functional/dysfunctional axes (both share the same five
 * answer labels). Cell `cell-*` classes resolve to local scoped rules — same
 * component-local convention as CatBadge's `swatch-*` map.
 */

import {
  COPY_KEY,
  KANO_MATRIX,
  MATRIX_ANSWER_KEYS,
} from '@/components/kano-categories'
import type { Category } from '@/api/types'
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const HEADING_ID = 'kano-matrix-reference-heading'

const CELL_CLASS: Record<Category, string> = {
  M: 'cell-must',
  O: 'cell-perf',
  A: 'cell-attr',
  I: 'cell-ind',
  R: 'cell-rev',
  Q: 'cell-que',
}
</script>

<template>
  <aside
    class="matrix-reference"
    :aria-labelledby="HEADING_ID"
    data-testid="kano-matrix-reference"
  >
    <h3 :id="HEADING_ID" class="matrix-heading">
      {{ copy('analysis.kanoMatrix.heading') }}
    </h3>

    <div class="matrix-body">
      <p class="axis-label axis-functional">
        <span>{{ copy('analysis.kanoMatrix.functionalAxis') }}</span>
      </p>

      <div class="matrix-grid">
        <p class="axis-label axis-dysfunctional">
          {{ copy('analysis.kanoMatrix.dysfunctionalAxis') }}
        </p>

        <table class="matrix-table">
          <caption class="sr-only">{{ copy('analysis.kanoMatrix.tableCaption') }}</caption>
          <thead>
          <tr>
            <td class="corner" aria-hidden="true" />
            <th
              v-for="key in MATRIX_ANSWER_KEYS"
              :key="key"
              scope="col"
              class="col-head"
            >
              {{ copy(key) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, fqIdx) in KANO_MATRIX" :key="fqIdx">
            <th scope="row" class="row-head">
              {{ copy(MATRIX_ANSWER_KEYS[fqIdx]) }}
            </th>
            <td
              v-for="(cat, dqIdx) in row"
              :key="dqIdx"
              :class="['matrix-cell', CELL_CLASS[cat]]"
              :data-category="cat"
              :data-testid="`kano-matrix-cell-${fqIdx + 1}-${dqIdx + 1}`"
            >
              {{ copy(COPY_KEY[cat]) }}
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.matrix-reference {
  /*
   * Sibling card to KanoCategoryReference, stacked beneath it in the shared
   * 70% reference column (see PerCategoryPanels `.panels-reference-column`).
   * Same box styling as the reference aside so the two read as a pair.
   */
  /* Single source for the row-header gutter width: the corner cell, the row
     headers, and the dysfunctional-axis label's left offset all read it, so
     the label stays centered over the five data columns regardless of value. */
  --row-head-w: 92px;
  /* Tile gap. Read by the table's `border-spacing` AND folded into the axis
     label's left offset — `border-spacing` pushes the first data column right
     by one gap past the row-head gutter, so the label must offset by both to
     stay centered over the data columns. */
  --cell-gap: 4px;
  align-self: start;
  padding: 16px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface-bright));
}

.matrix-heading {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
}

.axis-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface-variant));
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.axis-dysfunctional {
  /* Shares the table's left origin (both live in `.matrix-grid`); the
     row-header gutter offset lands it centered over the five data columns,
     tracking `--row-head-w` so it can't drift from the actual gutter. */
  margin-bottom: 6px;
  padding-left: calc(var(--row-head-w) + var(--cell-gap));
  text-align: center;
}

.matrix-body {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.matrix-grid {
  /* Holds the dysfunctional label + the table so they share a left origin. */
  flex: 1;
  min-width: 0;
}

.axis-functional {
  /* Vertical label reading bottom-to-top, mirroring the reference image. */
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.matrix-table {
  /* `separate` + a small spacing turns each cell into its own quiet tile with
     gaps showing the card surface through — a sober grid, not a block of color.
     (Collapsed borders would merge each cell's colored left bar into a single
     ambiguous rule between columns.) */
  border-collapse: separate;
  border-spacing: var(--cell-gap);
  table-layout: fixed;
  width: 100%;
}

.corner {
  width: var(--row-head-w);
  border: none;
  background: transparent;
}

.col-head,
.row-head {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface-variant));
  padding: 4px 6px;
}

.col-head {
  text-align: center;
  vertical-align: bottom;
}

.row-head {
  width: var(--row-head-w);
  text-align: right;
  white-space: nowrap;
}

.matrix-cell {
  /*
   * Sober tile: dark `on-surface` text on a plain `surface` fill is the
   * primary read; color is demoted to a discreet 3px bar on the cell's left
   * edge (`.cell-*` below), so the category name carries identity and color
   * only reinforces it (NFR10). Dark-on-white clears WCAG AA for every
   * category, so the old per-category white-text contrast overrides are gone.
   */
  padding: 9px 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-left: 3px solid rgb(var(--v-theme-outline-variant));
  border-radius: 3px;
  line-height: 1.25;
}

/* Color code lives only in the left bar (`border-left-color`); the tile fill
   and text stay neutral. */
.cell-must { border-left-color: rgb(var(--v-theme-category-must)); }
.cell-perf { border-left-color: rgb(var(--v-theme-category-perf)); }
.cell-attr { border-left-color: rgb(var(--v-theme-category-attr)); }
.cell-ind  { border-left-color: rgb(var(--v-theme-category-ind)); }
.cell-rev  { border-left-color: rgb(var(--v-theme-category-rev)); }
.cell-que  { border-left-color: rgb(var(--v-theme-category-que)); }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
