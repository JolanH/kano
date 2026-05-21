// @vitest-environment jsdom
/**
 * Respondent landing (Story 3-8) — branch on the public-read API response.
 *
 * - 200 → LivePollStub
 * - 410 → ExpiredPoll
 * - 404 → PollNotFound
 *
 * Vuetify primitives stubbed (no Vuetify install / CSS) so the spec runs
 * fast under jsdom.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import Landing from '@/pages/poll/Landing.vue'
import {
  KanoApiError,
  NotFoundError,
  ServerError,
  type PollPublic,
  type ProblemDetails,
} from '@/api/types'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uuid: 'test-poll-id' } }),
}))

const getMock = vi.fn()
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: (path: string) => getMock(path),
    post: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    patch: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    delete: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    put: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    resetCsrf: () => undefined,
  }),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () => h('div', { 'data-stub': name, ...attrs }, slots.default?.())
    },
  })

const VProgressStub = defineComponent({
  setup(_, { attrs }) {
    return () =>
      h('div', { role: 'progressbar', 'aria-label': attrs['aria-label'] as string })
  },
})

const VBtnStub = defineComponent({
  props: ['text', 'href', 'size', 'variant', 'color'],
  setup(props, { attrs }) {
    return () =>
      h(
        'a',
        {
          href: props.href,
          'data-testid': attrs['data-testid'] ?? undefined,
        },
        props.text,
      )
  },
})

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-card-text': passthrough('v-card-text'),
  'v-icon': passthrough('v-icon'),
  'v-progress-circular': VProgressStub,
  'v-btn': VBtnStub,
}

const samplePollPublic: PollPublic = {
  id: 'test-poll-id',
  expires_at: '2026-05-27T12:00:00Z',
  features: [
    { feature_key: 'fk-1', name: 'Auto-save', description: null },
  ],
}

function makeProblem(status: number, type: string): ProblemDetails {
  return {
    type: `https://kano.example.com/problems/${type}`,
    title: type,
    status,
    detail: null,
    instance: `/api/v1/polls/test-poll-id`,
    request_id: 'rid',
  }
}

beforeEach(() => {
  getMock.mockReset()
})

describe('Respondent Landing', () => {
  test('shows loading state before the fetch resolves', async () => {
    // Never-resolving promise keeps the loading state in place.
    let resolveFn: ((v: { data: PollPublic; requestId: string; status: number }) => void) | null =
      null
    getMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve
        }),
    )
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    // Before flush: progressbar present.
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
    // Resolve to unblock the unmount.
    resolveFn?.({ data: samplePollPublic, requestId: 'r', status: 200 })
    await flushPromises()
  })

  test('200 → renders LivePollStub with data-stub marker', async () => {
    getMock.mockImplementation(() =>
      Promise.resolve({ data: samplePollPublic, requestId: 'r', status: 200 }),
    )
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="live-poll-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-stub="true"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('This poll is ready')
  })

  test('410 → renders ExpiredPoll with mailto contact', async () => {
    // 410 maps to ConflictError class but we look at .status; instantiate
    // a generic KanoApiError with status=410.
    getMock.mockImplementation(() =>
      Promise.reject(new KanoApiError(makeProblem(410, 'poll-expired'), 410)),
    )
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="expired-poll"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Get in touch with our product team')
    const contact = wrapper.find('[data-testid="expired-poll-contact"]')
    expect(contact.exists()).toBe(true)
    expect(contact.attributes('href')?.startsWith('mailto:')).toBe(true)
  })

  test('404 → renders PollNotFound', async () => {
    getMock.mockImplementation(() =>
      Promise.reject(new NotFoundError(makeProblem(404, 'entity-not-found'), 404)),
    )
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="poll-not-found"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("We couldn't find that poll")
  })

  test('5xx surfaces PollLoadError with retry, not PollNotFound', async () => {
    // Regression for the adversarial review: previously, any non-410/404
    // error was rendered as "We couldn't find that poll" — which masks
    // deploy outages as URL typos. Now 5xx + network errors get their own
    // surface with a Try-again button.
    getMock.mockImplementation(() =>
      Promise.reject(new ServerError(makeProblem(500, 'internal-server-error'), 500)),
    )
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="poll-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="poll-not-found"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="poll-load-error-retry"]').exists()).toBe(true)
  })

  test('network-style rejection (non-KanoApiError) also surfaces PollLoadError', async () => {
    getMock.mockImplementation(() => Promise.reject(new TypeError('network down')))
    const wrapper = mount(Landing, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="poll-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="poll-not-found"]').exists()).toBe(false)
  })
})
