/**
 * Respondent surface axe-core gate (Story 4-8).
 *
 * Runs `@axe-core/playwright` against every state the respondent SPA
 * can reach. Mirrors the strategy of `e2e/pm/a11y-paola.spec.ts`:
 * intercept API calls at the Playwright `route()` layer with canned
 * JSON so the backend is not required (fast + deterministic). The
 * deeper manual VoiceOver + TalkBack sweep lives in
 * `docs/a11y/respondent-checklist.md`.
 *
 * Touch-target audit: every interactive element is enumerated and its
 * bounding box checked for ≥ 44×44 px at the 360 px iPhone-SE
 * viewport (UX-spec §Touch Targets line 978).
 */

import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test, type Page } from 'playwright/test'

const LIVE_POLL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPIRED_POLL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GHOST_POLL_ID = '00000000-0000-4000-8000-000000000000'

const samplePollPublic = {
  id: LIVE_POLL_ID,
  expires_at: '2026-12-31T12:00:00Z',
  features: [
    { feature_key: 'fk-1', name: 'Auto-save', description: 'Saves changes every 30 s' },
    { feature_key: 'fk-2', name: 'Dark mode', description: null },
    { feature_key: 'fk-3', name: 'Exports', description: 'CSV / PDF / XLSX' },
  ],
}

const problemDetails = (status: number, slug: string, extra: Record<string, unknown> = {}) => ({
  type: `https://kano.example.com/problems/${slug}`,
  title: slug,
  status,
  detail: null,
  instance: `/api/v1/polls/${LIVE_POLL_ID}`,
  request_id: 'rid',
  ...extra,
})

async function seedLivePoll(page: Page) {
  await page.route(`**/api/v1/polls/${LIVE_POLL_ID}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(samplePollPublic),
    }),
  )
}

async function seedExpiredPoll(page: Page) {
  await page.route(`**/api/v1/polls/${EXPIRED_POLL_ID}`, (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(410, 'poll-expired')),
    }),
  )
}

async function seedGhostPoll(page: Page) {
  await page.route(`**/api/v1/polls/${GHOST_POLL_ID}`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(404, 'entity-not-found')),
    }),
  )
}

async function seedServerError(page: Page) {
  await page.route(`**/api/v1/polls/${LIVE_POLL_ID}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(500, 'internal-server-error')),
    }),
  )
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

async function tapTargetAudit(page: Page) {
  // Every interactive element on the respondent surface must satisfy the
  // 44 × 44 minimum from UX-spec §Touch Targets. Hidden elements
  // (bounding box null) are skipped.
  const locator = page.locator(
    'button, [role="button"], a[href], input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])',
  )
  const count = await locator.count()
  for (let i = 0; i < count; i++) {
    const handle = locator.nth(i)
    const visible = await handle.isVisible().catch(() => false)
    if (!visible) continue
    const box = await handle.boundingBox()
    if (!box) continue
    expect.soft(
      box.width,
      `interactive element #${i} too narrow: ${box.width}`,
    ).toBeGreaterThanOrEqual(44)
    expect.soft(
      box.height,
      `interactive element #${i} too short: ${box.height}`,
    ).toBeGreaterThanOrEqual(44)
  }
}

test.use({ ...devices['iPhone SE'] })

test.describe('Respondent flow — axe-core + tap targets', () => {
  test('landing (live) is axe-clean and tap-target compliant', async ({ page }) => {
    await seedLivePoll(page)
    await page.goto(`/poll/${LIVE_POLL_ID}`)
    await expect(page.getByTestId('live-landing')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('landing (expired) is axe-clean and tap-target compliant', async ({ page }) => {
    await seedExpiredPoll(page)
    await page.goto(`/poll/${EXPIRED_POLL_ID}`)
    await expect(page.getByTestId('expired-poll')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('landing (not-found) is axe-clean and tap-target compliant', async ({ page }) => {
    await seedGhostPoll(page)
    await page.goto(`/poll/${GHOST_POLL_ID}`)
    await expect(page.getByTestId('poll-not-found')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('landing (server error) is axe-clean and tap-target compliant', async ({ page }) => {
    await seedServerError(page)
    await page.goto(`/poll/${LIVE_POLL_ID}`)
    await expect(page.getByTestId('poll-load-error')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('question (functional, mid-flow) is axe-clean and tap-target compliant', async ({ page }) => {
    await seedLivePoll(page)
    await page.goto(`/poll/${LIVE_POLL_ID}/q/0`)
    await expect(page.getByTestId('question-screen')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('question with ?showError=1 renders the error variant axe-clean', async ({ page }) => {
    await seedLivePoll(page)
    await page.goto(`/poll/${LIVE_POLL_ID}/q/0?showError=1`)
    await expect(page.getByTestId('kano-likert-error')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('submit-confirm (defensive-redirect skipped via direct nav) is axe-clean', async ({ page }) => {
    // The page bounces to /q/0?showError=1 when the draft is incomplete;
    // axe + tap-target audit on the *resulting* screen is enough (it's
    // the same surface as the question-with-error case).
    await seedLivePoll(page)
    await page.goto(`/poll/${LIVE_POLL_ID}/submit-confirm`)
    await page.waitForURL(/\/q\/0\?showError=1$/)
    await expect(page.getByTestId('kano-likert-error')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })

  test('thanks page is axe-clean and tap-target compliant', async ({ page }) => {
    // Thanks does not depend on poll state; navigate directly.
    await page.goto(`/poll/${LIVE_POLL_ID}/thanks`)
    await expect(page.getByTestId('poll-thanks')).toBeVisible()
    await axeClean(page)
    await tapTargetAudit(page)
  })
})

test.describe('Respondent flow — reduced-motion contract', () => {
  test.use({ ...devices['iPhone SE'], reducedMotion: 'reduce' })

  test('question route renders under reduced-motion (per-feature progression)', async ({ page }) => {
    // Per-feature progression (Story 4-6 amendment 2026-05-22) removed
    // the halfway microcopy entirely. KanoLikert's auto-advance timer
    // contract is the surviving reduced-motion-sensitive behavior; it's
    // covered end-to-end by `keyboard-a11y.spec.ts → measureAutoAdvance`.
    // Here we just sanity-check that the route mounts under reduced
    // motion without throwing.
    await seedLivePoll(page)
    await page.goto(`/poll/${LIVE_POLL_ID}/q/0`)
    await expect(page.getByTestId('question-screen')).toBeVisible()
    await expect(page.getByTestId('kano-likert-functional')).toBeVisible()
    await expect(page.getByTestId('kano-likert-dysfunctional')).toBeVisible()
  })
})
