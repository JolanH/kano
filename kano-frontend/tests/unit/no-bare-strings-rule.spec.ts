/**
 * Programmatic verification that `vue/no-bare-strings-in-template` actually
 * fires on the violations we expect, and passes on the call shapes that go
 * through `useCopy`. This sidesteps the Node-20 vs `eslint-flat-config-utils`
 * incompatibility that blocks `npm run lint` locally — we exercise the rule
 * directly via ESLint's `Linter` API without loading the project's flat
 * config, so the spec runs anywhere `vitest` does.
 *
 * If `npm run lint` ever starts working end-to-end (Story 1.10 pins Node 22
 * LTS in CI), this spec stays useful as a fast, focused contract check.
 */

import { Linter } from 'eslint'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import { describe, expect, test } from 'vitest'

// Mirrors the production config in `eslint.config.js`. Kept verbatim here so
// the spec verifies the *real* attribute coverage, not a stripped-down copy.
const BARE_STRING_ATTRIBUTES = {
  '/^v-/i': [
    'label',
    'placeholder',
    'hint',
    'text',
    'title',
    'subtitle',
    'no-data-text',
    'loading-text',
    'message',
    'tooltip',
  ],
  '/.+/': ['title', 'aria-label', 'aria-placeholder', 'aria-valuetext'],
  input: ['placeholder', 'aria-label'],
  img: ['alt'],
  table: ['summary'],
}

function lintTemplate(template: string): Linter.LintMessage[] {
  const linter = new Linter()
  const source = `<template>${template}</template>`
  // The `.vue` file path is required so `vue-eslint-parser` is engaged —
  // without it ESLint's default JS parser sees `<template>` as a stray `<`
  // token and the rule never runs.
  return linter.verify(
    source,
    {
      files: ['*.vue'],
      languageOptions: {
        parser: vueParser as unknown as Linter.Parser,
      },
      plugins: {
        vue: vuePlugin as unknown as Linter.Plugin,
      },
      rules: {
        'vue/no-bare-strings-in-template': [
          'error',
          { attributes: BARE_STRING_ATTRIBUTES, directives: ['v-text'] },
        ],
      },
    },
    'test.vue',
  )
}

describe('vue/no-bare-strings-in-template — text-node violations', () => {
  test('bare text inside a div is flagged', () => {
    const messages = lintTemplate('<div>Submit</div>')
    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('vue/no-bare-strings-in-template')
  })

  test('text inside a Vuetify component is flagged', () => {
    const messages = lintTemplate('<v-app-bar-title>Kano</v-app-bar-title>')
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.some((m) => m.ruleId === 'vue/no-bare-strings-in-template')).toBe(true)
  })

  test('useCopy() call inside a template binding passes', () => {
    const messages = lintTemplate('<div>{{ copy(\'pm.layout.appBar.title\') }}</div>')
    expect(messages).toHaveLength(0)
  })

  test('Vuetify icon in prop form passes (icon attr is not in attribute checklist)', () => {
    // The idiomatic Vuetify 4 form is `<v-icon icon="mdi-folder" />` — the
    // icon identifier is a token, not user-facing copy. Verifies the lint
    // config doesn't flag `icon` attribute literals; the project standard
    // is to use this form (not the text-node form which DOES get flagged).
    const messages = lintTemplate(
      '<v-icon icon="mdi-folder" aria-hidden="true" />',
    )
    expect(messages).toHaveLength(0)
  })
})

describe('vue/no-bare-strings-in-template — attribute literal violations', () => {
  test('Vuetify v-btn `text` prop literal is flagged', () => {
    const messages = lintTemplate('<v-btn text="Submit" />')
    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('vue/no-bare-strings-in-template')
  })

  test('Vuetify v-text-field `label` prop literal is flagged', () => {
    const messages = lintTemplate('<v-text-field label="Email" />')
    expect(messages).toHaveLength(1)
  })

  test('Vuetify v-text-field `placeholder` prop literal is flagged', () => {
    const messages = lintTemplate('<v-text-field placeholder="Search..." />')
    expect(messages).toHaveLength(1)
  })

  test('Vuetify v-text-field `hint` prop literal is flagged', () => {
    const messages = lintTemplate('<v-text-field hint="At least 8 characters" />')
    expect(messages).toHaveLength(1)
  })

  test('aria-label literal on a plain element is flagged', () => {
    const messages = lintTemplate('<button aria-label="Close menu" />')
    expect(messages).toHaveLength(1)
  })

  test('bound prop with useCopy() passes', () => {
    const messages = lintTemplate(
      '<v-btn :text="copy(\'common.snackbar.success\')" />',
    )
    expect(messages).toHaveLength(0)
  })

  test('img alt literal is flagged', () => {
    const messages = lintTemplate('<img src="x.png" alt="Profile photo" />')
    expect(messages).toHaveLength(1)
  })
})
