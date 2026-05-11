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
 * 2. axe-core reports zero accessibility violations across `wcag2a`+`wcag2aa`.
 *    The audit page stresses every Vuetify primitive the product depends on,
 *    so this acts as a canary for any framework upgrade that regresses a11y.
 *    The `@axe-core/playwright` package is pinned to an exact version
 *    (package.json) so the rule set doesn't expand silently between patches.
 * 3. The full-page screenshot matches the committed baseline. The first run
 *    captures `theme-audit-baseline.png`; subsequent runs diff against it
 *    with a 0.5% pixel-ratio tolerance. We pin chromium-linux only so the
 *    tolerance can be tight; cross-OS variance is out of scope today.
 *
 * Why `data-testid="theme-audit-heading"` rather than `getByRole({ name })`:
 * the role+name query hardcodes the English copy and breaks the moment the
 * copy deck is edited or localized. The testid is part of the page's
 * stable contract.
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
    // Wait for a specific landmark element rather than `networkidle` — the
    // latter is flaky in Vite dev mode (HMR WebSocket keeps the connection
    // open, fonts load on-demand) and is discouraged in modern Playwright.
    await expect(page.getByTestId('theme-audit-heading')).toBeVisible()

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    expect(axeResults.violations).toEqual([])

    expect(consoleErrors).toEqual([])
  })

  test('matches the visual-regression baseline screenshot', async ({ page }) => {
    await page.goto('/dev/theme-audit')
    await expect(page.getByTestId('theme-audit-heading')).toBeVisible()

    await expect(page).toHaveScreenshot('theme-audit-baseline.png', {
      fullPage: true,
      // 0.5% tolerance — tight because we pin chromium-linux. Any drift
      // larger than this is a real change, not antialiasing variance.
      maxDiffPixelRatio: 0.005,
    })
  })
})
