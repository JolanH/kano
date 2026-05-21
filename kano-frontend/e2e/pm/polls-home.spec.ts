/**
 * Story 3-7 — PM polls home (`/app/polls`) acceptance & a11y gate.
 *
 * Fetch-mocked the same way as a11y-paola.spec.ts / generate-poll.spec.ts.
 * Asserts: `/` redirects to `/app/polls`, empty-state CTA navigates to
 * `/app/projects`, populated table renders rows with expired styling, row
 * clicks route to share / analysis correctly, axe-core is clean.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from 'playwright/test'

const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const LIVE_POLL_ID = '66666666-6666-4666-8666-666666666666'
const DEAD_POLL_ID = '77777777-7777-4777-8777-777777777777'

const livePoll = {
  id: LIVE_POLL_ID,
  project_id: PROJECT_ID,
  epoch: 1,
  created_at: '2026-05-19T10:00:00Z',
  expires_at: '2026-05-30T10:00:00Z',
  response_count: 4,
  is_expired: false,
  project_name: 'Q3 Prioritization',
  project_version: '1.0',
}

const deadPoll = {
  ...livePoll,
  id: DEAD_POLL_ID,
  expires_at: '2026-04-01T10:00:00Z',
  is_expired: true,
  response_count: 12,
}

async function mockCsrf(page: Page) {
  await page.route('**/api/v1/csrf-token', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ csrf_token: 't-stub' }),
    }),
  )
}

test.describe('Story 3-7 — PM polls home', () => {
  test('/ redirects to /app/polls', async ({ page }) => {
    await mockCsrf(page)
    await page.route('**/api/v1/polls', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.goto('/')
    await expect(page).toHaveURL(/\/app\/polls$/)
  })

  test('empty state CTA routes to /app/projects', async ({ page }) => {
    await mockCsrf(page)
    await page.route('**/api/v1/polls', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/api/v1/projects/', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    )
    await page.goto('/app/polls')
    await expect(page.getByTestId('polls-empty-state')).toBeVisible()
    const cta = page.getByTestId('polls-empty-cta')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/app\/projects$/)
  })

  test('populated table renders rows; expired row is muted; row click routes correctly', async ({
    page,
  }) => {
    await mockCsrf(page)
    await page.route('**/api/v1/polls', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([livePoll, deadPoll]),
      }),
    )
    await page.goto('/app/polls')
    await expect(page.getByTestId('polls-table')).toBeVisible()
    const liveRow = page.getByTestId(`polls-row-${LIVE_POLL_ID}`)
    const deadRow = page.getByTestId(`polls-row-${DEAD_POLL_ID}`)
    await expect(liveRow).toBeVisible()
    await expect(deadRow).toBeVisible()
    // The expired row carries the muted CSS class we set in `rowClassProps`.
    await expect(deadRow).toHaveClass(/polls-row--expired/)
    await deadRow.click()
    await expect(page).toHaveURL(
      new RegExp(`/app/projects/${PROJECT_ID}/polls/${DEAD_POLL_ID}/analysis$`),
    )
  })

  test('axe-core: zero violations on populated polls home', async ({ page }) => {
    await mockCsrf(page)
    await page.route('**/api/v1/polls', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([livePoll, deadPoll]),
      }),
    )
    await page.goto('/app/polls')
    await expect(page.getByTestId('polls-table')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
