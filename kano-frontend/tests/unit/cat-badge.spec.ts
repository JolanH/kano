// @vitest-environment jsdom
/**
 * CatBadge (Story 5-3) — color swatch + human-readable label for the six
 * Kano categories. The swatch is decorative (`aria-hidden`); the label is
 * the sole accessible channel. Labels come from `useCopy`, so the spec
 * pulls them from the live `en.ts` registry — a drift between the copy
 * deck and what the component renders is a real failure (FR38).
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'

import type { Category } from '@/api/types'
import CatBadge from '@/components/CatBadge.vue'
import { COPY_KEY } from '@/components/cat-badge.constants'
import en from '@/copy/en'

const VARIANTS = [
  { code: 'M', swatch: 'swatch-must' },
  { code: 'L', swatch: 'swatch-perf' },
  { code: 'E', swatch: 'swatch-del' },
  { code: 'I', swatch: 'swatch-ind' },
  { code: 'C', swatch: 'swatch-cont' },
  { code: 'D', swatch: 'swatch-doub' },
] as const satisfies ReadonlyArray<{ code: Category; swatch: string }>

describe('CatBadge — six valid variants', () => {
  test.each(VARIANTS)(
    'renders $code with copy-deck label and class $swatch',
    ({ code, swatch }) => {
      const wrapper = mount(CatBadge, { props: { category: code } })

      // Label is the live copy-deck value — proves FR38 (no bare letter
      // codes leak to the user) AND that the component delegates to
      // `useCopy` rather than hardcoding strings.
      expect(wrapper.text()).toBe(en[COPY_KEY[code]])

      const swatchEl = wrapper.find('.cat-swatch')
      expect(swatchEl.exists()).toBe(true)
      expect(swatchEl.classes()).toContain(swatch)
      expect(swatchEl.attributes('aria-hidden')).toBe('true')

      // Data attribute keeps the wire code on the DOM for E2E + visual-
      // regression selectors without leaking it to the rendered text.
      expect(wrapper.find('.cat-badge').attributes('data-category')).toBe(code)
    },
  )
})

describe('CatBadge — invalid prop', () => {
  test('renders nothing and warns in dev on invalid category', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(CatBadge, { props: { category: 'X' as unknown as Category } })

    expect(wrapper.find('.cat-badge').exists()).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('invalid category')
    warn.mockRestore()
  })

  test('warns again when a valid prop is mutated to an invalid value', async () => {
    // watchEffect-based guard means subsequent reactive changes also
    // surface the dev warning. Pinned by spec so a regression to a
    // setup-time-only `if` is caught.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(CatBadge, { props: { category: 'M' } })
    expect(warn).not.toHaveBeenCalled()

    await wrapper.setProps({ category: 'Z' as unknown as Category })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('invalid category')
    warn.mockRestore()
  })
})
