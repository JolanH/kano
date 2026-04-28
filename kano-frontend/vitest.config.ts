import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
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
 * the bare minimum needed for the unit specs: the `@/` path alias and the
 * Vue plugin so `.vue` SFC imports resolve. The full Vite config (proxy,
 * manualChunks, font loading) is irrelevant under Vitest.
 */
export default defineConfig({
  plugins: [Vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
})
