/**
 * Story 3-6 happy path — "Generate poll URL" terminal action.
 *
 * Runs against `npm run dev` (Playwright launches Vite). The backend is
 * mocked at the fetch boundary: empty project → click feature → click
 * Generate → land on share view with URL + QR visible.
 *
 * Same mocking strategy as `a11y-paola.spec.ts`: keeps the spec fast and
 * deterministic; backend correctness is the pytest integration suite's
 * job (test_polls_api.py).
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from 'playwright/test'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const POLL_ID = '44444444-4444-4444-4444-444444444444'

const projectsSeed = [
  {
    id: PROJECT_ID,
    name: 'Generate Test',
    version: '1.0',
    current_epoch: 1,
    created_at: '2026-05-19T10:00:00Z',
  },
]

const projectDetail = {
  ...projectsSeed[0],
  updated_at: projectsSeed[0].created_at,
  active_features: [
    {
      id: 'feat-1',
      feature_key: 'fk-1',
      name: 'SSO',
      description: 'single sign-on',
      is_active: true,
      created_at: '2026-05-19T10:30:00Z',
      epoch: 1,
    },
  ],
}

const samplePoll = {
  id: POLL_ID,
  project_id: PROJECT_ID,
  epoch: 1,
  created_at: '2026-05-20T12:00:00Z',
  expires_at: '2026-05-27T12:00:00Z',
  response_count: 0,
  is_expired: false,
}

async function seedAllRoutes(page: Page) {
  await page.route('**/api/v1/csrf-token', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ csrf_token: 't-stub' }),
    }),
  )
  await page.route('**/api/v1/projects/', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(projectsSeed) }),
  )
  await page.route(`**/api/v1/projects/${PROJECT_ID}`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(projectDetail) }),
  )
  await page.route(
    `**/api/v1/projects/${PROJECT_ID}/polls`,
    (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          headers: { Location: `/api/v1/polls/${POLL_ID}` },
          contentType: 'application/json',
          body: JSON.stringify(samplePoll),
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    },
  )
}

test.describe('Story 3-6 — Generate poll URL flow', () => {
  test('happy path: project with feature → Generate → share view', async ({ page }) => {
    await seedAllRoutes(page)
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await expect(page.getByTestId('project-detail')).toBeVisible()
    const button = page.getByTestId('generate-poll-button')
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    await button.click()
    await expect(page).toHaveURL(
      new RegExp(`/app/projects/${PROJECT_ID}/polls/${POLL_ID}/share$`),
    )
    await expect(page.getByTestId('poll-share-panel')).toBeVisible()
    const urlField = page.getByTestId('poll-share-url').locator('input')
    const url = await urlField.inputValue()
    expect(url).toMatch(/^https?:\/\/[^/]+\/poll\/[0-9a-f-]{36}$/)
    expect(url.endsWith(`/poll/${POLL_ID}`)).toBe(true)
    // QR image renders (it's aria-hidden so query by data-testid not role).
    await expect(page.getByTestId('poll-share-qr')).toBeVisible()
  })

  test('disabled when project has no active features', async ({ page }) => {
    await page.route('**/api/v1/csrf-token', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ csrf_token: 't-stub' }),
      }),
    )
    await page.route(`**/api/v1/projects/${PROJECT_ID}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...projectDetail, active_features: [] }),
      }),
    )
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await expect(page.getByTestId('project-detail')).toBeVisible()
    await expect(page.getByTestId('generate-poll-button')).toBeDisabled()
  })

  test('share view has zero axe violations', async ({ page }) => {
    await seedAllRoutes(page)
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await page.getByTestId('generate-poll-button').click()
    await expect(page.getByTestId('poll-share-panel')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
