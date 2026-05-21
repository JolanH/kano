import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    Vue({
      template: { transformAssetUrls },
    }),
    Vuetify({
      autoImport: true,
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  server: {
    port: 5173,
    // host: '0.0.0.0' is set via the docker compose `dev` Dockerfile CMD so
    // the dev server is reachable from the host port mapping. Outside Docker
    // the default `localhost` bind is fine.
    proxy: {
      // Backend Flask dev server runs on :5000 per backend Story 1.1.
      // - Local dev (no Docker):  http://localhost:5000  (default)
      // - docker compose:         http://api:5000        (set via VITE_API_PROXY)
      // Production deploys put Caddy in front and route `/api/*` to the
      // backend container — same URL surface, different proxy.
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 200,
    // `manifest: true` makes Vite emit `.vite/manifest.json` mapping source
    // entry points to their built chunks. `scripts/check-respondent-bundle.mjs`
    // reads it to compute the gzipped size of the respondent initial bundle
    // and enforce the 150 KB ceiling (Story 3-8 AC #2).
    manifest: true,
    rollupOptions: {
      output: {
        // Route-level split between PM and respondent bundles. The respondent
        // initial bundle target is <150 KB gzipped (architecture §Frontend
        // Architecture); the respondent chunk MUST NOT statically import
        // PM-only Vuetify components like `v-data-table` /
        // `v-navigation-drawer` or PM stores. The `manualChunks` strategy
        // below only names a single 'respondent' chunk for the respondent
        // surface; everything else (Vue, Vuetify core, vue-router, pinia,
        // composables, stores, PM pages) defaults to Vite's chunking, which
        // emits per-route async chunks plus a small shared `index-*.js`
        // bootstrap. Result: the respondent route only loads what it
        // actually imports, not the union of PM + everything.
        //
        // Verified at build time by `scripts/check-respondent-bundle.mjs`
        // (postbuild gate enforcing the 150 KB ceiling).
        manualChunks(id: string): string | undefined {
          if (
            id.includes('/src/pages/poll/') ||
            id.includes('/src/layouts/RespondentLayout')
          ) {
            return 'respondent'
          }
          return undefined
        },
      },
    },
  },
})
