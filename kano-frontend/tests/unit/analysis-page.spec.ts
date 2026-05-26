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

const AnalysisTableStub = defineComponent({
  props: ['analysis'],
  setup(props) {
    return () =>
      h('div', { 'data-stub': 'AnalysisTable', 'data-features': props.analysis?.features.length ?? 0 })
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

const globalStubs = {
  'v-skeleton-loader': SkeletonStub,
  'v-chip': VChipStub,
  'v-card': passthrough('v-card'),
  AnalysisTable: AnalysisTableStub,
  AnalysisEmptyState: AnalysisEmptyStateStub,
  AnalysisErrorSurface: AnalysisErrorSurfaceStub,
  EpochSelector: EpochSelectorStub,
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

function dist(overrides: Partial<Record<'M' | 'L' | 'E' | 'I' | 'C' | 'D', number>> = {}) {
  return { M: 0, L: 0, E: 0, I: 0, C: 0, D: 0, ...overrides }
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
        distribution: dist({ M: 7, L: 3 }),
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

  test('renders AnalysisTable on populated payload', async () => {
    apiSeed.analysis = populated(10)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-stub="AnalysisTable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analysis-empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-stub="AnalysisErrorSurface"]').exists()).toBe(false)
  })

  test('renders AnalysisEmptyState when total_submissions === 0', async () => {
    apiSeed.analysis = { ...populated(0), features: [] }
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-stub="AnalysisTable"]').exists()).toBe(false)
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

  test('header surfaces project name from projectsStore + version chip', async () => {
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
    expect(wrapper.find('[data-testid="analysis-project-name"]').text()).toBe('Q3 Prioritization')
    expect(wrapper.find('[data-testid="analysis-version-chip"]').text()).toContain(
      `${en['common.version']} 2`,
    )
  })

  test('confidence-beat uses singular copy on 1 response, plural otherwise', async () => {
    apiSeed.analysis = populated(1)
    const wrapper = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="analysis-confidence-beat"]').text()).toBe('1 response')

    apiSeed.analysis = populated(7)
    const wrapper2 = await mountAnalysisPage()
    await flushPromises()
    expect(wrapper2.find('[data-testid="analysis-confidence-beat"]').text()).toBe('7 responses')
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
