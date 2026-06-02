/**
 * Poll-link actions on project detail — "Go to poll URL" + "Copy poll URL".
 *
 * Supersedes the Story 3-6 "Generate poll URL" terminal action: the poll is
 * now deterministic per (project, epoch), so creation is idempotent and the
 * two buttons get-or-create it, then open the public URL in a new tab or copy
 * it to the clipboard.
 *
 * Runs against `npm run dev` (Playwright launches Vite). The backend is mocked
 * at the fetch boundary; backend correctness is the pytest integration suite's
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

async function seedAllRoutes(page: Page, pollsList: unknown[] = []) {
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
        // Idempotent get-or-create: a 200 (existing) is equally valid; 201 here.
        return route.fulfill({
          status: 201,
          headers: { Location: `/api/v1/polls/${POLL_ID}` },
          contentType: 'application/json',
          body: JSON.stringify(samplePoll),
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(pollsList),
      })
    },
  )
}

test.describe('Poll-link actions — Go to poll URL + Copy poll URL', () => {
  test('Go to poll URL opens the public poll page in a new tab', async ({ page }) => {
    await seedAllRoutes(page)
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await expect(page.getByTestId('project-detail')).toBeVisible()

    const button = page.getByTestId('go-to-poll-url-button')
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()

    const popupPromise = page.waitForEvent('popup')
    await button.click()
    const popup = await popupPromise
    await popup.waitForURL(new RegExp(`/poll/${POLL_ID}$`))
    expect(popup.url()).toMatch(/^https?:\/\/[^/]+\/poll\/[0-9a-f-]{36}$/)
    expect(popup.url().endsWith(`/poll/${POLL_ID}`)).toBe(true)
  })

  test('Copy poll URL writes the public URL to the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await seedAllRoutes(page)
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await expect(page.getByTestId('project-detail')).toBeVisible()

    await page.getByTestId('copy-poll-url-button').click()

    // Success snackbar confirms the copy.
    await expect(page.getByText('Poll URL copied to clipboard')).toBeVisible()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toMatch(/^https?:\/\/[^/]+\/poll\/[0-9a-f-]{36}$/)
    expect(clip.endsWith(`/poll/${POLL_ID}`)).toBe(true)
  })

  test('both buttons disabled when project has no active features', async ({ page }) => {
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
    await expect(page.getByTestId('go-to-poll-url-button')).toBeDisabled()
    await expect(page.getByTestId('copy-poll-url-button')).toBeDisabled()
  })

  test('project detail with poll-link buttons has zero axe violations', async ({ page }) => {
    // Seed an existing poll so the buttons are enabled and no disabled-state
    // tooltips render — axe-checks the page in its normal, actionable state.
    await seedAllRoutes(page, [{ ...samplePoll, project_name: 'Generate Test', project_version: '1.0' }])
    await page.goto(`/app/projects/${PROJECT_ID}`)
    await expect(page.getByTestId('go-to-poll-url-button')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
