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
import { defineComponent, h } from 'vue'

import type { Category } from '@/api/types'
import CatBadge from '@/components/CatBadge.vue'
import { COPY_KEY, HELP_KEY } from '@/components/kano-categories'
import en from '@/copy/en'

// Stub `v-tooltip` so the spec controls the activator-slot rendering and
// can inspect the bound `text` / `location` / `open-delay` props (Story 5-7).
// `aria-describedby` is propagated to the activator via the slot's `props`
// payload — mirrors how Vuetify wires the focus-reveal SR contract at
// runtime; pinning a synthetic id here lets the unit test pin that the
// outer activator inherits the attribute through `v-bind="tipProps"`.
const VTooltipStub = defineComponent({
  props: ['text', 'location', 'openDelay'],
  setup(props, { slots }) {
    return () =>
      h(
        'span',
        {
          'data-stub': 'v-tooltip',
          'data-tooltip-text': props.text,
          'data-tooltip-location': props.location,
          'data-tooltip-open-delay': props.openDelay,
        },
        slots.activator?.({
          props: { 'aria-describedby': 'v-tooltip-stub-described-by' },
        }),
      )
  },
})

const tooltipStubs = { 'v-tooltip': VTooltipStub }

const VARIANTS = [
  { code: 'M', swatch: 'swatch-must' },
  { code: 'O', swatch: 'swatch-perf' },
  { code: 'A', swatch: 'swatch-attr' },
  { code: 'I', swatch: 'swatch-ind' },
  { code: 'R', swatch: 'swatch-rev' },
  { code: 'Q', swatch: 'swatch-que' },
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

describe('CatBadge — with-help tooltip (Story 5-7)', () => {
  test('default (with-help=false): renders the legacy non-tooltip surface', () => {
    const wrapper = mount(CatBadge, {
      props: { category: 'M' },
      global: { stubs: tooltipStubs },
    })
    // The plain `.cat-badge` branch — no help wrapper, no tooltip stub.
    expect(wrapper.find('.cat-badge-help').exists()).toBe(false)
    expect(wrapper.find('[data-stub="v-tooltip"]').exists()).toBe(false)
    expect(wrapper.find('.cat-badge').exists()).toBe(true)
    expect(wrapper.find('.cat-badge').attributes('tabindex')).toBeUndefined()
  })

  test('with-help=true: wraps the badge in a v-tooltip carrying the help-key text', () => {
    const wrapper = mount(CatBadge, {
      props: { category: 'M', withHelp: true },
      global: { stubs: tooltipStubs },
    })

    const tooltip = wrapper.find('[data-stub="v-tooltip"]')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-tooltip-text')).toBe(en[HELP_KEY['M']])
    expect(tooltip.attributes('data-tooltip-location')).toBe('top')
    expect(tooltip.attributes('data-tooltip-open-delay')).toBe('300')

    const activator = wrapper.find('.cat-badge-help')
    expect(activator.exists()).toBe(true)
    // tabindex=0 is required so keyboard users can focus the badge and
    // reveal the tooltip (Story 5-7 AC #5).
    expect(activator.attributes('tabindex')).toBe('0')
    // `aria-describedby` is wired through Vuetify's `v-bind="tipProps"`
    // activator spread; AC #3 requires SRs to announce the tooltip content
    // as supplementary (via `aria-describedby`), NOT as a replacement
    // label (via `aria-label`). Asserting that the attribute survives the
    // spread proves the wiring is honest — not just `tabindex=0` plus a
    // tooltip text prop.
    expect(activator.attributes('aria-describedby')).toBe(
      'v-tooltip-stub-described-by',
    )
    // Activator still renders the swatch + label — the help wrapper is
    // additive, not a replacement of the visible content.
    expect(activator.text()).toBe(en[COPY_KEY['M']])
    expect(activator.find('.cat-swatch').exists()).toBe(true)
  })

  test('each category code resolves to its own help-key tooltip text', () => {
    const codes: Category[] = ['M', 'O', 'A', 'I', 'R', 'Q']
    for (const code of codes) {
      const wrapper = mount(CatBadge, {
        props: { category: code, withHelp: true },
        global: { stubs: tooltipStubs },
      })
      expect(
        wrapper.find('[data-stub="v-tooltip"]').attributes('data-tooltip-text'),
      ).toBe(en[HELP_KEY[code]])
    }
  })

  test('invalid category + with-help=true: still emits nothing (no tooltip leak)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(CatBadge, {
      props: { category: 'X' as unknown as Category, withHelp: true },
      global: { stubs: tooltipStubs },
    })
    expect(wrapper.find('[data-stub="v-tooltip"]').exists()).toBe(false)
    expect(wrapper.find('.cat-badge-help').exists()).toBe(false)
    expect(wrapper.find('.cat-badge').exists()).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
