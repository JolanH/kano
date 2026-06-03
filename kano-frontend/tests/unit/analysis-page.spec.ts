// @vitest-environment jsdom
/**
 * Analysis page (Story 5-5) — composition gate. Asserts the orchestration
 * logic:
 *
 * - mounts the skeleton-loader while the fetch is in flight
 * - branches to AnalysisErrorSurface on `KanoApiError`
 * - branches to AnalysisEmptyState when `total_submissions === 0`
 * - branches to AnalysisTable otherwise
 * - header surfaces project name (from projectsStore), version chip, and
 *   confidence-beat copy ("N response(s)" — Recommendation A)
 * - retry handler refires the fetch
 *
 * Stubs the routed-child components and Vuetify chrome so the spec stays
 * focused on the branching logic; per-cell rendering is covered by the
 * AnalysisTable spec.
 */

import { setActivePinia, createPinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import {
  NotFoundError,
  ServerError,
  type PollAnalysis,
  type ProblemDetails,
  type ProjectDetail,
} from '@/api/types'
import en from '@/copy/en'
import { useProjectsStore } from '@/stores/projects'

// Mock useApi so the page never hits the network. `apiSeed.analysis` is
// the success payload (or null to throw), `apiSeed.error` is the typed
// error thrown when set.
const apiSeed: { analysis: PollAnalysis | null; error: Error | null; project: ProjectDetail | null } = {
  analysis: null,
  error: null,
  project: null,
}

const apiGetMock = vi.fn()
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: apiGetMock,
    post: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    patch: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    delete: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    put: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    resetCsrf: () => undefined,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'proj-1', pollId: 'poll-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock the PDF composable so the page test never loads html2canvas/jsPDF;
// `exportToPdfMock` lets us assert the (element, filename) the button passes,
// and `pdfState.exporting` (a shared ref, assigned when the mock module first
// loads) lets a test drive the in-flight loading state / "generating" label.
const exportToPdfMock = vi.hoisted(() => vi.fn())
const pdfState = vi.hoisted(() => ({ exporting: null as null | { value: boolean } }))
vi.mock('@/composables/useAnalysisPdf', async () => {
  const { ref } = await import('vue')
  pdfState.exporting = ref(false)
  return {
    useAnalysisPdf: () => ({ exporting: pdfState.exporting, exportToPdf: exportToPdfMock }),
  }
})

const SkeletonStub = defineComponent({
  setup(_, { attrs }) {
    return () => h('div', { 'data-testid': attrs['data-testid'] ?? 'skeleton' })
  },
})

const passthrough = (name: string) =>
  defineComponent({
    setup(_, { slots, attrs }) {
      return () =>
        h(
          'div',
          { 'data-stub': name, 'data-testid': attrs['data-testid'] ?? undefined },
          slots.default?.(),
        )
    },
  })

const VChipStub = defineComponent({
  setup(_, { slots, attrs }) {
    return () =>
      h('span', { 'data-testid': attrs['data-testid'] ?? undefined }, slots.default?.())
  },
})

// Story 5-7 — confidence-beat tie-meaning (i) icon + tooltip. The stub
// surfaces `text` / `location` / `open-delay` / `max-width` so the spec
// pins every Vuetify prop the production template binds; a regression
// that drops `max-width` (the long-text wrap budget) or shortens
// `open-delay` (the hover-sweep guard) would otherwise slip through.
// The v-icon stub surfaces `icon` / `aria-label` / `data-testid` so the
// spec can assert against them.
const VTooltipStub = defineComponent({
  props: ['text', 'location', 'openDelay', 'maxWidth'],
  setup(props, { slots }) {
    return () =>
      h(
        'span',
        {
          'data-stub': 'v-tooltip',
          'data-tooltip-text': props.text,
          'data-tooltip-location': props.location,
          'data-tooltip-open-delay': props.openDelay,
          'data-tooltip-max-width': props.maxWidth,
        },
        slots.activator?.({ props: {} }),
      )
  },
})

const VIconStub = defineComponent({
  props: ['icon', 'size', 'ariaLabel'],
  setup(props, { attrs }) {
    return () =>
      h('i', {
        'data-stub': 'v-icon',
        'data-icon': props.icon,
        'data-size': props.size,
        'aria-label': attrs['aria-label'] ?? props.ariaLabel,
        'data-testid': attrs['data-testid'] ?? undefined,
      })
  },
})

const AnalysisTableStub = defineComponent({
  props: ['analysis'],
  setup(props) {
    return () =>
      h('div', { 'data-stub': 'AnalysisTable', 'data-features': props.analysis?.features.length ?? 0 })
  },
})

const PerCategoryPanelsStub = defineComponent({
  props: ['analysis'],
  setup(props) {
    return () =>
      h('div', {
        'data-stub': 'PerCategoryPanels',
        'data-features': props.analysis?.features.length ?? 0,
      })
  },
})

const AnalysisEmptyStateStub = defineComponent({
  setup() {
    return () => h('div', { 'data-stub': 'AnalysisEmptyState', 'data-testid': 'analysis-empty-state' })
  },
})

const AnalysisErrorSurfaceStub = defineComponent({
  props: ['error', 'projectId'],
  emits: ['retry'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          'data-stub': 'AnalysisErrorSurface',
          'data-error-name': props.error?.name,
          'data-project-id': props.projectId ?? '',
          onClick: () => emit('retry'),
        },
        'retry',
      )
  },
})

