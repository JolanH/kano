import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { useCopy } from '@/composables/useCopy'
import en from '@/copy/en'

describe('useCopy — lookup & fallback', () => {
  test('returns the registered string for a known key', () => {
    const copy = useCopy()
    expect(copy('common.version')).toBe('Epoch')
    expect(copy('pm.category.must')).toBe('Must-be')
  })

  test('returns the key itself for a missing key (visible fallback)', () => {
    const copy = useCopy()
    expect(copy('this.key.does.not.exist')).toBe('this.key.does.not.exist')
  })
})

describe('useCopy — placeholder interpolation', () => {
  test('interpolates {name} placeholders from params', () => {
    const copy = useCopy()
    expect(copy('pm.versionBump.dialog.title', { n: 3 })).toBe('Create Epoch 3?')
    expect(copy('respondent.progress', { current: 4, total: 16 })).toBe('Question 4 of 16')
  })

  test('does NOT recurse: a value containing {n} is not re-interpolated', () => {
    const copy = useCopy()
    // With the previous chained-replaceAll implementation, passing `n: '{n}'`
    // would substitute then re-substitute. The single-pass regex makes the
    // substitution one-shot — `{n}` in the value is left as literal text.
    expect(copy('pm.versionBump.dialog.title', { n: '{n}' })).toBe('Create Epoch {n}?')
  })

  test('substitution is order-independent across multiple keys', () => {
    const copy = useCopy()
    // `respondent.progress` has two placeholders. Verify both are resolved
    // in one pass regardless of params insertion order. Compare two
    // permutations of the same params.
    expect(copy('respondent.progress', { current: 4, total: 16 })).toBe('Question 4 of 16')
    expect(copy('respondent.progress', { total: 16, current: 4 })).toBe('Question 4 of 16')
  })

  test('passes through params with no matching placeholder unchanged', () => {
    const copy = useCopy()
    expect(copy('common.version', { unrelated: 'x' })).toBe('Epoch')
  })

  test('throws on a null/undefined param value rather than rendering literal "null"', () => {
    const copy = useCopy()
    expect(() => copy('pm.versionBump.dialog.title', { n: null as unknown as string })).toThrow(
      /null\/undefined/,
    )
    expect(() => copy('pm.versionBump.dialog.title', { n: undefined as unknown as string })).toThrow(
      /null\/undefined/,
    )
  })

  test('unmatched {foo} placeholder in template stays literal when no param provided', () => {
    // Defensive: a template with `{x}` and no `params.x` should leave the
    // placeholder visible (loud failure mode) rather than crash or interpolate
    // the literal string "undefined".
    const copy = useCopy()
    expect(copy('pm.versionBump.dialog.title')).toBe('Create Epoch {n}?')
  })
})

describe('useCopy — registry invariants', () => {
  test('every registered value is a non-empty string', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `key "${key}" must be a string`).toBe('string')
      expect(value, `key "${key}" must be non-empty / non-whitespace`).toMatch(/\S/)
    }
  })

  test('registry is flat — no nested objects', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `key "${key}" must not be a nested object`).toBe('string')
    }
  })

  test('epoch/version glossary: integer-counter keys say "Epoch", free-form release-label keys say "Version"', () => {
    // Replaces the old "never say Epoch" sweep. The two user-facing terms are
    // now deliberately distinct: the auto-incrementing integer `epoch` counter
    // reads "Epoch"; the human-typed free-form `version` string reads
    // "Version". Pin both directions so a future key can't silently mislabel
    // one as the other.
    expect(en['common.version']).toBe('Epoch')
    expect(en['pm.projects.col.epoch']).toMatch(/epoch/i)
    expect(en['pm.polls.columns.version']).toBe('Epoch')
    expect(en['pm.versionBump.dialog.title']).toMatch(/epoch/i)
    expect(en['pm.versionSelector.item.aria']).toMatch(/epoch/i)
    // Free-form release-label keys must stay "Version", never "Epoch".
    for (const key of [
      'pm.projects.newProject.placeholder.version',
      'pm.projects.col.version',
      'pm.projectDetail.version.label',
    ] as const) {
      expect(en[key], `${key} should label the free-form version string`).toMatch(/version/i)
      expect(en[key], `${key} must not say "epoch"`).not.toMatch(/epoch/i)
    }
  })
})

describe('docs/copy-deck.md ↔ en.ts sync', () => {
  // Source of truth for the canonical reference doc. AC #5 demands
  // copy-deck.md mirrors en.ts; this test catches drift the moment it
  // happens instead of waiting for a reviewer to notice. The doc path is
  // intentionally outside `kano-frontend/` — see architecture §File
  // Organization Patterns; readFileSync resolves it relative to repo root.
  const COPY_DECK_PATH = resolve(__dirname, '../../../docs/copy-deck.md')
  const doc = readFileSync(COPY_DECK_PATH, 'utf8')

  // The doc renders keys as `\`some.key\`` inside markdown table rows.
  const documentedKeys = new Set<string>(
    [...doc.matchAll(/\|\s*`([a-zA-Z0-9_.]+)`/g)].map((m) => m[1]),
  )

  test('every key registered in en.ts is documented in copy-deck.md', () => {
    const missing = Object.keys(en).filter((k) => !documentedKeys.has(k))
    expect(missing, 'keys missing from docs/copy-deck.md:').toEqual([])
  })

  test('every key documented in copy-deck.md is registered in en.ts', () => {
    const registered = new Set<string>(Object.keys(en))
    const orphaned = [...documentedKeys].filter((k) => !registered.has(k))
    expect(orphaned, 'keys documented but not registered in en.ts:').toEqual([])
  })
})
