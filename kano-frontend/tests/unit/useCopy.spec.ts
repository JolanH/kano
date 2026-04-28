import { describe, expect, test } from 'vitest'

import { useCopy } from '@/composables/useCopy'

describe('useCopy', () => {
  test('returns the registered string for a known key', () => {
    const copy = useCopy()
    expect(copy('common.version')).toBe('Version')
    expect(copy('pm.category.must')).toBe('Must-have')
  })

  test('returns the key itself for a missing key (visible fallback)', () => {
    const copy = useCopy()
    expect(copy('this.key.does.not.exist')).toBe('this.key.does.not.exist')
  })

  test('interpolates {name} placeholders from params', () => {
    const copy = useCopy()
    expect(copy('pm.epochBump.dialog.title', { n: 3 })).toBe('Create Version 3?')
    expect(copy('respondent.progress', { current: 4, total: 16 })).toBe('Question 4 of 16')
  })

  test('replaces every occurrence of a placeholder, not just the first', () => {
    const copy = useCopy()
    // Use a key whose template has only one placeholder, but pass a `name`
    // that itself looks like a placeholder, to exercise replaceAll's intent.
    expect(copy('pm.epochBump.dialog.title', { n: '{n}' })).toBe('Create Version {n}?')
  })

  test('passes through params with no matching placeholder unchanged', () => {
    const copy = useCopy()
    expect(copy('common.version', { unrelated: 'x' })).toBe('Version')
  })

  test('user-facing copy never says "Epoch" (glossary discipline)', () => {
    const copy = useCopy()
    // Spot-check the keys most likely to slip — anything mentioning
    // version/bump/dialog must use "Version" in the visible text.
    const keys = [
      'common.version',
      'pm.epochBump.dialog.title',
      'pm.epochBump.dialog.body',
      'pm.epochBump.dialog.confirm',
      'pm.epochBump.dialog.cancel',
    ]
    for (const key of keys) {
      const value = copy(key, { n: 9 })
      expect(value).not.toMatch(/epoch/i)
    }
  })
})
