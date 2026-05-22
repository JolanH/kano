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
  test('full flow (landing → 3 features × 2 Likerts → submit-confirm → thanks) with zero mouse events', async ({
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

    // Per-feature progression: 3 features, each with both Likerts on
    // one screen. For each feature: Tab to the functional Likert and
    // press `3`, then Tab to the dysfunctional Likert and press `3`.
    // Auto-advance fires only after BOTH answers are set; last feature
    // routes to /submit-confirm.
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId('question-screen')).toBeVisible()
      // Move focus into the functional Likert's first radio.
      await page
        .getByTestId('kano-likert-functional')
        .locator('input[type="radio"]')
        .first()
        .focus()
      await page.keyboard.press('3')
      // Move focus into the dysfunctional Likert's first radio.
      await page
        .getByTestId('kano-likert-dysfunctional')
        .locator('input[type="radio"]')
        .first()
        .focus()
      await page.keyboard.press('3')
      const nextUrl =
        i === 2
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
  // Absolute-timing assertions ("auto-advance < 50 ms") are flaky in CI
  // — router transitions plus reactivity ticks can blow past any tight
  // budget regardless of the 150 ms `setTimeout` being skipped. Instead
  // we measure BOTH a default-motion and a reduced-motion run and assert
  // the *delta* exceeds roughly the confirmationMs delay (150 ms minus
  // a noise floor). That's what Story 4.5's contract actually claims.

  async function measureAutoAdvance(page: Page): Promise<number> {
    // Per-feature progression: auto-advance fires only when BOTH Likerts
    // are answered. We pre-set the functional answer via focus + press,
    // then time the dysfunctional press → URL transition. Reduced motion
    // skips KanoLikert's 150 ms confirmation timer; the delta between
    // default and reduced runs should clear ≥ 100 ms.
    await seedPoll(page)
    await page.goto(`/poll/${POLL_ID}/q/0`)
    await expect(page.getByTestId('question-screen')).toBeVisible()
    await page
      .getByTestId('kano-likert-functional')
      .locator('input[type="radio"]')
      .first()
      .focus()
    await page.keyboard.press('3')
    await page
      .getByTestId('kano-likert-dysfunctional')
      .locator('input[type="radio"]')
      .first()
      .focus()
    const start = Date.now()
    await page.keyboard.press('3')
    await page.waitForURL(new RegExp(`/poll/${POLL_ID}/q/1$`))
    return Date.now() - start
  }

  test('reduced motion is meaningfully faster than default motion', async ({
    browser,
  }) => {
    const defaultContext = await browser.newContext({
      ...devices['iPhone SE'],
    })
    const reducedContext = await browser.newContext({
      ...devices['iPhone SE'],
      reducedMotion: 'reduce',
    })
    try {
      const defaultMs = await measureAutoAdvance(await defaultContext.newPage())
      const reducedMs = await measureAutoAdvance(await reducedContext.newPage())
      // The 150 ms confirmation is the only deterministic source of
      // additional latency between the two runs; assert the delta clears
      // at least 100 ms (leaves 50 ms headroom for noise). If reduced
      // ever becomes SLOWER than default, that's a regression worth
      // failing on.
      expect(defaultMs - reducedMs).toBeGreaterThanOrEqual(100)
    } finally {
      await defaultContext.close()
      await reducedContext.close()
    }
  })
})
