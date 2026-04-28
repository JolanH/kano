import { defineConfig, devices } from 'playwright/test'

/**
 * Playwright config for the SPA's E2E suite.
 *
 * The Vite dev server boots automatically (`npm run dev`) before the suite
 * runs. Story 1.8's `theme-audit.spec.ts` uses this config; later stories
 * (1.10 CI baseline, 2-13 / 4-8 / 5-8 manual a11y sweeps) extend it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30_000,
  },
})
