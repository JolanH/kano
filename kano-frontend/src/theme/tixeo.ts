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
  // `outline` is a subtle separator color used by Vuetify card/input
  // borders. It is intentionally low-contrast (~1.5:1 vs surface) — it is
  // a *decorative* separator, not an interactive focus ring. Focus rings
  // pair `primary` against `surface` (3.3:1, listed under largeOrUi).
  // The `decorativeTokens` list at the bottom of this file pins this
  // intent and is enforced by `theme-contrast.spec.ts`.
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
  // the small-text labels that ride next to the swatch. Token suffixes
  // mirror the backend `Category` enum (M, O, A, I, R, Q — see
  // `kano-backend/src/kano/services/kano_matrix.py`): `must`/`perf`/`attr`/
  // `ind`/`rev`/`que`. The standard Kano move from the bespoke six-category
  // model kept the existing AA-compliant hex palette and remapped tokens by
  // concept: the purple #7C3AED now backs Attractive, the brown #B45309 now
  // backs Reverse, and the goldenrod #8F6912 now backs Questionable.
  'category-must': '#1E3A8A',
  'category-perf': '#0D9488',
  'category-attr': '#7C3AED',
  'category-ind': '#6B7280',
  'category-rev': '#B45309',
  // Questionable keeps the dark goldenrod (~5:1 on `surface`) that was chosen
  // to stay unmistakable from the cool-gray `category-ind` (#6B7280) — a
  // lighter gold sat at 2.7:1 and failed the AA floor in theme-contrast.
  'category-que': '#8F6912',
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
    // Semantic on-X / X pairs — every `<v-alert type="..." />` renders these.
    // `on-warning` is intentionally near-black (Tixeo amber + white = 2.93:1
    // and would fail AA — see Story 1-8 audit run for the discovery).
    { fg: 'on-success', bg: 'success' },
    { fg: 'on-warning', bg: 'warning' },
    { fg: 'on-error', bg: 'error' },
    { fg: 'on-info', bg: 'info' },
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
    { fg: 'category-attr', bg: 'surface' },
    { fg: 'category-ind', bg: 'surface' },
    { fg: 'category-rev', bg: 'surface' },
    { fg: 'category-que', bg: 'surface' },
    { fg: 'on-primary', bg: 'primary' },
  ],
} as const

/**
 * Tokens that are NEVER expected to meet a contrast floor against any
 * other token. The contrast spec asserts none of these appear as the
 * foreground of any contrast pair, and treats their presence as evidence
 * that a contributor mistakenly used a decorative color where an
 * interactive / text role was intended.
 *
 * - `outline` / `outline-variant`: subtle separator borders (~1.5:1).
 * - `surface-bright` / `background`: page-level fills, never paired against
 *   a foreground except via the already-tested `on-surface` tokens.
 */
export const decorativeTokens = [
  'outline',
  'outline-variant',
  'surface-bright',
  'background',
] as const satisfies readonly TixeoColorToken[]
