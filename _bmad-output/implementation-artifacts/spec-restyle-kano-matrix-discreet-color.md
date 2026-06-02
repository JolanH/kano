---
title: 'Sober Kano matrix — discreet left-bar color code'
type: 'refactor'
created: '2026-06-02'
status: 'done'
route: 'one-shot'
baseline_commit: '978ee8e'
context: []
---

# Sober Kano matrix — discreet left-bar color code

## Intent

**Problem:** The Kano evaluation matrix on the analysis page filled all 25 cells with saturated `--v-theme-category-*` backgrounds and white text — too color-heavy, drowning the actual category names and reading as a block of color rather than a quiet reference table.

**Approach:** Style-only restyle of `KanoMatrixReference.vue`. Cells become neutral white tiles (`surface`) with dark `on-surface` text; the category color is demoted to a discreet 3px colored left bar per cell, with small `border-spacing` gaps letting the card surface show between tiles. The category name stays the accessible channel (NFR10); the per-category white-text contrast overrides are gone since dark-on-white clears AA for every category. The axis-label centering offset now folds in the new tile gap via a shared `--cell-gap` var so it stays centered over the five data columns.

## Suggested Review Order

**The new cell treatment (design intent)**

- Entry point — neutral tile: dark text on `surface`, 1px hairline, color removed from the fill.
  [`KanoMatrixReference.vue:210`](../../kano-frontend/src/components/KanoMatrixReference.vue#L210)

- The discreet color code — each category sets only `border-left-color`, the 3px left bar.
  [`KanoMatrixReference.vue:232`](../../kano-frontend/src/components/KanoMatrixReference.vue#L232)

**Layout integrity**

- Tile gaps via `border-collapse: separate` + `border-spacing`, so each bar is a per-tile left edge, not an inter-cell rule.
  [`KanoMatrixReference.vue:180`](../../kano-frontend/src/components/KanoMatrixReference.vue#L180)

- `--cell-gap` shared by the spacing and the axis-label offset — keeps the dysfunctional label centered over the data columns.
  [`KanoMatrixReference.vue:120`](../../kano-frontend/src/components/KanoMatrixReference.vue#L120)

- Axis label offset = row-head gutter + one tile gap (fixes the centering drift the new spacing introduced).
  [`KanoMatrixReference.vue:148`](../../kano-frontend/src/components/KanoMatrixReference.vue#L148)
