/**
 * Theme audit E2E + visual regression anchor.
 *
 * Three contracts under test:
 *
 * 1. The dev-only `/dev/theme-audit` route renders without throwing console
 *    errors. Any regression in the theme tokens (e.g. a missing color, a
 *    typo'd Vuetify default) tends to log to the console first; capturing
 *    `console.error` events catches the loud failures before the silent
 *    pixel-diff regression.
 * 2. axe-core reports zero accessibility violations. The audit page stresses
 *    every Vuetify primitive the product depends on, so this acts as a
 *    canary for any framework upgrade that regresses a11y.
 * 3. The full-page screenshot matches the committed baseline. The first run
 *    captures `theme-audit-baseline.png`; subsequent runs diff against it
 *    with a 1% pixel-ratio tolerance to absorb font-antialiasing variance
 *    across operating systems.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from 'playwright/test'

test.describe('theme audit', () => {
  test('renders without console errors and passes axe-core', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto('/dev/theme-audit')
    await page.waitForLoadState('networkidle')

    const heading = page.getByRole('heading', { name: 'Theme audit' })
    await expect(heading).toBeVisible()

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(axeResults.violations).toEqual([])

    expect(consoleErrors).toEqual([])
  })

  test('matches the visual-regression baseline screenshot', async ({ page }) => {
    await page.goto('/dev/theme-audit')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveScreenshot('theme-audit-baseline.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  })
})
