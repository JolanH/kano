// @vitest-environment jsdom
/**
 * AnalysisTable (Story 5-5) — feature/dominant/distribution/n row
 * composition. Asserts:
 *
 * - one row per feature with feature name + optional description
 * - single-dominant cell: "71%" + exactly one CatBadge
 * - tied dominant cell: "71% each" (via the `analysis.dominant.tiedPercent`
 *   key) + N CatBadges with "/" separators between
 * - per-row `n` is derived from `sum(distribution.values())`, not the
 *   poll-level total
 * - row click is NOT wired (no `cursor: pointer`, no click handler)
 *
 * Stubs Vuetify's v-data-table the same way as polls-page.spec.ts so the
 * spec controls which template slots render. The primitives (CatBadge /
 * KanoStackedBar / KanoStackedBarTable) are stubbed to keep the spec
 * focused on the composition logic; their internal rendering is covered
 * by their own specs (5-3 / 5-4).
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import { defineComponent, h } from 'vue'

import type { Category, PollAnalysis } from '@/api/types'
import AnalysisTable from '@/components/AnalysisTable.vue'

interface DataTableRow {
  feature_key: string
  name: string
  description: string | null
  dominant_categories: Category[]
  dominant_percentage: number
  distribution: Record<Category, number>
  n: number
}

interface DataTableHeader {
  key: string
}

// VDataTableStub mirrors the production v-data-table's slot contract used by
// AnalysisTable. Story 5-6 switched AnalysisTable to a full-row `#item` slot
// (so each `<tr>` can carry `id="feature-{key}"` + `tabindex="-1"` for the
// PerCategoryPanels jump-link pattern). If the consumer provides the `item`
// slot, the stub renders its output directly inside the `<tbody>` so the
// outer `<tr>` from the consumer is what hits the DOM (and is what the spec
// asserts against). Per-cell `item.<key>` slots are preserved as the
// fallback rendering path for any consumer that hasn't migrated.
const VDataTableStub = defineComponent({
  props: ['items', 'headers'],
  setup(props, { slots, attrs }) {
    return () => {
      const rowSlot = slots['item']
      const headerRow = h(
        'thead',
        {},
        h(
          'tr',
          {},
          (props.headers as DataTableHeader[]).map((header) =>
            h('th', { 'data-key': header.key }, ''),
          ),
        ),
      )

      const bodyChildren = (props.items as DataTableRow[]).map((item) => {
        if (rowSlot) {
          return rowSlot({ item })
        }
        return h(
          'tr',
          { 'data-row-key': item.feature_key },
          (props.headers as DataTableHeader[]).map((header) => {
            const slot = slots[`item.${header.key}`]
            return h(
              'td',
              { 'data-cell-key': header.key },
              slot ? slot({ item }) : '',
            )
          }),
        )
      })

      return h(
        'table',
        { 'data-testid': attrs['data-testid'] ?? undefined },
        [headerRow, h('tbody', {}, bodyChildren)],
      )
    }
  },
})

const CatBadgeStub = defineComponent({
  props: ['category', 'withHelp'],
  setup(props) {
    return () =>
      h(
        'span',
        {
          'data-cat-badge': props.category,
          'data-with-help': String(props.withHelp ?? false),
        },
        String(props.category),
      )
  },
})

const KanoStackedBarStub = defineComponent({
  props: ['distribution', 'total', 'ariaLabelledBy', 'variant'],
  setup(props) {
    return () =>
      h('div', {
        'data-stacked-bar': '',
        'data-total': props.total,
        'data-aria-labelled-by': props.ariaLabelledBy,
        'data-variant': props.variant,
      })
  },
})

const KanoStackedBarTableStub = defineComponent({
  props: ['id', 'distribution', 'total'],
  setup(props) {
    return () =>
      h('div', {
        'data-stacked-bar-table': '',
        'data-stbt-id': props.id,
        'data-total': props.total,
      })
  },
})

const globalStubs = {
  'v-data-table': VDataTableStub,
  CatBadge: CatBadgeStub,
  KanoStackedBar: KanoStackedBarStub,
  KanoStackedBarTable: KanoStackedBarTableStub,
}

function dist(overrides: Partial<Record<Category, number>>): Record<Category, number> {
  return { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0, ...overrides }
}

function analysis(features: PollAnalysis['features']): PollAnalysis {
  return {
    poll_id: 'p-1',
    epoch: 1,
    total_submissions: 10,
    features,
  }
}

describe('AnalysisTable — composition', () => {
  test('renders one row per feature with name + description', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-a',
            name: 'Feature A',
            description: 'First feature',
            distribution: dist({ M: 7, O: 3 }),
            dominant_categories: ['M'],
            dominant_percentage: 70,
          },
          {
            feature_key: 'feat-b',
            name: 'Feature B',
            description: null,
            distribution: dist({ O: 5, A: 5 }),
            dominant_categories: ['O', 'A'],
            dominant_percentage: 50,
          },
        ]),
      },
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('Feature A')
    expect(wrapper.text()).toContain('First feature')
    expect(wrapper.text()).toContain('Feature B')
  })

  test('single-dominant cell shows "70%" and exactly one CatBadge', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-a',
            name: 'A',
            description: null,
            distribution: dist({ M: 7, O: 3 }),
            dominant_categories: ['M'],
            dominant_percentage: 70,
          },
        ]),
      },
    })

    const pct = wrapper.find('[data-testid="analysis-dominant-pct"]')
    expect(pct.text()).toBe('70%')
    const badges = wrapper.findAll('[data-cat-badge]')
    expect(badges).toHaveLength(1)
    expect(badges[0].attributes('data-cat-badge')).toBe('M')
    // No "/" separator for single-dominant.
    expect(wrapper.find('.badge-sep').exists()).toBe(false)
  })

  test('tied dominant cell shows "50% each" and N CatBadges with "/" separators', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-tie',
            name: 'Tie',
            description: null,
            distribution: dist({ O: 5, A: 5 }),
            dominant_categories: ['O', 'A'],
            dominant_percentage: 50,
          },
        ]),
      },
    })

    const pct = wrapper.find('[data-testid="analysis-dominant-pct"]')
    expect(pct.text()).toBe('50% each')
    const badges = wrapper.findAll('[data-cat-badge]')
    expect(badges).toHaveLength(2)
    expect(badges[0].attributes('data-cat-badge')).toBe('O')
    expect(badges[1].attributes('data-cat-badge')).toBe('A')
    expect(wrapper.findAll('.badge-sep')).toHaveLength(1)
  })

  test('three-way tie renders "33.3% each" + 3 badges + 2 separators', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-three',
            name: 'Three',
            description: null,
            distribution: dist({ M: 1, O: 1, A: 1 }),
            dominant_categories: ['M', 'O', 'A'],
            dominant_percentage: 33.3,
          },
        ]),
      },
    })

    expect(wrapper.find('[data-testid="analysis-dominant-pct"]').text()).toBe('33.3% each')
    expect(wrapper.findAll('[data-cat-badge]')).toHaveLength(3)
    expect(wrapper.findAll('.badge-sep')).toHaveLength(2)
  })

  test('fractional dominant percentage renders with one decimal', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-frac',
            name: 'F',
            description: null,
            distribution: dist({ M: 2, O: 1 }),
            dominant_categories: ['M'],
            dominant_percentage: 66.7,
          },
        ]),
      },
    })

    expect(wrapper.find('[data-testid="analysis-dominant-pct"]').text()).toBe('66.7%')
  })

  test('per-row n is derived from sum(distribution.values()), not poll total', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: {
          poll_id: 'p-1',
          epoch: 1,
          // Poll total intentionally diverges from the per-feature sums to
          // prove the row's n is derived, not inlined.
          total_submissions: 999,
          features: [
            {
              feature_key: 'feat-a',
              name: 'A',
              description: null,
              distribution: dist({ M: 4, O: 3, A: 3 }),
              dominant_categories: ['M'],
              dominant_percentage: 40,
            },
          ],
        },
      },
    })

    expect(wrapper.find('[data-testid="analysis-n-feat-a"]').text()).toBe('10')
  })

  test('passes aria-labelled-by from feature_key to bar↔table pairing', () => {
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-x',
            name: 'X',
            description: null,
            distribution: dist({ M: 5 }),
            dominant_categories: ['M'],
            dominant_percentage: 100,
          },
        ]),
      },
    })

    const bar = wrapper.find('[data-stacked-bar]')
    const table = wrapper.find('[data-stacked-bar-table]')
    expect(bar.attributes('data-aria-labelled-by')).toBe('stb-feat-x')
    expect(table.attributes('data-stbt-id')).toBe('stb-feat-x')
  })

  test('Dominant-cell CatBadges receive :with-help="true" (Story 5-7)', () => {
    // Story 5-7 AC #1 / AC #9 — every CatBadge surfaced in the Dominant
    // column opts into the first-use help tooltip. Theme-audit and other
    // call sites leave the prop at its default `false`.
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-tie',
            name: 'Tie',
            description: null,
            distribution: dist({ M: 5, O: 5 }),
            dominant_categories: ['M', 'O'],
            dominant_percentage: 50,
          },
        ]),
      },
    })

    const badges = wrapper.findAll('[data-cat-badge]')
    expect(badges).toHaveLength(2)
    for (const badge of badges) {
      expect(badge.attributes('data-with-help')).toBe('true')
    }
  })

  test('each <tr> carries id="feature-{key}" and tabindex="-1" (Story 5-6)', () => {
    // Story 5-6 AC #6 / #7 — PerCategoryPanels anchor links target the
    // table row's stable id; the row is programmatically focusable but not
    // in the natural Tab order (WCAG H91 / SC 2.4.3).
    const wrapper = mount(AnalysisTable, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-a',
            name: 'A',
            description: null,
            distribution: dist({ M: 5 }),
            dominant_categories: ['M'],
            dominant_percentage: 100,
          },
          {
            feature_key: 'feat-b',
            name: 'B',
            description: null,
            distribution: dist({ O: 5 }),
            dominant_categories: ['O'],
            dominant_percentage: 100,
          },
        ]),
      },
    })

    const rowA = wrapper.find('tr#feature-feat-a')
    const rowB = wrapper.find('tr#feature-feat-b')
    expect(rowA.exists()).toBe(true)
    expect(rowB.exists()).toBe(true)
    expect(rowA.attributes('tabindex')).toBe('-1')
    expect(rowB.attributes('tabindex')).toBe('-1')
    expect(rowA.classes()).toContain('analysis-row')
  })

  test('table renders no click handler on rows (drill-down deferred per UX spec)', () => {
    // The component must not attach `@click:row` to the v-data-table. We
    // pin this by intercepting the prop and asserting it's undefined.
    let observedRowProps: unknown
    const CapturingTable = defineComponent({
      props: ['items', 'headers', 'rowProps'],
      setup(props) {
        observedRowProps = props.rowProps
        return () => h('table', {}, [])
      },
    })

    mount(AnalysisTable, {
      global: { stubs: { ...globalStubs, 'v-data-table': CapturingTable } },
      props: {
        analysis: analysis([
          {
            feature_key: 'feat-a',
            name: 'A',
            description: null,
            distribution: dist({ M: 5 }),
            dominant_categories: ['M'],
            dominant_percentage: 100,
          },
        ]),
      },
    })

    expect(observedRowProps).toBeUndefined()
  })
})
