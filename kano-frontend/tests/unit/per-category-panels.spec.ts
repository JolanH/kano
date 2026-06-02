// @vitest-environment jsdom
/**
 * PerCategoryPanels (Story 5-6) — secondary cross-index below the analysis
 * table. Asserts:
 *
 * - Fixed M → O → A → I → R → Q section order regardless of input order
 * - Categories with zero dominant features are omitted entirely (AC #2)
 * - Tied features appear in EACH tied panel — no dedup (FR35 / AC #5)
 * - Each panel header is an `<h3>` containing a `<CatBadge>` (AC #3)
 * - Anchor `href` values follow the `#feature-{feature_key}` pattern (AC #4/#6)
 * - Percentage rounding mirrors Story 5-1 / AnalysisTable (integer or 1 dp)
 * - `total_submissions === 0` short-circuits to an empty render + dev warn
 * - User-visible strings sourced from the copy deck (no inline literals)
 * - `onAnchorClick` smooth-scrolls, focuses the target row, and adds a
 *   `.row-pulse` class for ~1 s (or 0 ms under reduced-motion)
 *
 * Stubs `<CatBadge>` to keep the spec focused on the panels' composition
 * logic; CatBadge's rendering is covered by `cat-badge.spec.ts`.
 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import type { Category, FeatureAnalysis, PollAnalysis } from '@/api/types'
import PerCategoryPanels from '@/components/PerCategoryPanels.vue'
import en from '@/copy/en'

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

// Stub the repartition pie — its math + rendering are covered by
// `kano-category-pie.spec.ts`. Here we only assert it mounts in the right
// place (above the section lists) without pulling in Vuetify's v-tooltip.
const KanoCategoryPieStub = defineComponent({
  props: ['analysis'],
  setup() {
    return () => h('div', { 'data-testid': 'kano-category-pie-stub' })
  },
})

// Stub the Kano category reference aside — its glossary rendering is covered
// by `kano-category-reference.spec.ts`. Here we only assert it mounts
// alongside the pie + section lists.
const KanoCategoryReferenceStub = defineComponent({
  setup() {
    return () => h('aside', { 'data-testid': 'kano-category-reference-stub' })
  },
})

const globalStubs = {
  CatBadge: CatBadgeStub,
  KanoCategoryPie: KanoCategoryPieStub,
  KanoCategoryReference: KanoCategoryReferenceStub,
}

function dist(
  overrides: Partial<Record<Category, number>> = {},
): Record<Category, number> {
  return { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0, ...overrides }
}

function mkFeature(
  feature_key: string,
  name: string,
  dominant_categories: Category[],
  dominant_percentage: number,
): FeatureAnalysis {
  return {
    feature_key,
    name,
    description: null,
    distribution: dist(),
    dominant_categories,
    dominant_percentage,
  }
}

function analysis(features: FeatureAnalysis[], total = 10): PollAnalysis {
  return {
    poll_id: 'poll-1',
    epoch: 1,
    total_submissions: total,
    features,
  }
}

describe('PerCategoryPanels — composition', () => {
  test('renders one panel per category with at least one dominant feature', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('a', 'Feature A', ['M'], 70),
          mkFeature('b', 'Feature B', ['O'], 60),
          mkFeature('c', 'Feature C', ['M'], 50),
          mkFeature('e', 'Feature E', ['A'], 100),
          // No features dominate I / R / Q — those panels must be absent.
        ]),
      },
    })

    const panels = wrapper.findAll('section.category-panel')
    expect(panels).toHaveLength(3)
    expect(panels[0].classes()).toContain('panel-m')
    expect(panels[1].classes()).toContain('panel-o')
    expect(panels[2].classes()).toContain('panel-a')

    // No empty Indifferent / Reverse / Questionable panels.
    expect(wrapper.find('.panel-i').exists()).toBe(false)
    expect(wrapper.find('.panel-r').exists()).toBe(false)
    expect(wrapper.find('.panel-q').exists()).toBe(false)
  })

  test('section order is fixed M → O → A → I → R → Q regardless of input order', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        // Input order intentionally reversed from canonical.
        analysis: analysis([
          mkFeature('d', 'Q feat', ['Q'], 80),
          mkFeature('c', 'R feat', ['R'], 80),
          mkFeature('i', 'I feat', ['I'], 80),
          mkFeature('e', 'A feat', ['A'], 80),
          mkFeature('l', 'O feat', ['O'], 80),
          mkFeature('m', 'M feat', ['M'], 80),
        ]),
      },
    })

    const panelClasses = wrapper
      .findAll('section.category-panel')
      .map((p) =>
        Array.from(p.classes()).find((c) => c.startsWith('panel-') && c !== 'category-panel'),
      )
    expect(panelClasses).toEqual([
      'panel-m',
      'panel-o',
      'panel-a',
      'panel-i',
      'panel-r',
      'panel-q',
    ])
  })

  test('tied-dominant feature appears in EACH tied panel (FR35)', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('a', 'Feature A', ['M'], 70),
          mkFeature('tie', 'Tied X', ['M', 'O'], 50),
        ]),
      },
    })

    const mustPanel = wrapper.find('.panel-m')
    const perfPanel = wrapper.find('.panel-o')
    expect(mustPanel.text()).toContain('Tied X')
    expect(perfPanel.text()).toContain('Tied X')

    // Must-be panel: 2 entries (A + Tied X); Performance panel: 1 (Tied X).
    expect(mustPanel.findAll('li')).toHaveLength(2)
    expect(perfPanel.findAll('li')).toHaveLength(1)
  })

  test('each panel header is an <h3> containing a <CatBadge with-help>', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('a', 'A', ['M'], 70)]),
      },
    })

    const header = wrapper.find('.panel-m .panel-header')
    expect(header.element.tagName).toBe('H3')
    expect(header.attributes('id')).toBe('panel-h3-M')
    const badge = header.find('[data-cat-badge]')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('data-cat-badge')).toBe('M')
    // Story 5-7 — panel-header CatBadges opt into the help-tooltip overlay.
    expect(badge.attributes('data-with-help')).toBe('true')

    // The section aria-labelledby points at the h3.
    const section = wrapper.find('.panel-m')
    expect(section.attributes('aria-labelledby')).toBe('panel-h3-M')
  })

  test('anchor href values follow #feature-{feature_key}', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('a', 'A', ['M'], 70),
          mkFeature('b', 'B', ['O'], 60),
        ]),
      },
    })

    const mustLink = wrapper.find('.panel-m a')
    const perfLink = wrapper.find('.panel-o a')
    expect(mustLink.attributes('href')).toBe('#feature-a')
    expect(perfLink.attributes('href')).toBe('#feature-b')
  })

  test('integer percentage renders without decimal (70%)', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('a', 'A', ['M'], 70)]),
      },
    })

    expect(wrapper.find('.panel-m .entry-pct').text()).toBe('70%')
  })

  test('fractional percentage renders with one decimal (33.3%)', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('a', 'A', ['M'], 33.3)]),
      },
    })

    expect(wrapper.find('.panel-m .entry-pct').text()).toBe('33.3%')
  })

  test('tied feature shows the tied percentage in EACH panel (50% in both)', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('tie', 'Tie', ['M', 'O'], 50)]),
      },
    })

    expect(wrapper.find('.panel-m .entry-pct').text()).toBe('50%')
    expect(wrapper.find('.panel-o .entry-pct').text()).toBe('50%')
  })

  test('non-finite percentage falls back to em-dash', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('a', 'A', ['M'], Number.NaN)]),
      },
    })

    expect(wrapper.find('.panel-m .entry-pct').text()).toBe('—')
  })

  test('aria-label on the anchor uses the copy-deck template with feature + pct', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('a', 'Feature A', ['M'], 70)]),
      },
    })

    const link = wrapper.find('.panel-m a')
    expect(link.attributes('aria-label')).toBe(
      en['analysis.panels.entryAriaLabel']
        .replace('{feature}', 'Feature A')
        .replace('{pct}', '70%'),
    )
  })

  test('tied features use the tied aria-label variant (FR35 disambiguation)', () => {
    // FR35 — when a feature is tied across multiple dominant categories, the
    // anchor aria-label must signal "in each tied category" so a SR user
    // does not parse "50% dominant" as "50% is dominant".
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([mkFeature('tied', 'Tied Feature', ['M', 'O'], 50)]),
      },
    })

    const expected = en['analysis.panels.entryAriaLabelTied']
      .replace('{feature}', 'Tied Feature')
      .replace('{pct}', '50%')

    // The same tied feature renders in BOTH panels — both anchors carry the
    // tied variant.
    expect(wrapper.find('.panel-m a').attributes('aria-label')).toBe(expected)
    expect(wrapper.find('.panel-o a').attributes('aria-label')).toBe(expected)
  })

  test('unsafe feature_key (CSS / URL-fragment hostile) is dropped + dev warning fires', () => {
    // Backend invariant emits UUIDs only, but the wire type is unconstrained
    // `string`. A `feature_key` containing `#`, `:` or a space would break
    // both the `href="#feature-…"` fragment and the `getElementById` lookup
    // path; safer to drop the entry and surface a dev warning than to
    // silently render a broken link.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('safe-key', 'Safe', ['M'], 70),
          mkFeature('unsafe key with space', 'Unsafe', ['M'], 60),
        ]),
      },
    })

    const entries = wrapper.findAll('.panel-m a')
    expect(entries).toHaveLength(1)
    expect(entries[0].attributes('href')).toBe('#feature-safe-key')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('unsafe feature_key')
    warn.mockRestore()
  })

  test('repartition pie mounts above the per-category section lists', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('a', 'A', ['M'], 70),
          mkFeature('b', 'B', ['O'], 60),
        ]),
      },
    })

    const pie = wrapper.find('[data-testid="kano-category-pie-stub"]')
    expect(pie.exists()).toBe(true)

    // DOM order: the pie precedes the first category section. compareDocument
    // Position returns FOLLOWING (4) when the section comes after the pie.
    const firstSection = wrapper.find('section.category-panel').element
    const relation = pie.element.compareDocumentPosition(firstSection)
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // The lists are untouched — both category panels still render.
    expect(wrapper.findAll('section.category-panel')).toHaveLength(2)
  })

  test('Kano category reference aside mounts alongside the pie + section lists', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: {
        analysis: analysis([
          mkFeature('a', 'A', ['M'], 70),
          mkFeature('b', 'B', ['O'], 60),
        ]),
      },
    })

    // The reference aside is present...
    const reference = wrapper.find('[data-testid="kano-category-reference-stub"]')
    expect(reference.exists()).toBe(true)

    // ...and the pie + jump-lists are untouched.
    expect(wrapper.find('[data-testid="kano-category-pie-stub"]').exists()).toBe(true)
    expect(wrapper.findAll('section.category-panel')).toHaveLength(2)
  })

  test('block heading sources copy-deck "analysis.panels.heading"', () => {
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })
    const heading = wrapper.find('.panels-heading')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe(en['analysis.panels.heading'])
    expect(heading.element.tagName).toBe('H2')
  })
})

describe('PerCategoryPanels — empty / guard branches', () => {
  test('total_submissions === 0: renders nothing + emits dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: { analysis: analysis([], 0) },
    })

    expect(wrapper.find('[data-testid="per-category-panels"]').exists()).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('total_submissions=0')
    warn.mockRestore()
  })

  test('populated total_submissions but zero dominant features: renders nothing', () => {
    // No features at all — features.length === 0 but total_submissions > 0
    // is a degenerate but possible state (a poll with no active features
    // but somehow recorded submissions). Panels should still be empty.
    const wrapper = mount(PerCategoryPanels, {
      global: { stubs: globalStubs },
      props: { analysis: analysis([], 10) },
    })

    expect(wrapper.find('[data-testid="per-category-panels"]').exists()).toBe(false)
    expect(wrapper.findAll('section.category-panel')).toHaveLength(0)
  })
})

describe('PerCategoryPanels — onAnchorClick behavior', () => {
  let target: HTMLDivElement
  let matchMediaMock: ReturnType<typeof vi.fn>
  let scrollIntoView: ReturnType<typeof vi.fn>
  let originalMatchMedia: typeof window.matchMedia | undefined

  function mkMediaQueryList(matches: boolean, query: string): MediaQueryList {
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }

  beforeEach(() => {
    // Plant a target row in the DOM so getElementById resolves.
    target = document.createElement('div')
    target.id = 'feature-a'
    target.tabIndex = -1
    document.body.appendChild(target)

    // jsdom doesn't implement scrollIntoView — stub it on the target.
    scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView as unknown as HTMLElement['scrollIntoView']

    // jsdom doesn't ship window.matchMedia — install a mock directly rather
    // than spying on the undefined original. Default: reduced-motion is OFF.
    originalMatchMedia = (window as { matchMedia?: typeof window.matchMedia }).matchMedia
    matchMediaMock = vi.fn((query: string) => mkMediaQueryList(false, query))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaMock,
    })

    vi.useFakeTimers()
  })

  afterEach(() => {
    if (target.parentNode === document.body) {
      document.body.removeChild(target)
    }
    if (originalMatchMedia === undefined) {
      delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
    } else {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
    }
    vi.useRealTimers()
  })

  test('clicking an anchor scroll-into-views, focuses, and pulses the target row', async () => {
    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth', block: 'center' }),
    )
    expect(document.activeElement).toBe(target)
    expect(target.classList.contains('row-pulse')).toBe(true)

    // After ~1 s the pulse class is removed.
    vi.advanceTimersByTime(1000)
    expect(target.classList.contains('row-pulse')).toBe(false)

    wrapper.unmount()
  })

  test('reduced-motion: scroll behavior is "auto" and pulse hold collapses to 0 ms', async () => {
    matchMediaMock.mockImplementation((query: string) =>
      mkMediaQueryList(true, query),
    )

    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto', block: 'center' }),
    )
    expect(target.classList.contains('row-pulse')).toBe(true)
    // 0 ms timeout fires on the next macrotask tick.
    vi.advanceTimersByTime(0)
    expect(target.classList.contains('row-pulse')).toBe(false)

    wrapper.unmount()
  })

  test('missing target row: handler is a no-op (no throw, no focus shift)', async () => {
    document.body.removeChild(target)

    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await expect(
      wrapper.find('.panel-m a').trigger('click'),
    ).resolves.not.toThrow()

    wrapper.unmount()
  })

  test('rapid re-click on the same anchor resets the pulse timer (second click wins)', async () => {
    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()
    expect(target.classList.contains('row-pulse')).toBe(true)

    // 500 ms in — pulse should still be active.
    vi.advanceTimersByTime(500)
    expect(target.classList.contains('row-pulse')).toBe(true)

    // Re-click — the first timer must be cancelled, and a fresh 1000-ms
    // window starts now. After another 700 ms (1200 ms past the original
    // click) the pulse should still hold because the second timer hasn't
    // expired yet.
    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()
    vi.advanceTimersByTime(700)
    expect(target.classList.contains('row-pulse')).toBe(true)

    // Advance to 1000 ms past the second click — pulse clears.
    vi.advanceTimersByTime(300)
    expect(target.classList.contains('row-pulse')).toBe(false)

    wrapper.unmount()
  })

  test('component unmount clears pending pulse timers', async () => {
    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()
    expect(target.classList.contains('row-pulse')).toBe(true)

    // Unmount before the 1000-ms timer fires. `onBeforeUnmount` must
    // cancel the pending timer so it cannot run later against a
    // detached target.
    wrapper.unmount()
    vi.advanceTimersByTime(1000)
    // The class stays on the (detached) target because the cleanup
    // callback was cancelled — that's the intended behavior. Negative
    // assertion: nothing throws when the timer would have fired.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
  })

  test('re-render between click and timer fire: pulse is removed from the *live* element', async () => {
    const wrapper = mount(PerCategoryPanels, {
      attachTo: document.body,
      global: { stubs: globalStubs },
      props: { analysis: analysis([mkFeature('a', 'A', ['M'], 70)]) },
    })

    await wrapper.find('.panel-m a').trigger('click')
    await nextTick()
    expect(target.classList.contains('row-pulse')).toBe(true)

    // Simulate a re-render of the analysis table: the original row is
    // detached and a fresh element with the same id replaces it. The
    // pulse class is carried over to the new live element (e.g., a
    // store-driven refetch that re-applied the in-flight state).
    document.body.removeChild(target)
    const replacement = document.createElement('div')
    replacement.id = 'feature-a'
    replacement.classList.add('row-pulse')
    document.body.appendChild(replacement)

    // Timer fires — it must resolve `feature-a` against the *current* DOM,
    // not the orphan, so the live element loses its `row-pulse` class.
    vi.advanceTimersByTime(1000)
    expect(replacement.classList.contains('row-pulse')).toBe(false)

    // Cleanup the replacement so afterEach doesn't trip on the swap.
    document.body.removeChild(replacement)
    document.body.appendChild(target)
    wrapper.unmount()
  })
})