const EpochSelectorStub = defineComponent({
  props: ['currentEpoch', 'selectedEpoch', 'projectId'],
  setup(props) {
    return () =>
      h('div', {
        'data-stub': 'EpochSelector',
        'data-current-epoch': props.currentEpoch,
        'data-selected-epoch': props.selectedEpoch,
      })
  },
})

// `vue-router` is fully mocked above (no real RouterLink), so stub it here:
// render an <a> that serializes the `to` target into `data-to` so specs can
// assert the navigation destination.
const RouterLinkStub = defineComponent({
  props: ['to'],
  setup(props, { slots }) {
    return () =>
      h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.())
  },
})

// `v-btn` stub: renders a real <button> so click/aria/testid pass through.
// `loading` is surfaced as `data-loading` and the click handler is forwarded
// from `attrs` (the production template binds `@click` without the stub
// declaring an emit).
const VBtnStub = defineComponent({
  props: ['loading'],
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'button',
        {
          'data-stub': 'v-btn',
          'data-testid': attrs['data-testid'] ?? undefined,
          'data-loading': props.loading ? 'true' : 'false',
          'aria-label': attrs['aria-label'],
          onClick: attrs.onClick as (() => void) | undefined,
        },
        slots.default?.(),
      )
  },
})

const VSnackbarStub = defineComponent({
  props: ['modelValue'],
  setup(props, { slots, attrs }) {
    return () =>
      props.modelValue
        ? h('div', { 'data-testid': attrs['data-testid'] ?? undefined }, slots.default?.())
        : null
  },
})

const globalStubs = {
  'v-skeleton-loader': SkeletonStub,
  'v-chip': VChipStub,
  RouterLink: RouterLinkStub,
  'v-card': passthrough('v-card'),
  AnalysisTable: AnalysisTableStub,
  AnalysisEmptyState: AnalysisEmptyStateStub,
  AnalysisErrorSurface: AnalysisErrorSurfaceStub,
  EpochSelector: EpochSelectorStub,
  PerCategoryPanels: PerCategoryPanelsStub,
  'v-tooltip': VTooltipStub,
  'v-icon': VIconStub,
  'v-btn': VBtnStub,
  'v-snackbar': VSnackbarStub,
}

function problem(overrides: Partial<ProblemDetails> = {}): ProblemDetails {
  return {
    type: 'about:blank',
    title: 'X',
    status: 500,
    detail: null,
    instance: '',
    request_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  apiSeed.analysis = null
  apiSeed.error = null
  apiSeed.project = null
  apiGetMock.mockReset()
  exportToPdfMock.mockReset()
  if (pdfState.exporting) pdfState.exporting.value = false
  apiGetMock.mockImplementation(async (path: string) => {
    if (path.endsWith('/analysis')) {
      if (apiSeed.error) throw apiSeed.error
      return { data: apiSeed.analysis, requestId: 'r', status: 200 }
    }
    if (path.startsWith('/projects/')) {
      if (apiSeed.project) return { data: apiSeed.project, requestId: 'r', status: 200 }
      throw new NotFoundError(problem({ status: 404 }), 404)
    }
    throw new Error(`unexpected path: ${path}`)
  })
})

function dist(overrides: Partial<Record<'M' | 'O' | 'A' | 'I' | 'R' | 'Q', number>> = {}) {
  return { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0, ...overrides }
}

function populated(total = 10): PollAnalysis {
  return {
    poll_id: 'poll-1',
    epoch: 2,
    total_submissions: total,
    features: [
      {
        feature_key: 'feat-a',
        name: 'Feature A',
        description: null,
        distribution: dist({ M: 7, O: 3 }),
        dominant_categories: ['M'],
        dominant_percentage: 70,
      },
    ],
  }
}

async function mountAnalysisPage(): Promise<VueWrapper> {
  // Import lazily so the mocked `vue-router` is picked up correctly.
  const Analysis = (await import('@/pages/app/Analysis.vue')).default
  return mount(Analysis, { global: { stubs: globalStubs } })
}

