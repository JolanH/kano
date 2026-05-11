import { defineConfig, devices } from 'playwright/test'

/**
 * Playwright config for the SPA's E2E suite.
 *
 * **Dev-server target**: the suite runs against `npm run dev` (Vite unbundled
 * mode) — NOT `npm run preview` — because `/dev/theme-audit` is gated on
 * `import.meta.env.DEV` and is dead-code-eliminated from the production
 * bundle. Visual baselines therefore reflect dev-mode rendering; in practice
 * the rendered DOM is identical to production for the audit page since it
 * only consumes Vuetify primitives + the Tixeo theme tokens.
 *
 * **Browser pinning**: chromium-only. The visual-regression baseline is
 * captured at `<spec>-snapshots/<name>-chromium-linux.png`. Story 1.10's CI
 * pipeline runs on Linux to match this baseline. Re-baselining for a
 * different OS (macOS/Windows) is **not** a supported operation today —
 * the baseline is part of the regression contract and changing it requires
 * an explicit PR with `npx playwright test --update-snapshots` and a
 * reviewer's sign-off.
 *
 * Story 1.8's `theme-audit.spec.ts` uses this config; later stories
 * (1.10 CI baseline, 2-13 / 4-8 / 5-8 manual a11y sweeps) extend it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // `list` for local console feedback; `html` for the post-run artifact CI
  // uploads (Story 1.10 wires the artifact retention). JUnit/JSON formats
  // are intentionally omitted until CI integration lands — keeps the local
  // run fast.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
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
