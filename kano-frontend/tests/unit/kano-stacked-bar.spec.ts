// @vitest-environment jsdom
/**
 * KanoStackedBar (Story 5-4) — proportional SVG segments in fixed
 * M→L→E→I→C→D order, percent-based viewBox, v-tooltip per segment,
 * `role="img"` + `aria-labelledby` wired to the companion table, dev-mode
 * warning when mounted with `total=0`.
 *
 * `<v-tooltip>` is stubbed: the test asserts the activator surface (rect
 * geometry, attributes, tooltip text propagation) — Vuetify's portal
 * rendering is not under test here.
 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import type { Category } from '@/api/types'
import KanoStackedBar from '@/components/KanoStackedBar.vue'

// Stub `v-tooltip` to render the activator slot with an empty `props`
// payload and expose the tooltip `text` as a `data-tooltip-text` attribute
// on a wrapping `<g>` (valid SVG, easy to query).
const VTooltipStub = defineComponent({
  props: ['text', 'location'],
  setup(props, { slots }) {
    return () =>
      h(
        'g',
        { 'data-tooltip-text': props.text, 'data-tooltip-location': props.location },
        slots.activator?.({ props: {} }),
      )
  },
})

const globalStubs = { 'v-tooltip': VTooltipStub }

const FIXED_ORDER: readonly Category[] = ['M', 'L', 'E', 'I', 'C', 'D'] as const

function dist(overrides: Partial<Record<Category, number>>): Record<Category, number> {
  const base = { M: 0, L: 0, E: 0, I: 0, C: 0, D: 0 }
  return { ...base, ...overrides }
}

describe('KanoStackedBar — segment composition', () => {
  test('renders only non-zero segments in fixed M→L→E→I→C→D order', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 3, L: 2 }),
        total: 5,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    const rects = wrapper.findAll('rect')
    expect(rects).toHaveLength(2)
    expect(rects[0].attributes('data-category')).toBe('M')
    expect(rects[1].attributes('data-category')).toBe('L')
  })

  test('segment widths and x-offsets are proportional to count/total', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 3, L: 2 }),
        total: 5,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    const rects = wrapper.findAll('rect')
    expect(rects[0].attributes('width')).toBe('60')
    expect(rects[0].attributes('x')).toBe('0')
    expect(rects[1].attributes('width')).toBe('40')
    expect(rects[1].attributes('x')).toBe('60')
  })

  test('iteration order ignores prop object-key insertion order', () => {
    // Pass keys in reverse order (D first) — output must still be M→L→E→I→C→D.
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: { D: 1, C: 1, I: 1, E: 1, L: 1, M: 1 },
        total: 6,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    const order = wrapper.findAll('rect').map((r) => r.attributes('data-category'))
    expect(order).toEqual([...FIXED_ORDER])
  })
})

describe('KanoStackedBar — accessibility wiring', () => {
  test('SVG carries role="img" and aria-labelledby pointing at the table id', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 5 }),
        total: 5,
        ariaLabelledBy: 'stb-feature-42',
      },
      global: { stubs: globalStubs },
    })

    const svg = wrapper.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-labelledby')).toBe('stb-feature-42')
  })

  test('every rendered segment has tabindex="0"', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 1, L: 1, E: 1, I: 1, C: 1, D: 1 }),
        total: 6,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    for (const rect of wrapper.findAll('rect')) {
      expect(rect.attributes('tabindex')).toBe('0')
    }
  })
})

describe('KanoStackedBar — tooltip text', () => {
  test('tooltip uses the copy-deck template with name/count/pct interpolation', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 7, L: 3 }),
        total: 10,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    const groups = wrapper.findAll('g[data-tooltip-text]')
    expect(groups).toHaveLength(2)
    expect(groups[0].attributes('data-tooltip-text')).toBe('Must-have: 7 responses (70.0%)')
    expect(groups[1].attributes('data-tooltip-text')).toBe('Performance: 3 responses (30.0%)')
    expect(groups[0].attributes('data-tooltip-location')).toBe('top')
  })
})

describe('KanoStackedBar — variant sizing', () => {
  test.each(['default', 'large', 'mini'] as const)(
    'variant=%s applies the variant CSS class on the root SVG',
    (variant) => {
      const wrapper = mount(KanoStackedBar, {
        props: {
          distribution: dist({ M: 1 }),
          total: 1,
          ariaLabelledBy: 'stb-test',
          variant,
        },
        global: { stubs: globalStubs },
      })

      expect(wrapper.find('svg').classes()).toContain(`variant-${variant}`)
    },
  )

  test('variant defaults to "default" when prop omitted', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({ M: 1 }),
        total: 1,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.find('svg').classes()).toContain('variant-default')
  })
})

describe('KanoStackedBar — empty / zero-total handling', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  test('total=0 renders empty markup and warns in dev', () => {
    const wrapper = mount(KanoStackedBar, {
      props: {
        distribution: dist({}),
        total: 0,
        ariaLabelledBy: 'stb-test',
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.findAll('rect')).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('total=0')
  })
})
