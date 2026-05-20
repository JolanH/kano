/**
 * Pins the audit page's "override evidence" bullet list to the actual
 * theme configuration. Every entry the bullet list claims must be backed
 * by a matching declaration in either `src/plugins/vuetify.ts` or
 * `src/theme/overrides.scss`. Drift between what's documented and what's
 * configured is a class of regression the visual-baseline test won't catch
 * (the bullets are static text, the config is what actually styles the
 * surface).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { tixeoOverrides } from '@/theme/overrides-evidence'

const PLUGIN_VUETIFY = resolve(__dirname, '../../src/plugins/vuetify.ts')
const OVERRIDES_SCSS = resolve(__dirname, '../../src/theme/overrides.scss')

describe('theme overrides — evidence ↔ actual configuration', () => {
  const pluginSrc = readFileSync(PLUGIN_VUETIFY, 'utf8')
  const overridesSrc = readFileSync(OVERRIDES_SCSS, 'utf8')

  // Each evidence entry must trace to a real configuration line.
  const evidenceContracts: Record<string, () => boolean> = {
    'vbtn-flat': () => /VBtn:\s*\{\s*variant:\s*['"]flat['"]/.test(pluginSrc),
    'vcard-elevation-0': () =>
      /VCard:[^}]*elevation:\s*0/.test(pluginSrc) ||
      /\.v-card\s*\{[^}]*box-shadow:\s*none/.test(overridesSrc),
    'vtextfield-outlined': () =>
      /VTextField:[^}]*variant:\s*['"]outlined['"]/.test(pluginSrc),
    'vtextarea-outlined': () =>
      /VTextarea:[^}]*variant:\s*['"]outlined['"]/.test(pluginSrc),
    'vselect-outlined': () =>
      /VSelect:[^}]*variant:\s*['"]outlined['"]/.test(pluginSrc),
    'medium-emphasis-opacity': () =>
      /--v-medium-emphasis-opacity:\s*0\.78/.test(overridesSrc),
  }

  for (const override of tixeoOverrides) {
    test(`evidence entry "${override.id}" is backed by actual configuration`, () => {
      const contract = evidenceContracts[override.id]
      expect(
        contract,
        `no contract registered for evidence id "${override.id}" — add one to evidenceContracts`,
      ).toBeDefined()
      expect(
        contract(),
        `evidence entry "${override.id}" (${override.applied}) is NOT present in src/plugins/vuetify.ts or src/theme/overrides.scss`,
      ).toBe(true)
    })
  }

  test('every contract has a matching evidence entry', () => {
    const evidenceIds = new Set(tixeoOverrides.map((o) => o.id))
    const orphanedContracts = Object.keys(evidenceContracts).filter(
      (id) => !evidenceIds.has(id),
    )
    expect(
      orphanedContracts,
      'contracts exist for ids not in the evidence list:',
    ).toEqual([])
  })
})
