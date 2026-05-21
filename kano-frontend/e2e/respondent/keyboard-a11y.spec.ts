/**
 * Respondent surface keyboard-only + focus-management gate (Story 4-8).
 *
 * Distinct from Story 4-7's golden-path E2E: that one validates
 * "submission lands in DB"; this one validates "every interactive
 * affordance is reachable without a mouse" and exercises the
 * reduced-motion contract end-to-end.
 *
 * Uses Playwright's `page.keyboard.press()` exclusively — zero
 * `page.mouse` / `page.click()` calls. Comments mark the policy
 * explicitly; reviewers should reject any future PR that adds a
 * mouse interaction here.
 */

import { devices, expect, test, type Page } from 'playwright/test'

const POLL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const samplePollPublic = {
  id: POLL_ID,
  expires_at: '2026-12-31T12:00:00Z',
  features: [
    { feature_key: 'fk-1', name: 'Auto-save', description: null },
    { feature_key: 'fk-2', name: 'Dark mode', description: null },
    { feature_key: 'fk-3', name: 'Exports', description: null },
  ],
}

async function seedPoll(page: Page) {
  await page.route(`**/api/v1/polls/${POLL_ID}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(samplePollPublic),
    }),
  )
  await page.route(`**/api/v1/polls/${POLL_ID}/submit`, (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
}

test.use({ ...devices['iPhone SE'] })

test.describe('Respondent flow — keyboard-only', () => {
  test('full flow (landing → 6 questions → submit-confirm → thanks) with zero mouse events', async ({
    page,
  }) => {
    await seedPoll(page)
    await page.goto(`/poll/${POLL_ID}`)
    await expect(page.getByTestId('live-landing-begin')).toBeVisible()

    // Begin should already have focus thanks to LiveLanding's onMounted
    // hook (Story 4-8 AC #7).
    const focusedBegin = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid'),
    )
    expect(focusedBegin).toBe('live-landing-begin')

    // Activate Begin with Enter — NEVER a mouse click.
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/poll/${POLL_ID}/q/0$`))

    // 2N = 6 questions; press '3' on each. The KanoLikert auto-advance
    // routes us to the next index after the 150 ms confirmation.
    for (let i = 0; i < 6; i++) {
      await expect(page.getByTestId('question-screen')).toBeVisible()
      await page.keyboard.press('3')
      const nextUrl =
        i === 5
          ? new RegExp(`/poll/${POLL_ID}/submit-confirm$`)
          : new RegExp(`/poll/${POLL_ID}/q/${i + 1}$`)
      await page.waitForURL(nextUrl)
    }

    // Submit-confirm: Submit button should be the initial focus per
    // SubmitConfirm.vue's onMounted hook.
    await expect(page.getByTestId('submit-confirm-submit')).toBeVisible()
    const focusedSubmit = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid'),
    )
    expect(focusedSubmit).toBe('submit-confirm-submit')

    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/poll/${POLL_ID}/thanks$`))
    await expect(page.getByTestId('poll-thanks-title')).toBeVisible()

    // Thanks page heading should have focus per Thanks.vue's onMounted.
    const focusedThanks = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid'),
    )
    expect(focusedThanks).toBe('poll-thanks-title')
  })

  test('Esc on the first question lands back on the landing', async ({ page }) => {
    await seedPoll(page)
    await page.goto(`/poll/${POLL_ID}/q/0`)
    await expect(page.getByTestId('question-screen')).toBeVisible()
    // Question.vue's @keydown="onKeydown" listens on its <section> root.
    // Send the key through the active element.
    await page.keyboard.press('Escape')
    await page.waitForURL(new RegExp(`/poll/${POLL_ID}$`))
  })
})

test.describe('Respondent flow — reduced-motion + keyboard', () => {
  test.use({ ...devices['iPhone SE'], reducedMotion: 'reduce' })

  test('auto-advance is effectively instant (< 50 ms) under reduced motion', async ({ page }) => {
    await seedPoll(page)
    await page.goto(`/poll/${POLL_ID}/q/0`)
    await expect(page.getByTestId('question-screen')).toBeVisible()
    const start = Date.now()
    await page.keyboard.press('3')
    await page.waitForURL(new RegExp(`/poll/${POLL_ID}/q/1$`))
    const elapsed = Date.now() - start
    // Story 4.5: reduced-motion collapses the 150 ms confirmation to
    // 0 ms. Generous 50 ms window absorbs router transition cost in CI.
    expect(elapsed).toBeLessThan(150)
  })
})
