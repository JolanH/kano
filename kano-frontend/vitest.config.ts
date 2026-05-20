import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import Vuetify from 'vite-plugin-vuetify'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for unit tests under `tests/unit/**`.
 *
 * The Playwright e2e suite under `e2e/**` uses its own config
 * (`playwright.config.ts`) and must not be picked up by Vitest. Without an
 * explicit exclude here, Vitest greedily collects every `*.spec.ts` and
 * tries to evaluate the Playwright spec as a Vitest suite, which fails.
 *
 * We don't import `vite.config.mts` directly (the `.mts` extension would
 * require `allowImportingTsExtensions` in tsconfig); instead we replicate
 * the bare minimum needed for the unit specs: the `@/` path alias, the Vue
 * SFC plugin, and `vite-plugin-vuetify` so any future component-mount test
 * (e.g. Story 4-5's `<KanoLikert>` spec) can resolve Vuetify auto-imports.
 * The full Vite config (proxy, manualChunks, font loading) is irrelevant
 * under Vitest.
 */
export default defineConfig({
  plugins: [Vue(), Vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    // Vuetify auto-import (set above) emits CSS side-effect imports inside the
    // transformed .vue files. jsdom can't evaluate `.css` modules at runtime;
    // mock them to empty stylesheets so component-mounting specs don't blow
    // up on import. Use `server.deps.inline` to force Vuetify's ESM through
    // Vite's CSS pipeline rather than Node's import.
    css: { include: [/.+/] },
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
