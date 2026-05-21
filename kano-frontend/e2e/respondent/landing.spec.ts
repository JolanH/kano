/**
 * Story 4-4 — Respondent landing acceptance (real LiveLanding replaces the
 * Story 3-8 LivePollStub) with axe-core gates across the four states
 * (live, expired, not-found, error) and mobile-viewport overflow checks.
 *
 * Note on viewport: Playwright's `devices['iPhone SE']` preset would also
 * work; an explicit 360×640 viewport on a chromium project keeps the spec
 * portable across local config and the existing CI matrix without forcing
 * a device-emulation toggle.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from 'playwright/test'

const POLL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GHOST_ID = '00000000-0000-4000-8000-000000000000'

const samplePollPublic = {
  id: POLL_ID,
  expires_at: '2026-05-30T12:00:00Z',
  features: [
    { feature_key: 'fk-1', name: 'Auto-save', description: null },
    { feature_key: 'fk-2', name: 'Dark mode', description: null },
  ],
}

const problemDetails = (status: number, slug: string) => ({
  type: `https://kano.example.com/problems/${slug}`,
  title: slug,
  status,
  detail: null,
  instance: `/api/v1/polls/${POLL_ID}`,
  request_id: 'rid',
})

async function mockLive(page: Page) {
  await page.route(`**/api/v1/polls/${POLL_ID}`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(samplePollPublic) }),
  )
}

async function mockExpired(page: Page) {
  await page.route(`**/api/v1/polls/${POLL_ID}`, (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(410, 'poll-expired')),
    }),
  )
}

async function mockNotFound(page: Page) {
  await page.route(`**/api/v1/polls/${GHOST_ID}`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(404, 'entity-not-found')),
    }),
  )
}

async function mockServerError(page: Page) {
  await page.route(`**/api/v1/polls/${POLL_ID}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify(problemDetails(500, 'internal-server-error')),
    }),
  )
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.use({ viewport: { width: 360, height: 640 } })

test.describe('Story 4-4 — Respondent landing', () => {
  test('live poll → LiveLanding renders + no data-stub marker + Begin nav', async ({ page }) => {
    await mockLive(page)
    await page.goto(`/poll/${POLL_ID}`)
    await expect(page.getByTestId('poll-landing')).toBeVisible()
    await expect(page.getByTestId('live-landing')).toBeVisible()

    // Regression guard: the Story 3-8 stub marker must not survive the swap.
    expect(await page.getByTestId('poll-landing').getAttribute('data-stub')).toBeNull()

    const trust = page.getByTestId('live-landing-trust-line')
    await expect(trust).toBeVisible()
    await expect(trust).toContainText('Tixeo')
    await expect(trust).toContainText('shapes our roadmap')

    const begin = page.getByTestId('live-landing-begin')
    await expect(begin).toBeVisible()
    const box = await begin.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)

    await axeClean(page)

    await begin.click()
    await expect(page).toHaveURL(new RegExp(`/poll/${POLL_ID}/q/0$`))
    await expect(page.getByTestId('poll-question-placeholder')).toBeVisible()
  })

  test('expired poll → contact mailto + axe clean', async ({ page }) => {
    await mockExpired(page)
    await page.goto(`/poll/${POLL_ID}`)
    await expect(page.getByTestId('expired-poll')).toBeVisible()
    const contact = page.getByTestId('expired-poll-contact')
    await expect(contact).toBeVisible()
    const href = await contact.getAttribute('href')
    expect(href?.startsWith('mailto:')).toBe(true)
    await axeClean(page)
  })

  test('not-found poll → contact CTA + axe clean', async ({ page }) => {
    await mockNotFound(page)
    await page.goto(`/poll/${GHOST_ID}`)
    await expect(page.getByTestId('poll-not-found')).toBeVisible()
    await expect(page.getByTestId('poll-not-found-contact')).toBeVisible()
    await axeClean(page)
  })

  test('server error → PollLoadError + retry + axe clean', async ({ page }) => {
    await mockServerError(page)
    await page.goto(`/poll/${POLL_ID}`)
    await expect(page.getByTestId('poll-load-error')).toBeVisible()
    await expect(page.getByTestId('poll-load-error-retry')).toBeVisible()
    await axeClean(page)
  })

  test('no horizontal overflow at 360 px width (live)', async ({ page }) => {
    await mockLive(page)
    await page.goto(`/poll/${POLL_ID}`)
    await expect(page.getByTestId('live-landing')).toBeVisible()
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(noOverflow).toBe(true)
  })

  test('contact button meets 44×44 tap target on expired surface', async ({ page }) => {
    await mockExpired(page)
    await page.goto(`/poll/${POLL_ID}`)
    const contact = page.getByTestId('expired-poll-contact')
    const box = await contact.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  })
})
