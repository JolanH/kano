/**
 * Tixeo Vuetify theme tokens — single source of truth for all colors,
 * including the six Kano category swatches that drive `<cat-badge>`,
 * `<kano-stacked-bar>`, and the per-category panels in Epic 5.
 *
 * Hex values come from `_bmad-output/planning-artifacts/ux-design-specification.md
 * §Color System` — keep them in sync with that document. Contrast pairings
 * are validated by `tests/unit/theme-contrast.spec.ts`; colorblind-vision
 * checks are documented in `docs/accessibility/kano-palette-validation.md`.
 */

import type { ThemeDefinition } from 'vuetify'

export const tixeoColors = {
  // Core
  primary: '#E36A2F',
  'on-primary': '#FFFFFF',
  surface: '#FFFFFF',
  'surface-bright': '#F7F8FA',
  'surface-variant': '#1C1F26',
  'on-surface': '#1A1D23',
  'on-surface-variant': '#6B7280',
  'on-surface-dark': '#FFFFFF',
  'on-surface-dark-variant': '#9AA0AB',
  outline: '#D1D5DB',
  'outline-variant': '#E5E7EB',
  background: '#F7F8FA',

  // Semantic
  success: '#15803D',
  'on-success': '#FFFFFF',
  warning: '#CA8A04',
  // amber-600 on white is 2.9:1 — below AA for white text. Pair warning with
  // near-black text instead (matches a standard caution-sign register and
  // keeps the underlying amber hex aligned with the UX spec).
  'on-warning': '#1A1D23',
  error: '#B91C1C',
  'on-error': '#FFFFFF',
  info: '#1D4ED8',
  'on-info': '#FFFFFF',

  // Kano categories — must each meet 4.5:1 against `surface` (white) for
  // the small-text labels that ride next to the swatch.
  'category-must': '#1E3A8A',
  'category-perf': '#0D9488',
  'category-del': '#7C3AED',
  'category-ind': '#6B7280',
  'category-rev': '#B45309',
  'category-que': '#78716C',
} as const

export type TixeoColorToken = keyof typeof tixeoColors

export const tixeoTheme: ThemeDefinition = {
  dark: false,
  colors: { ...tixeoColors },
}

/** Foreground/background pairings exercised by the contrast spec. */
export const contrastPairings = {
  /** WCAG AA normal-text minimum: 4.5:1. */
  bodyText: [
    { fg: 'on-surface', bg: 'surface' },
    { fg: 'on-surface-variant', bg: 'surface' },
    { fg: 'on-surface-dark', bg: 'surface-variant' },
    { fg: 'on-surface-dark-variant', bg: 'surface-variant' },
  ],
  /**
   * WCAG AA large-text + non-text-UI minimum: 3:1.
   *
   * `on-primary` (white) on `primary` (Tixeo orange) is intentionally listed
   * here, not under bodyText — see UX spec §Color System: Tixeo orange + white
   * meets AA only for solid-button labels at ≥16px / ≥14px-bold; never as
   * body text on a white surface.
   */
  largeOrUi: [
    { fg: 'category-must', bg: 'surface' },
    { fg: 'category-perf', bg: 'surface' },
    { fg: 'category-del', bg: 'surface' },
    { fg: 'category-ind', bg: 'surface' },
    { fg: 'category-rev', bg: 'surface' },
    { fg: 'category-que', bg: 'surface' },
    { fg: 'on-primary', bg: 'primary' },
  ],
} as const
