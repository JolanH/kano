/**
 * Story 5-8 AC #1 — analysis-page NFR1 timing gate.
 *
 * NFR1 publishes a 3 s p95 ceiling on the analysis page given a 20-feature
 * × 500-submission dataset. The integration test
 * `kano-backend/tests/integration/test_analysis_api_perf.py` covers the
 * server-side half of that budget (the GROUP BY query + serialization
 * path). This spec covers the client-side half: load + render + layout
 * with a realistic payload, measured against the route-mocked API so the
 * spec is hermetic and CI-stable.
 *
 * Why mocked rather than calling the seeded backend:
 *
 * - The existing E2E suite is mock-only (no live Flask in CI).
 * - The server-side budget is verified upstream by the integration suite;
 *   doubling that here would just chain two flaky perf gates.
 * - The client-render budget is what regression here actually measures —
 *   a Vuetify `v-data-table` mount + `<KanoStackedBar>` × 20 SVG + `<v-tooltip>`
 *   portals at scale. If the client gets slower (e.g. a per-row N+1
 *   reactivity bug), this spec catches it independently of backend
 *   regressions.
 *
 * The manual a11y checklist (`docs/a11y/analysis-checklist.md`) is what
 * verifies the end-to-end (real backend + real seed + real browser) NFR1
 * number before the epic closes.
 *
 * Run-count + p95 math: 10 navigations + sort ascending + take index
 * `ceil(0.95 * 10) - 1 = 9` (the slowest sample of 10). At 10 samples the
 * 95th percentile lands at the max — anything lower (e.g. `floor(0.95 * 10)
 * - 1 = 8`, the 9th-fastest) silently masks the slowest run, turning a
 * p95 gate into a p90 gate. 10 is still a small sample; a single outlier
 * can fail the gate. If the p95 bumps a noisy line, increase the loop
 * count rather than relaxing the ceiling.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'playwright/test'

import { gotoAnalysisAndWait, seedAnalysisFixture } from './_seed-helpers'

// Resolve screenshot output relative to this spec file rather than the
// Playwright runner's CWD; otherwise the PNGs land in whatever directory
// the runner was invoked from (repo root vs kano-frontend), which the
// implementation notes claimed to anchor at `kano-frontend/e2e/screenshots/`.
const SCREENSHOTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'screenshots',
)

const NFR1_CEILING_MS = 3000
const RUN_COUNT = 10

// Retries are intentionally disabled: a true regression that breaches the
// ceiling must fail the test loudly, not get masked by Playwright's default
// retry behavior on slow runs. Re-baselining is an explicit human action.
test.describe.configure({ retries: 0 })

test.describe('Story 5-8 — analysis page perf (NFR1 client budget)', () => {
  test('loads + renders the 20-feature payload within 3 s p95 across 10 runs', async ({
    page,
  }) => {
    const seed = await seedAnalysisFixture(page)

    // Prime the route handlers + warm the dev-server bundle by doing one
    // throwaway run before the timed loop. Otherwise the first iteration
    // pays an unfair Vite cold-start tax.
    await gotoAnalysisAndWait(page, seed)
    await page.goto('about:blank')

    const timings: number[] = []
    for (let i = 0; i < RUN_COUNT; i++) {
      const startedAt = Date.now()
      // `waitUntil: 'commit'` returns as soon as the navigation has
      // committed in the browser; the actual "fully painted" signal is the
      // 20th row becoming visible below. Playwright explicitly discourages
      // `networkidle` on SPAs (Vite HMR pings + Vuetify font streaming keep
      // the network bus active past first paint and inflate p95 readings on
      // healthy runs).
      await page.goto(`/app/projects/${seed.projectId}/polls/${seed.pollId}/analysis`, {
        waitUntil: 'commit',
      })
      // Wait for the 20th row to render — this is the deterministic
      // "fully painted" signal. Vuetify's `v-data-table` paints rows
      // progressively under load.
      await page.locator('#feature-feat-20').waitFor({ state: 'visible' })
      const elapsed = Date.now() - startedAt
      timings.push(elapsed)
      // Reset the page state so each iteration starts from a fresh
      // navigation rather than a cached SPA route.
      await page.goto('about:blank')
    }

    timings.sort((a, b) => a - b)
    // 95th-percentile index for 10 samples: `ceil(0.95 * 10) - 1 = 9` —
    // the slowest run. `floor(0.95 * 10) - 1 = 8` would mask the slowest
    // sample (effective p90), defeating the gate's purpose. With 10
    // samples the p95 lands at the max; with N samples it's the
    // `ceil(0.95 * N) - 1` index after ascending sort.
    const p95Index = Math.ceil(timings.length * 0.95) - 1
    const p95 = timings[p95Index]

    // Pin the actual numbers in the test output so a CI regression is
    // diagnosable from logs alone — no need to re-run the spec to see
    // which run blew the ceiling.
    // eslint-disable-next-line no-console
    console.log(
      `[analysis-perf] timings (ms): [${timings.join(', ')}]; p95=${p95}; ceiling=${NFR1_CEILING_MS}`,
    )

    expect(p95, `analysis page p95 must be < ${NFR1_CEILING_MS}ms`).toBeLessThan(
      NFR1_CEILING_MS,
    )
  })
})

test.describe('Story 5-8 — analysis page screenshot framing (AC #7)', () => {
  test('frames at 1440×900 with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, '1440px viewport — analysis page must fit without horizontal scroll').toBeLessThanOrEqual(
      clientWidth,
    )

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'analysis-1440.png'),
      fullPage: true,
    })
  })

  test('frames at 1920×1080 with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, '1920px viewport — analysis page must fit without horizontal scroll').toBeLessThanOrEqual(
      clientWidth,
    )

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'analysis-1920.png'),
      fullPage: true,
    })
  })
})
