/**
 * Cross-component constants for the six Kano categories.
 *
 * `CATEGORY_CODES` is the canonical iteration order — the standard-Kano
 * order Must-be → Performance → Attractive → Indifferent → Reverse
 * → Questionable. Every analysis surface that renders the
 * six categories side-by-side (CatBadge lineup, KanoStackedBar segments,
 * KanoStackedBarTable rows, per-category panels) MUST iterate this list
 * so the visual scan-order stays consistent across the page.
 *
 * `COPY_KEY` is typed against `CopyKey` so a typo in a copy-deck reference
 * is caught at compile time instead of silently rendering the raw key via
 * `useCopy`'s graceful-degradation fallback.
 *
 * `SWATCH_CLASS` is CatBadge's specific class mapping (the class names
 * resolve to scoped CSS rules inside `CatBadge.vue`). Other components
 * with their own class-naming conventions (e.g. KanoStackedBar's `.fill-*`
 * SVG rects) declare their maps locally.
 */

import type { Category } from '@/api/types'
import type { CopyKey } from '@/copy/en'

export const CATEGORY_CODES: readonly Category[] = ['M', 'O', 'A', 'I', 'R', 'Q'] as const

export const COPY_KEY: Record<Category, CopyKey> = {
  M: 'pm.category.must',
  O: 'pm.category.perf',
  A: 'pm.category.attr',
  I: 'pm.category.ind',
  R: 'pm.category.rev',
  Q: 'pm.category.que',
}

/**
 * Per-category short definition surfaced by `<CatBadge :with-help="true">`
 * (Story 5-7). These keys seed the tooltip text that explains each Kano
 * category in ≤ 2 lines. The `pm.category.help.*` namespace mirrors the
 * `pm.category.*` label namespace.
 */
export const HELP_KEY: Record<Category, CopyKey> = {
  M: 'pm.category.help.must',
  O: 'pm.category.help.perf',
  A: 'pm.category.help.attr',
  I: 'pm.category.help.ind',
  R: 'pm.category.help.rev',
  Q: 'pm.category.help.que',
}

/**
 * Per-category long-form definition surfaced by `<KanoCategoryReference>` —
 * the standing glossary aside beside the "By category" section. Fuller and
 * Kano-textbook-grounded, intentionally distinct from the terse `HELP_KEY`
 * first-use tooltips (different surface, different length budget). The
 * `analysis.categoryRef.desc.*` namespace mirrors the six `CATEGORY_CODES`.
 */
export const DESC_KEY: Record<Category, CopyKey> = {
  M: 'analysis.categoryRef.desc.must',
  O: 'analysis.categoryRef.desc.perf',
  A: 'analysis.categoryRef.desc.attr',
  I: 'analysis.categoryRef.desc.ind',
  R: 'analysis.categoryRef.desc.rev',
  Q: 'analysis.categoryRef.desc.que',
}

export const SWATCH_CLASS: Record<Category, string> = {
  M: 'swatch-must',
  O: 'swatch-perf',
  A: 'swatch-attr',
  I: 'swatch-ind',
  R: 'swatch-rev',
  Q: 'swatch-que',
}
