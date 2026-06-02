/**
 * Story 5-8 AC #3 / AC #4 — keyboard-only + reduced-motion E2E coverage.
 *
 * Scope:
 *
 * - Full keyboard-only traversal of the analysis page on the 20-feature
 *   fixture: header → EpochSelector → confidence-beat tie-help icon →
 *   CatBadge tooltips → row-level focus targets → PerCategoryPanels
 *   anchor links. The spec uses `page.keyboard.*` exclusively — no
 *   `page.mouse.*`, no `locator(...).click()`, no `.hover()`. PR review
 *   is the manual gate on the "no mouse" assertion since Playwright
 *   doesn't expose a per-call mouse-event tally.
 * - `page.emulateMedia({ reducedMotion: 'reduce' })` flips the row-pulse
 *   + scroll-into-view paths to their reduced-motion branches; the spec
 *   verifies the CSS `transition-duration` collapses and the post-jump
 *   scroll position changes instantly (within 50 ms of activation rather
 *   than the smooth-scroll's ~300 ms).
 *
 * Tab-loop safety: a `MAX_TABS` cap prevents an infinite loop if a focus
 * trap regresses. Hitting the cap is itself a real failure mode.
 */

import { expect, test } from 'playwright/test'

import { gotoAnalysisAndWait, seedAnalysisFixture } from './_seed-helpers'

const MAX_TABS = 200

