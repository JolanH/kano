// @vitest-environment jsdom
/**
 * KanoCategoryPie — dominant-category repartition pie at the top of the
 * "By category" panel. Asserts:
 *
 * - Slices key on each feature's dominant category, sized by category weight
 * - A tied feature splits fractionally (1/N) across its tied categories so
 *   the slices sum to exactly 100%
 * - Fixed M → O → A → I → R → Q slice + legend order regardless of input
 * - Features with an empty `dominant_categories` list contribute nothing
 * - A lone present category (100%) renders a full `<circle>`, not an arc path
 * - Total weight ≤ 0 renders nothing
 * - Percentage rounding mirrors the panel (integer or 1 dp)
 * - SVG label + legend text are sourced from the copy deck (no literals)
 *
 * `<v-tooltip>` is stubbed (as in kano-stacked-bar.spec) — Vuetify's portal
 * rendering is not under test; we assert the activator surface (the wedge
 * geometry + tooltip text propagation).
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import type { Category, FeatureAnalysis, PollAnalysis } from '@/api/types'
import KanoCategoryPie from '@/components/KanoCategoryPie.vue'
import en from '@/copy/en'

// Render the activator slot inside a `<g>` (valid SVG) and surface the
// tooltip text as a queryable attribute.
const VTooltipStub = defineComponent({
  props: ['text', 'location'],
  setup(props, { slots }) {
    return () =>
      h(
        'g',
        { 'data-tooltip-text': props.text },
        slots.activator?.({ props: {} }),
      )
  },
})

const globalStubs = { 'v-tooltip': VTooltipStub }

function dist(): Record<Category, number> {
  return { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 }
}

function mkFeature(
  feature_key: string,
  dominant_categories: Category[],
): FeatureAnalysis {
  return {
    feature_key,
    name: feature_key,
    description: null,
    distribution: dist(),
    dominant_categories,
    dominant_percentage: 0,
  }
}

function analysis(features: FeatureAnalysis[], total = 10): PollAnalysis {
  return { poll_id: 'poll-1', epoch: 1, total_submissions: total, features }
}

function legendLabel(cat: Category, pct: string): string {
  return en['analysis.pie.sliceLabel']
    .replace('{name}', en[`pm.category.${({ M: 'must', O: 'perf', A: 'attr', I: 'ind', R: 'rev', Q: 'que' } as const)[cat]}`])
    .replace('{pct}', pct)
}

function mountPie(features: FeatureAnalysis[]) {
  return mount(KanoCategoryPie, {
    props: { analysis: analysis(features) },
    global: { stubs: globalStubs },
  })
}

describe('KanoCategoryPie — slice composition', () => {
  test('slices are sized by dominant-category counts', () => {
    // M=2, O=1, A=1 → total 4 → M 50%, O 25%, A 25%.
    const wrapper = mountPie([
      mkFeature('a', ['M']),
      mkFeature('b', ['M']),
      mkFeature('c', ['O']),
      mkFeature('d', ['A']),
    ])

    const cats = wrapper.findAll('path').map((p) => p.attributes('data-category'))
    expect(cats).toEqual(['M', 'O', 'A'])

    const legend = wrapper.findAll('.pie-legend .legend-text').map((n) => n.text())
    expect(legend).toEqual([
      legendLabel('M', '50'),
      legendLabel('O', '25'),
      legendLabel('A', '25'),
    ])
  })

  test('slice + legend order is fixed M→O→A→I→R→Q regardless of input order', () => {
    const wrapper = mountPie([
      mkFeature('d', ['Q']),
      mkFeature('c', ['R']),
      mkFeature('i', ['I']),
      mkFeature('e', ['A']),
      mkFeature('l', ['O']),
      mkFeature('m', ['M']),
    ])

    const order = wrapper
      .findAll('.pie-legend li')
      .map((li) => li.attributes('data-category'))
    expect(order).toEqual(['M', 'O', 'A', 'I', 'R', 'Q'])
  })

  test('per-slice tooltip text matches the legend label', () => {
    const wrapper = mountPie([mkFeature('a', ['M']), mkFeature('b', ['O'])])
    const tips = wrapper.findAll('[data-tooltip-text]').map((g) => g.attributes('data-tooltip-text'))
    expect(tips).toEqual([legendLabel('M', '50'), legendLabel('O', '50')])
  })
})

describe('KanoCategoryPie — tie handling (fractional split)', () => {
  test('a tied feature splits 1/N across its tied categories', () => {
    // One feature tied M+O, one feature M-only → M=1.5, O=0.5 → 75% / 25%.
    const wrapper = mountPie([mkFeature('tie', ['M', 'O']), mkFeature('m', ['M'])])

    const legend = wrapper.findAll('.pie-legend .legend-text').map((n) => n.text())
    expect(legend).toEqual([legendLabel('M', '75'), legendLabel('O', '25')])
  })

  test('a lone tied feature splits to 50/50 and sums to 100%', () => {
    const wrapper = mountPie([mkFeature('tie', ['M', 'O'])])
    const legend = wrapper.findAll('.pie-legend .legend-text').map((n) => n.text())
    expect(legend).toEqual([legendLabel('M', '50'), legendLabel('O', '50')])
  })

  test('even three-way split uses largest-remainder so the displayed total is 100%', () => {
    // Three equal shares each round to 33.3 → naive display reads 99.9%.
    // Largest-remainder hands the leftover 0.1 to the first slice → 33.4.
    const wrapper = mountPie([mkFeature('a', ['M']), mkFeature('b', ['O']), mkFeature('c', ['A'])])
    const legend = wrapper.findAll('.pie-legend .legend-text').map((n) => n.text())
    expect(legend).toEqual([
      legendLabel('M', '33.4'),
      legendLabel('O', '33.3'),
      legendLabel('A', '33.3'),
    ])

    // The printed percentages sum to exactly 100.0.
    const pcts = wrapper
      .findAll('.pie-legend .legend-text')
      .map((n) => Number.parseFloat(n.text().split(': ')[1]))
    const sum = pcts.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(100, 5)
  })
})

describe('KanoCategoryPie — arc geometry', () => {
  test('two equal slices emit the expected arc `d` paths (50/50)', () => {
    // Sweep starts at 12 o'clock and runs clockwise on r=49 centred at
    // (50,50): slice 1 spans top→bottom down the right, slice 2 bottom→top.
    const wrapper = mountPie([mkFeature('a', ['M']), mkFeature('b', ['O'])])
    const paths = wrapper.findAll('path')
    expect(paths[0].attributes('d')).toBe('M 50 50 L 50 1 A 49 49 0 0 1 50 99 Z')
    expect(paths[1].attributes('d')).toBe('M 50 50 L 50 99 A 49 49 0 0 1 50 1 Z')
  })

  test('a slice larger than 50% sets the large-arc flag', () => {
    // M = 3/4 → its arc spans 270°, so the large-arc flag must be 1; the
    // minority O slice (90°) keeps flag 0.
    const wrapper = mountPie([
      mkFeature('a', ['M']),
      mkFeature('b', ['M']),
      mkFeature('c', ['M']),
      mkFeature('d', ['O']),
    ])
    const paths = wrapper.findAll('path')
    // `A rx ry xrot largeArc sweep x y` — the 5th token after `A` is largeArc.
    const largeArcFlag = (d: string) => d.split('A ')[1].trim().split(/\s+/)[3]
    expect(largeArcFlag(paths[0].attributes('d')!)).toBe('1') // M, 270°
    expect(largeArcFlag(paths[1].attributes('d')!)).toBe('0') // O, 90°
  })
})

describe('KanoCategoryPie — edge cases', () => {
  test('a single 100% category renders a full <circle>, not an arc path', () => {
    const wrapper = mountPie([mkFeature('a', ['M']), mkFeature('b', ['M'])])

    expect(wrapper.findAll('path')).toHaveLength(0)
    const circle = wrapper.find('circle')
    expect(circle.exists()).toBe(true)
    expect(circle.attributes('data-category')).toBe('M')
    expect(wrapper.find('.pie-legend .legend-text').text()).toBe(legendLabel('M', '100'))
  })

  test('features with an empty dominant_categories list contribute nothing', () => {
    // Empty-list feature is the Story 5-1 "no-data" shape; it must not skew
    // the pie. Here only the M feature counts → 100%.
    const wrapper = mountPie([mkFeature('a', ['M']), mkFeature('nodata', [])])
    const legend = wrapper.findAll('.pie-legend .legend-text').map((n) => n.text())
    expect(legend).toEqual([legendLabel('M', '100')])
  })

  test('total weight ≤ 0 renders nothing', () => {
    const wrapper = mountPie([mkFeature('nodata', []), mkFeature('nodata2', [])])
    expect(wrapper.find('[data-testid="kano-category-pie"]').exists()).toBe(false)
  })
})

describe('KanoCategoryPie — accessibility / copy', () => {
  test('SVG is role="img" with the copy-deck aria-label', () => {
    const wrapper = mountPie([mkFeature('a', ['M'])])
    const svg = wrapper.find('svg.pie-svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe(en['analysis.pie.ariaLabel'])
  })

  test('legend swatches are aria-hidden (decorative)', () => {
    const wrapper = mountPie([mkFeature('a', ['M'])])
    expect(wrapper.find('.legend-swatch').attributes('aria-hidden')).toBe('true')
  })

  test('no raw category code leaks into the legend text (copy-sourced labels)', () => {
    const wrapper = mountPie([mkFeature('a', ['M'])])
    // The visible label is the human copy ("Must-be: 100%"), never "M".
    expect(wrapper.find('.legend-text').text()).not.toBe('M: 100%')
    expect(wrapper.find('.legend-text').text()).toContain(en['pm.category.must'])
  })
})