describe('Analysis page — branching', () => {
  test('shows skeleton-loader while the fetch is in flight', async () => {
    apiSeed.analysis = populated()
    const wrapper = await mountAnalysisPage()
    // Don't flush yet — assert the skeleton is up before the resolve tick.
    expect(wrapper.find('[data-testid="analysis-skeleton"]').exists()).toBe(true)
    await flushPromises()
  })

  test('renders AnalysisTable AND PerCategoryPanels on populated payload', async () => {
    apiSeed.analysis = populated(10)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-stub="AnalysisTable"]').exists()).toBe(true)
    // Story 5-6: PerCategoryPanels sits below the table in the non-empty
    // branch and is NOT rendered when the empty-state surface takes over.
    expect(wrapper.find('[data-stub="PerCategoryPanels"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analysis-empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-stub="AnalysisErrorSurface"]').exists()).toBe(false)
  })

  test('renders AnalysisEmptyState (no panels) when total_submissions === 0', async () => {
    apiSeed.analysis = { ...populated(0), features: [] }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-stub="AnalysisTable"]').exists()).toBe(false)
    // Story 5-6 AC #8: panels never render alongside the empty-state surface.
    expect(wrapper.find('[data-stub="PerCategoryPanels"]').exists()).toBe(false)
  })

  test('renders AnalysisErrorSurface on KanoApiError (NotFound)', async () => {
    apiSeed.error = new NotFoundError(problem({ status: 404, title: 'No poll' }), 404)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    const err = wrapper.find('[data-stub="AnalysisErrorSurface"]')
    expect(err.exists()).toBe(true)
    expect(err.attributes('data-error-name')).toBe('NotFoundError')
    expect(err.attributes('data-project-id')).toBe('proj-1')
  })

  test('renders AnalysisErrorSurface on ServerError', async () => {
    apiSeed.error = new ServerError(problem({ status: 500 }), 500)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-stub="AnalysisErrorSurface"]').attributes('data-error-name')).toBe(
      'ServerError',
    )
  })

  test('header surfaces project name (linked) + version display + epoch chip', async () => {
    apiSeed.analysis = populated(5)
    const store = useProjectsStore()
    store.current = {
      id: 'proj-1',
      name: 'Q3 Prioritization',
      version: '1.0',
      current_epoch: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      active_features: [],
    }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    // Only the project name is the link back to project-detail; the version
    // sits beside it inside the same heading as plain text.
    const link = wrapper.find('[data-testid="analysis-project-link"]')
    expect(link.text()).toBe('Q3 Prioritization')
    expect(JSON.parse(link.attributes('data-to') ?? '{}')).toEqual({
      name: 'project-detail',
      params: { id: 'proj-1' },
    })
    // Version renders as the bare DB string — no "Version" prefix label.
    const version = wrapper.find('[data-testid="analysis-project-version"]')
    expect(version.text()).toBe('1.0')
    expect(version.text()).not.toContain(en['pm.projectDetail.version.label'])
    // Epoch chip keeps the "Epoch N" terminology (common.version === "Epoch").
    expect(wrapper.find('[data-testid="analysis-version-chip"]').text()).toContain(
      `${en['common.version']} 2`,
    )
  })

  test('version display is hidden when the project version string is empty', async () => {
    apiSeed.analysis = populated(5)
    const store = useProjectsStore()
    store.current = {
      id: 'proj-1',
      name: 'Q3 Prioritization',
      version: '',
      current_epoch: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      active_features: [],
    }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-project-version"]').exists()).toBe(false)
  })

  test('confidence-beat uses singular copy on 1 response, plural otherwise', async () => {
    // Story 5-7 placed a tie-help icon next to the response-count text; the
    // count itself lives in the first child <span> of the beat, so assert
    // against that rather than the full beat (which would include the icon
    // stub's aria-label text in some test-utils versions).
    apiSeed.analysis = populated(1)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="analysis-confidence-beat"] > span').text(),
    ).toBe('1 response')

    apiSeed.analysis = populated(7)
    const wrapper2 = await mountAnalysisPage()
    await flushPromises()
    expect(
      wrapper2.find('[data-testid="analysis-confidence-beat"] > span').text(),
    ).toBe('7 responses')
  })

  test('tie-meaning help icon renders next to the confidence beat (Story 5-7)', async () => {
    apiSeed.analysis = populated(5)
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    const icon = wrapper.find('[data-testid="analysis-tie-help-icon"]')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('data-icon')).toBe('mdi-information-outline')
    expect(icon.attributes('aria-label')).toBe(en['analysis.help.tieIconAriaLabel'])

    // The wrapping v-tooltip stub carries the tooltip text from the copy
    // deck, proving the wiring (no inline literals). The `open-delay` and
    // `max-width` props are pinned too — both are load-bearing UX choices
    // (hover-sweep guard at 300 ms, long-text wrap budget at 300 px) that
    // a future refactor could silently drop without breaking other tests.
    const tooltip = wrapper.find('[data-stub="v-tooltip"]')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-tooltip-text')).toBe(en['analysis.help.tieMeaning'])
    expect(tooltip.attributes('data-tooltip-open-delay')).toBe('300')
    expect(tooltip.attributes('data-tooltip-max-width')).toBe('300')
  })

  test('tie-help icon is suppressed in the empty-state branch (no confidence beat to attach to)', async () => {
    apiSeed.analysis = { ...populated(0), features: [] }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-tie-help-icon"]').exists()).toBe(false)
  })

  test('retry handler refires the analysis fetch', async () => {
    apiSeed.error = new ServerError(problem({ status: 500 }), 500)
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    const callsBefore = apiGetMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/analysis'),
    ).length
    expect(callsBefore).toBe(1)

    apiSeed.error = null
    apiSeed.analysis = populated(3)
    await wrapper.find('[data-stub="AnalysisErrorSurface"]').trigger('click')
    await flushPromises()

    const callsAfter = apiGetMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/analysis'),
    ).length
    expect(callsAfter).toBe(2)
    expect(wrapper.find('[data-stub="AnalysisTable"]').exists()).toBe(true)
  })
})

