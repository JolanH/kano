/**
 * Constants shared between `<CatBadge>` and any consumer that needs the
 * canonical six-category enumeration (e.g. the dev `/dev/theme-audit`
 * regression row). Lives outside the SFC so the records allocate once at
 * module load instead of per component instance — relevant because the
 * analysis page renders many `<CatBadge>` instances (per-feature rows,
 * per-category panels).
 *
 * `COPY_KEY` is typed against `CopyKey` so a typo in a copy-deck reference
 * is caught at compile time instead of silently rendering the raw key via
 * `useCopy`'s graceful-degradation fallback.
 */

import type { Category } from '@/api/types'
import type { CopyKey } from '@/copy/en'

export const CATEGORY_CODES: readonly Category[] = ['M', 'L', 'E', 'I', 'C', 'D'] as const

export const COPY_KEY: Record<Category, CopyKey> = {
  M: 'pm.category.must',
  L: 'pm.category.perf',
  E: 'pm.category.del',
  I: 'pm.category.ind',
  C: 'pm.category.cont',
  D: 'pm.category.doub',
}

export const SWATCH_CLASS: Record<Category, string> = {
  M: 'swatch-must',
  L: 'swatch-perf',
  E: 'swatch-del',
  I: 'swatch-ind',
  C: 'swatch-cont',
  D: 'swatch-doub',
}
