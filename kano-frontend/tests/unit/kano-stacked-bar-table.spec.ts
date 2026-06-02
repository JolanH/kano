// @vitest-environment jsdom
/**
 * KanoStackedBarTable (Story 5-4) — accessible-fallback companion to
 * `<KanoStackedBar>`. Always six rows in fixed M→O→A→I→R→Q order
 * regardless of which categories are zero (a screen reader announces
 * "row 4 of 6, Indifferent, 0, 0.0%" — the zero is informative).
 *
 * The percentage-rounding parity assertion against the backend lives at
 * the bottom of this file: client-side `(count/total*100).toFixed(1)`
 * (round-half-away-from-zero) must equal the visible 1-decimal string a
 * Python `round(x, 1)` (banker's rounding) would produce, for all the
 * count/total fractions the analysis service actually emits.
 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Category } from '@/api/types'
import KanoStackedBarTable from '@/components/KanoStackedBarTable.vue'
import en from '@/copy/en'

const FIXED_ORDER: readonly Category[] = ['M', 'O', 'A', 'I', 'R', 'Q'] as const

const CATEGORY_LABEL: Record<Category, string> = {
  M: en['pm.category.must'],
  O: en['pm.category.perf'],
  A: en['pm.category.attr'],
  I: en['pm.category.ind'],
  R: en['pm.category.rev'],
  Q: en['pm.category.que'],
}

function dist(overrides: Partial<Record<Category, number>>): Record<Category, number> {
  const base = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 }
  return { ...base, ...overrides }
}

describe('KanoStackedBarTable — row composition', () => {
  test('always renders 6 rows, including zero-count categories', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 5 }), total: 5, id: 'stb-test' },
    })

    expect(wrapper.findAll('tbody tr')).toHaveLength(6)
  })

  test('row order is fixed M→O→A→I→R→Q regardless of prop key order', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: {
        distribution: { Q: 1, R: 2, I: 3, A: 4, O: 5, M: 6 },
        total: 21,
        id: 'stb-test',
      },
    })

    const order = wrapper.findAll('tbody tr').map((r) => r.attributes('data-category'))
    expect(order).toEqual([...FIXED_ORDER])
  })

  test('category labels come from the copy deck', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: {
        distribution: dist({ M: 1, O: 1, A: 1, I: 1, R: 1, Q: 1 }),
        total: 6,
        id: 'stb-test',
      },
    })

    const labels = wrapper.findAll('tbody tr td:first-child').map((td) => td.text())
    expect(labels).toEqual(FIXED_ORDER.map((c) => CATEGORY_LABEL[c]))
  })

  test('id prop is set on the root <table> for aria-labelledby pairing', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1 }), total: 1, id: 'stb-feature-42' },
    })

    expect(wrapper.find('table').attributes('id')).toBe('stb-feature-42')
  })
})

describe('KanoStackedBarTable — sr-only / visible toggle', () => {
  test('visible omitted (default false): root carries the sr-only class', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1 }), total: 1, id: 'stb-test' },
    })

    expect(wrapper.find('table').classes()).toContain('sr-only')
  })

  test('visible=false: root carries the sr-only class', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1 }), total: 1, id: 'stb-test', visible: false },
    })

    expect(wrapper.find('table').classes()).toContain('sr-only')
  })

  test('visible=true: sr-only class is absent', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1 }), total: 1, id: 'stb-test', visible: true },
    })

    expect(wrapper.find('table').classes()).not.toContain('sr-only')
  })
})

describe('KanoStackedBarTable — percentage rendering', () => {
  test('1/3 of total renders as 33.3% per row', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1, O: 1, A: 1 }), total: 3, id: 'stb-test' },
    })

    const cells = wrapper.findAll('tbody tr td:nth-child(3)').map((td) => td.text())
    // M / O / A each show 33.3%; I / R / Q each show 0.0%.
    expect(cells).toEqual(['33.3%', '33.3%', '33.3%', '0.0%', '0.0%', '0.0%'])
  })

  test('count cell mirrors the distribution prop verbatim', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 7, O: 3 }), total: 10, id: 'stb-test' },
    })

    const counts = wrapper.findAll('tbody tr td:nth-child(2)').map((td) => td.text())
    expect(counts).toEqual(['7', '3', '0', '0', '0', '0'])
  })

  test('thead column labels come from the copy deck', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({ M: 1 }), total: 1, id: 'stb-test' },
    })

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toEqual([
      en['analysis.stackedBarTable.col.category'],
      en['analysis.stackedBarTable.col.count'],
      en['analysis.stackedBarTable.col.percentage'],
    ])
  })
})

describe('KanoStackedBarTable — empty / zero-total handling', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  test('total=0 renders empty markup and warns in dev', () => {
    const wrapper = mount(KanoStackedBarTable, {
      props: { distribution: dist({}), total: 0, id: 'stb-test' },
    })

    expect(wrapper.find('table').exists()).toBe(false)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('total=0')
  })
})

describe('KanoStackedBarTable — rounding parity with backend Story 5-1', () => {
  // The rounding-parity cases deliberately mount with `sum(distribution) !==
  // total` (only one category populated; others zero) — that's the smallest
  // mount that exercises the rounding code path for a single ratio. The
  // contract dev-warning the component emits for that mismatch is expected
  // noise in this block; silence it so the spec output stays clean.
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  // Python `round(x, 1)` uses banker's rounding; JS `toFixed(1)` rounds
  // half-away-from-zero. For every (count, total) the analysis service
  // actually emits — small integer ratios — neither path lands on a `.x5`
  // half-case after the `*100` scaling, so the two rounding modes return
  // the same 1-decimal string. This spec pins that agreement for the
  // canonical fractions called out in the Story 5-4 Dev Notes.
  //
  // If a future input lands on a true half-case (e.g. 1/8 = 12.5), the
  // service-computed value is authoritative — never re-round the wire
  // value on the client; only fresh-from-distribution percentages
  // (counts the table computes itself) hit this code path.
  test.each([
    { count: 1, total: 3, expected: '33.3' }, // 33.3333... → 33.3
    { count: 2, total: 3, expected: '66.7' }, // 66.6666... → 66.7
    { count: 1, total: 6, expected: '16.7' }, // 16.6666... → 16.7
    { count: 5, total: 6, expected: '83.3' }, // 83.3333... → 83.3
    { count: 1, total: 7, expected: '14.3' }, // 14.2857... → 14.3
    { count: 6, total: 7, expected: '85.7' }, // 85.7142... → 85.7
    { count: 1, total: 1, expected: '100.0' }, // exact
    { count: 0, total: 5, expected: '0.0' }, // exact zero
  ])(
    'count=$count / total=$total renders as $expected%',
    ({ count, total, expected }) => {
      const wrapper = mount(KanoStackedBarTable, {
        props: { distribution: dist({ M: count }), total, id: 'stb-test' },
      })

      const mRow = wrapper.find('tbody tr[data-category="M"]')
      expect(mRow.find('td:nth-child(3)').text()).toBe(`${expected}%`)
    },
  )

  // Cross-language parity gate. The values below are what Python
  // `round(count / total * 100, 1)` produces for the same (count, total)
  // pairs — captured from the Story 5-1 service so a JS/Python
  // rounding-mode divergence (e.g. an input that hits a true `.x5`
  // half-case where toFixed rounds away from zero but Python rounds to
  // even) fails this test rather than silently shipping mismatched
  // percentages between the bar/table and the dominant_percentage chip.
  //
  // Re-generate via:
  //   from kano.services.analysis import _dominant
  //   from kano.services.kano_matrix import Category
  //   for count, total in [(1, 3), ...]:
  //       d = dict.fromkeys(Category, 0)
  //       d[Category.MUSTBE] = count
  //       _, pct = _dominant(d, total=total)
  //       print(count, total, pct)
  const PYTHON_ROUNDED_FIXTURE: ReadonlyArray<{ count: number; total: number; python_pct: string }> = [
    { count: 1, total: 3, python_pct: '33.3' },
    { count: 2, total: 3, python_pct: '66.7' },
    { count: 1, total: 6, python_pct: '16.7' },
    { count: 5, total: 6, python_pct: '83.3' },
    { count: 1, total: 7, python_pct: '14.3' },
    { count: 6, total: 7, python_pct: '85.7' },
    { count: 4, total: 7, python_pct: '57.1' },
    { count: 5, total: 7, python_pct: '71.4' },
    { count: 1, total: 1, python_pct: '100.0' },
    { count: 0, total: 5, python_pct: '0.0' },
    { count: 1, total: 9, python_pct: '11.1' },
    { count: 8, total: 9, python_pct: '88.9' },
    // Specifically watch the half-case land: 1/8 = 12.5 percent exactly.
    // Python's banker's rounding keeps 12.5 → 12.5 (no rounding needed at
    // 1 decimal), and toFixed also keeps 12.5 → "12.5". This row pins
    // that the only "true half" case under the analysis-service inputs
    // remains stable across languages.
    { count: 1, total: 8, python_pct: '12.5' },
  ]
  test.each(PYTHON_ROUNDED_FIXTURE)(
    'JS toFixed(1) matches Python round(x, 1) for count=$count / total=$total',
    ({ count, total, python_pct }) => {
      const wrapper = mount(KanoStackedBarTable, {
        props: { distribution: dist({ M: count }), total, id: 'stb-test' },
      })
      const mRow = wrapper.find('tbody tr[data-category="M"]')
      expect(mRow.find('td:nth-child(3)').text()).toBe(`${python_pct}%`)
    },
  )
})