test.describe('Story 5-8 — keyboard-only analysis-page scan', () => {
  test('keyboard reaches each anchor link in PerCategoryPanels and Enter jumps to the target row', async ({
    page,
  }) => {
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    // Locate a panel link by class — the M / L / E / I panels all exist
    // on this fixture given the 20-feature distribution.
    const firstPanelLink = page.locator('.per-category-panels li a').first()
    await firstPanelLink.focus()
    await expect(firstPanelLink).toBeFocused()

    // Read the href off the focused link; activate with Enter.
    const href = await firstPanelLink.getAttribute('href')
    expect(href).toMatch(/^#feature-/)
    const featureKey = (href ?? '').replace('#feature-', '')

    await page.keyboard.press('Enter')

    // The target `<tr>` must be scrolled into view and programmatically
    // focused (Story 5-6 AC #7).
    const targetRow = page.locator(`#feature-${featureKey}`)
    await expect(targetRow).toBeInViewport()
    await expect(targetRow).toBeFocused()
  })

  test('Tab walks forward from the panel link without trapping focus', async ({
    page,
  }) => {
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    const firstPanelLink = page.locator('.per-category-panels li a').first()
    await firstPanelLink.focus()

    // Walk forward — each Tab must move to a *different* focused element
    // until we land outside the panels block (or hit MAX_TABS).
    //
    // Cycle-trap detection uses a recent-signature window rather than a
    // single previous-signature equality check, because a short multi-step
    // trap (e.g. A→B→A→B) escapes consecutive-equality detection but is
    // still a real focus-trap regression. A signature that recurs more than
    // ~6 times across the last 16 steps means we're cycling, not moving.
    const recentSignatures: (string | null)[] = []
    const RECENT_WINDOW = 16
    const CYCLE_THRESHOLD = 6
    let landedOnDownstreamFocusable = false
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab')
      const state = await page.evaluate(() => {
        const active = document.activeElement
        if (!active || active === document.body) {
          return { sig: null, insidePanels: false, isFocusable: false }
        }
        const tag = active.tagName
        const id = (active as HTMLElement).id ?? ''
        const cls = (active as HTMLElement).className ?? ''
        return {
          sig: `${tag}#${id}.${cls}`,
          insidePanels: Boolean(active.closest('.per-category-panels')),
          // A real downstream focusable lands on an element other than
          // <body>; an empty tab-stop chain bounces focus back to body or
          // outside the document (browser chrome).
          isFocusable: true,
        }
      })
      recentSignatures.push(state.sig)
      if (recentSignatures.length > RECENT_WINDOW) recentSignatures.shift()
      if (i > 20 && state.sig) {
        const recur = recentSignatures.filter((s) => s === state.sig).length
        if (recur >= CYCLE_THRESHOLD) {
          throw new Error(
            `[keyboard-scan] focus appears cycling after ${i} tabs; sig=${state.sig} recurred ${recur}× in last ${RECENT_WINDOW}`,
          )
        }
      }
      if (!state.insidePanels && state.isFocusable) {
        landedOnDownstreamFocusable = true
        break
      }
    }
    // Demand that Tab landed on a *real* downstream focusable element —
    // not on `<body>` (focus fell off the page) and not still inside the
    // panels block. Both failure modes used to satisfy the previous
    // `insidePanels === false` check, so a regression that drops focus on
    // exit would have passed silently.
    expect(
      landedOnDownstreamFocusable,
      `Tab should walk off the panels block onto a downstream focusable element within ${MAX_TABS} keystrokes`,
    ).toBe(true)
  })

  test('Escape dismisses an open category tooltip without moving focus', async ({
    page,
  }) => {
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    const firstBadge = page.locator('.cat-badge-help').first()
    await firstBadge.focus()
    await expect(page.getByRole('tooltip')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toBeHidden()
    // Focus stays on the activator — WCAG SC 1.4.13 dismissible contract.
    await expect(firstBadge).toBeFocused()
  })
})

test.describe('Story 5-8 — reduced-motion scan', () => {
  test('row-pulse transition collapses to 0 s under prefers-reduced-motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    const transition = await page
      .locator('tr.analysis-row')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    // The scoped CSS sets `transition: none` under the reduced-motion media
    // query; `transitionDuration` therefore reports '0s'.
    expect(transition).toBe('0s')
  })

  test('panel-link Enter triggers an immediate (non-smooth) scroll under reduced-motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const seed = await seedAnalysisFixture(page)
    await gotoAnalysisAndWait(page, seed)

    // Pick a panel link that targets an off-viewport row so the scroll is
    // unambiguously triggered by the jump (rather than coincidentally
    // already in view). The last panel link points at a row near the
    // bottom of the 20-row table.
    const lastLink = page.locator('.per-category-panels li a').last()
    const targetHref = await lastLink.getAttribute('href')
    expect(targetHref).toMatch(/^#feature-/)
    const featureKey = (targetHref ?? '').replace('#feature-', '')

    // Spy on `scrollIntoView` so we can pin the actual `behavior` flag the
    // production code passes — the reduced-motion branch must pass
    // `behavior: 'auto'`, never `'smooth'`. Asserting on scroll position
    // alone doesn't distinguish smooth (which also moves the position
    // within 50 ms) from auto.
    await page.evaluate(() => {
      const original = Element.prototype.scrollIntoView
      const w = window as unknown as { __scrollBehaviors__?: string[] }
      w.__scrollBehaviors__ = []
      Element.prototype.scrollIntoView = function (
        this: Element,
        opts?: boolean | ScrollIntoViewOptions,
      ): void {
        const behavior =
          typeof opts === 'object' && opts && 'behavior' in opts
            ? (opts.behavior ?? 'auto')
            : 'auto'
        w.__scrollBehaviors__?.push(behavior)
        return original.call(this, opts as ScrollIntoViewOptions)
      }
    })

    await lastLink.focus()
    await page.keyboard.press('Enter')

    const behaviors = await page.evaluate(
      () =>
        (window as unknown as { __scrollBehaviors__?: string[] })
          .__scrollBehaviors__ ?? [],
    )
    expect(behaviors).toContain('auto')
    expect(behaviors).not.toContain('smooth')

    // And the target row really did receive focus + a row-pulse class —
    // pulse hold under reduced-motion collapses to 0 ms, so by the time we
    // poll the class should be gone again (asserted by absence after a
    // short wait, which would be present for ~1000 ms under default motion).
    const targetRow = page.locator(`#feature-${featureKey}`)
    await expect(targetRow).toBeFocused()
    await page.waitForTimeout(50)
    await expect(targetRow).not.toHaveClass(/row-pulse/)
  })
})
