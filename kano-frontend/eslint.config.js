import vuetify from 'eslint-config-vuetify'

// `vue/no-bare-strings-in-template` keeps user-facing strings out of `<template>`
// blocks under `src/pages` and `src/components`. Layouts also use `useCopy`,
// so the rule extends there too. Theme/composable/router files have no
// `<template>` and are naturally outside the rule's scope.
//
// The architecture's enforcement rule (architecture.md §Enforcement Guidelines,
// "Render every user-facing string via the copy-deck `useCopy()` composable")
// makes this lint a hard gate, not a code-review convention.
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
      'vue/no-bare-strings-in-template': 'error',
    },
  },
  {
    // The dev-only theme-audit page (Story 1.8) intentionally renders raw
    // tokens, hex codes, and Lorem-ipsum text. It does not ship in production
    // builds (gated on `import.meta.env.DEV`), so it sits outside the
    // user-facing copy-deck regime.
    files: ['src/pages/dev/**/*.vue'],
    rules: {
      'vue/no-bare-strings-in-template': 'off',
    },
  },
]
