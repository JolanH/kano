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
    rollupOptions: {
      output: {
        // Route-level split between PM and respondent bundles. The respondent
        // initial bundle target is <150 KB gzipped (architecture §Frontend
        // Architecture); this `manualChunks` strategy + per-route
        // dynamic imports keep the two surfaces from cross-contaminating.
        manualChunks(id: string): string | undefined {
          if (id.includes('/src/pages/app/') || id.includes('/src/layouts/PmLayout')) {
            return 'pm'
          }
          if (id.includes('/src/pages/poll/') || id.includes('/src/layouts/RespondentLayout')) {
            return 'respondent'
          }
          return undefined
        },
      },
    },
  },
})
