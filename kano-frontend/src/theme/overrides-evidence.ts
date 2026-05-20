/**
 * Single source of truth for the "override evidence" panel on the dev
 * theme-audit page. Each entry pairs the override the Tixeo theme applies
 * with the Material 3 default it suppresses, so a reviewer can scan the
 * page and verify the theme is doing what it claims.
 *
 * `id` is the lookup key the override-list drift test
 * (`tests/unit/theme-overrides-evidence.spec.ts`) uses to match each entry
 * against the actual configuration in `src/plugins/vuetify.ts` and
 * `src/theme/overrides.scss`. Adding a new override to either file
 * without adding a matching entry here fails that test.
 */

export interface OverrideEvidence {
  /** Stable identifier the drift test pivots on (kebab-case). */
  id: string
  /** The override the Tixeo theme applies (visible bullet on the audit page). */
  applied: string
  /** The Material default that's being suppressed. */
  materialDefault: string
}

export const tixeoOverrides: readonly OverrideEvidence[] = [
  {
    id: 'vbtn-flat',
    applied: 'Primary button variant flat',
    materialDefault: 'elevated',
  },
  {
    id: 'vcard-elevation-0',
    applied: 'Card elevation 0',
    materialDefault: '1dp shadow',
  },
  {
    id: 'vtextfield-outlined',
    applied: 'TextField default variant outlined',
    materialDefault: 'filled with floating label',
  },
  {
    id: 'vtextarea-outlined',
    applied: 'Textarea default variant outlined',
    materialDefault: 'filled with floating label',
  },
  {
    id: 'vselect-outlined',
    applied: 'Select default variant outlined',
    materialDefault: 'filled with floating label',
  },
  {
    id: 'medium-emphasis-opacity',
    applied: 'Medium-emphasis opacity 0.78 (subtitles, captions, helper text)',
    materialDefault: '0.6 (collapses to ~3.5:1 contrast, below WCAG AA)',
  },
] as const