describe('Analysis page — Export PDF', () => {
  test('renders the Export PDF button (with copy + aria) on a populated payload', async () => {
    apiSeed.analysis = populated(5)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    const btn = wrapper.find('[data-testid="analysis-export-pdf"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe(en['analysis.export.button'])
    expect(btn.attributes('aria-label')).toBe(en['analysis.export.ariaLabel'])
  })

  test('does not render the Export PDF button in the empty-state branch', async () => {
    apiSeed.analysis = { ...populated(0), features: [] }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-export-pdf"]').exists()).toBe(false)
  })

  test('does not render the Export PDF button in the error branch', async () => {
    apiSeed.error = new ServerError(problem({ status: 500 }), 500)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-export-pdf"]').exists()).toBe(false)
  })

  test('clicking Export PDF invokes the composable with the page element and an epoch-bearing filename', async () => {
    apiSeed.analysis = populated(5) // epoch: 2
    const store = useProjectsStore()
    store.current = {
      id: 'proj-1',
      name: 'Q3 Prioritization',
      version: '1.0',
      current_epoch: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      active_features: [],
    }
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    await wrapper.find('[data-testid="analysis-export-pdf"]').trigger('click')

    expect(exportToPdfMock).toHaveBeenCalledTimes(1)
    const [elArg, filenameArg] = exportToPdfMock.mock.calls[0]
    // First arg is the captured `.analysis-page` section element.
    expect((elArg as HTMLElement).getAttribute('data-testid')).toBe('analysis-page')
    // Filename slugifies the project name and carries the analysis epoch.
    expect(filenameArg).toBe('kano-analysis-q3-prioritization-epoch-2.pdf')
  })

  test('filename falls back to epoch-only when the project name is unknown', async () => {
    // No projectsStore.current → projectName resolves to '' (direct-URL entry).
    apiSeed.analysis = populated(5) // epoch: 2
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    await wrapper.find('[data-testid="analysis-export-pdf"]').trigger('click')

    expect(exportToPdfMock.mock.calls[0][1]).toBe('kano-analysis-epoch-2.pdf')
  })

  test('shows the generating label and loading state while an export is in flight', async () => {
    apiSeed.analysis = populated(5)
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    // Resting state: action label, not loading.
    let btn = wrapper.find('[data-testid="analysis-export-pdf"]')
    expect(btn.text()).toBe(en['analysis.export.button'])
    expect(btn.attributes('data-loading')).toBe('false')

    // Flip the composable's `exporting` ref → button reflects the in-flight UI.
    pdfState.exporting!.value = true
    await wrapper.vm.$nextTick()
    btn = wrapper.find('[data-testid="analysis-export-pdf"]')
    expect(btn.text()).toBe(en['analysis.export.generating'])
    expect(btn.attributes('data-loading')).toBe('true')
  })

  test('surfaces the error snackbar when the export rejects', async () => {
    apiSeed.analysis = populated(5)
    exportToPdfMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountAnalysisPage()
    await flushPromises()

    await wrapper.find('[data-testid="analysis-export-pdf"]').trigger('click')
    await flushPromises()

    const snackbar = wrapper.find('[data-testid="analysis-export-error"]')
    expect(snackbar.exists()).toBe(true)
    expect(snackbar.text()).toBe(en['analysis.export.error'])
  })
})
