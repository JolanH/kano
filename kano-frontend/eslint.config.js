import vuetify from 'eslint-config-vuetify'

// `vue/no-bare-strings-in-template` keeps user-facing strings out of `<template>`
// blocks. Without the `attributes` extension below the rule only catches text
// nodes (`<div>Hello</div>`), which silently misses Vuetify's most common
// surface — prop-string literals like `<v-btn text="Submit" />` and
// `<v-text-field label="Email" />`. The `attributes` map below extends the
// rule to flag those literals on every Vuetify (`v-…`) component plus the
// HTML elements that historically carry user-facing copy.
//
// The architecture's enforcement rule (architecture.md §Enforcement
// Guidelines, "Render every user-facing string via the copy-deck `useCopy()`
// composable") makes this lint a hard gate, not a code-review convention.
//
// A unit test (`tests/unit/no-bare-strings-rule.spec.ts`) exercises the rule
// through ESLint's programmatic `Linter` API so the rule's behavior is
// verified even when `npm run lint` can't run end-to-end (the project-level
// lint pipeline depends on `eslint-flat-config-utils` which requires Node
// ≥ 21; the spec bypasses that loader and tests the rule directly).
const BARE_STRING_ATTRIBUTES = {
  // Match every Vuetify component (custom-element tag prefix `v-`). The
  // attribute names below are the props Vuetify 4 uses to surface text.
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
  // Standard HTML/ARIA carriers of user-facing text.
  '/.+/': ['title', 'aria-label', 'aria-placeholder', 'aria-valuetext'],
  input: ['placeholder', 'aria-label'],
  img: ['alt'],
  table: ['summary'],
}

export default [
  ...vuetify({
    ts: true,
  }),
  {
    files: [
      'src/pages/**/*.vue',
      'src/components/**/*.vue',
      'src/layouts/**/*.vue',
    ],
    rules: {
      'vue/no-bare-strings-in-template': [
        'error',
        { attributes: BARE_STRING_ATTRIBUTES, directives: ['v-text'] },
      ],
    },
  },
  {
    // Theme audit page renders raw token names, hex codes, and Lorem-ipsum
    // demo text. It IS gated through `dev.themeAudit.*` copy keys for its
    // section labels (so the page goes through the same deck as the user-
    // facing pages), but the demo data inside each section is intentionally
    // raw — disabling the rule for ONE specific file rather than the whole
    // `dev/` directory keeps a future dev page honest.
    files: ['src/pages/dev/ThemeAudit.vue'],
    rules: {
      'vue/no-bare-strings-in-template': 'off',
    },
  },
]
