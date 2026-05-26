// @vitest-environment jsdom
/**
 * Polls page — empty state CTA, populated table rendering, row-click routing
 * (live → poll-share, expired → poll-analysis), expired-row muted styling.
 *
 * Same stubbing strategy as the other Vuetify-touching specs: stub the
 * `v-data-table` so we control what gets rendered + which row-prop callbacks
 * fire; the production code's correctness on Vuetify internals is the e2e
 * spec's concern.
 */

import { setActivePinia, createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import Polls from '@/pages/app/Polls.vue'
import type { PollSummaryWithProject } from '@/api/types'

// Stub the API singleton so `pollsStore.loadAllPolls()` (called onMount)
// doesn't try to fetch through the Node fetch shim. The stub returns
// whatever `apiSeed.value` is set to before mount.
const apiSeed: { value: PollSummaryWithProject[] } = { value: [] }
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: () => Promise.resolve({ data: apiSeed.value, requestId: 'r', status: 200 }),
    post: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    patch: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    delete: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    put: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    resetCsrf: () => undefined,
  }),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  RouterLink: defineComponent({
    props: ['to'],
    setup(_, { slots, attrs }) {
      return () =>
        h(
          'a',
          {
            href: '#',
            'data-testid': attrs['data-testid'] ?? undefined,
            onClick: (e: Event) => {
              e.preventDefault()
              if ((attrs.onClick as undefined | (() => void))) {
                ;(attrs.onClick as () => void)()
              }
            },
          },
          slots.default?.(),
        )
    },
  }),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () => h('div', { 'data-stub': name, ...attrs }, slots.default?.())
    },
  })

const VBtnStub = defineComponent({
  props: ['text', 'to', 'color', 'size', 'prependIcon'],
  emits: ['click'],
  setup(props, { emit, attrs }) {
    return () =>
      h(
        'a',
        {
          'data-testid': attrs['data-testid'] ?? undefined,
          'data-to': props.to ? JSON.stringify(props.to) : undefined,
          onClick: (e: MouseEvent) => emit('click', e),
        },
        props.text,
      )
  },
})

const VDataTableStub = defineComponent({
  props: ['items', 'headers', 'rowProps', 'sortBy', 'loading'],
  emits: ['click:row'],
  setup(props, { emit, attrs, slots }) {
    return () =>
      h(
        'table',
        { 'data-testid': attrs['data-testid'] ?? undefined },
        (props.items as PollSummaryWithProject[]).map((item) => {
          const rowProps = typeof props.rowProps === 'function' ? props.rowProps({ item }) : {}
          const actionsSlot = slots['item.actions']
          return h(
            'tr',
            {
              ...rowProps,
              'data-testid': `polls-row-${item.id}`,
              onClick: (e: MouseEvent) => emit('click:row', e, { item }),
            },
            [
              h('td', item.project_name),
              h('td', `v${item.epoch}`),
              h('td', String(item.response_count)),
              h(
                'td',
                item.is_expired
                  ? h('span', { 'data-testid': 'polls-row-expired' }, 'Expired')
                  : 'in 7 days',
              ),
              h('td', item.created_at),
              h('td', actionsSlot ? actionsSlot({ item }) : null),
            ],
          )
        }),
      )
  },
})

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-card-title': passthrough('v-card-title'),
  'v-card-text': passthrough('v-card-text'),
  'v-card-actions': passthrough('v-card-actions'),
  'v-chip': passthrough('v-chip'),
  'v-icon': passthrough('v-icon'),
  'v-btn': VBtnStub,
  'v-data-table': VDataTableStub,
}

function basePoll(overrides: Partial<PollSummaryWithProject> = {}): PollSummaryWithProject {
  return {
    id: 'poll-1',
    project_id: 'proj-1',
    epoch: 2,
    created_at: '2026-05-19T10:00:00Z',
    expires_at: '2026-05-26T10:00:00Z',
    response_count: 5,
    is_expired: false,
    project_name: 'Solo',
    project_version: '1.0',
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockReset()
  apiSeed.value = []
})

function mountPolls() {
  return mount(Polls, { global: { stubs: globalStubs } })
}

describe('Polls page', () => {
  test('empty state shows CTA routing to projects', async () => {
    apiSeed.value = []
    const wrapper = mountPolls()
    await flushPromises()
    const cta = wrapper.find('[data-testid="polls-empty-cta"]')
    expect(cta.exists()).toBe(true)
    expect(cta.attributes('data-to')).toContain('projects')
  })

  test('populated state renders one row per poll with muted expired class', async () => {
    apiSeed.value = [
      basePoll({ id: 'p-live', is_expired: false }),
      basePoll({ id: 'p-dead', is_expired: true }),
    ]
    const wrapper = mountPolls()
    await flushPromises()
    expect(wrapper.find('[data-testid="polls-table"]').exists()).toBe(true)
    const liveRow = wrapper.find('[data-testid="polls-row-p-live"]')
    const deadRow = wrapper.find('[data-testid="polls-row-p-dead"]')
    expect(liveRow.exists()).toBe(true)
    expect(deadRow.exists()).toBe(true)
    expect(deadRow.classes()).toContain('polls-row--expired')
    expect(deadRow.text()).toContain('Expired')
    expect(liveRow.classes()).not.toContain('polls-row--expired')
  })

  test('row click routes to poll-share for live poll', async () => {
    apiSeed.value = [basePoll({ id: 'live-1', project_id: 'proj-x', is_expired: false })]
    const wrapper = mountPolls()
    await flushPromises()
    await wrapper.find('[data-testid="polls-row-live-1"]').trigger('click')
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-share',
      params: { id: 'proj-x', pollId: 'live-1' },
    })
  })

  test('row click routes to poll-analysis for expired poll', async () => {
    apiSeed.value = [basePoll({ id: 'dead-1', project_id: 'proj-y', is_expired: true })]
    const wrapper = mountPolls()
    await flushPromises()
    await wrapper.find('[data-testid="polls-row-dead-1"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-analysis',
      params: { id: 'proj-y', pollId: 'dead-1' },
    })
  })

  test('view-analysis button renders only when response_count >= 1', async () => {
    apiSeed.value = [
      basePoll({ id: 'p-empty', response_count: 0 }),
      basePoll({ id: 'p-one', response_count: 1 }),
      basePoll({ id: 'p-many', response_count: 42 }),
    ]
    const wrapper = mountPolls()
    await flushPromises()
    expect(
      wrapper.find('[data-testid="polls-row-p-empty"] [data-testid="polls-row-view-analysis"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="polls-row-p-one"] [data-testid="polls-row-view-analysis"]').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-testid="polls-row-p-many"] [data-testid="polls-row-view-analysis"]').exists(),
    ).toBe(true)
  })

  test('view-analysis button routes to poll-analysis without firing row click', async () => {
    apiSeed.value = [
      basePoll({ id: 'live-resp', project_id: 'proj-z', is_expired: false, response_count: 3 }),
    ]
    const wrapper = mountPolls()
    await flushPromises()
    await wrapper
      .find('[data-testid="polls-row-live-resp"] [data-testid="polls-row-view-analysis"]')
      .trigger('click')
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-analysis',
      params: { id: 'proj-z', pollId: 'live-resp' },
    })
  })
})
