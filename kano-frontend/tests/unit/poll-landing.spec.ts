// @vitest-environment jsdom
/**
 * Respondent landing (Story 4-4 replacement of the Story 3-8 stub).
 *
 * Branch coverage on `fetchState` from `usePollPublicStore`:
 * - loading → spinner
 * - loaded → LiveLanding with Tixeo trust line + Begin
 * - expired → ExpiredPoll (reused from Story 3-8)
 * - not-found → PollNotFound (reused from Story 3-8)
 * - error → PollLoadError with retry (reused from Story 3-8)
 *
 * Vuetify primitives stubbed (no Vuetify install / CSS) so the spec runs
 * fast under jsdom.
 */

import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import Landing from '@/pages/poll/Landing.vue'
import type { PollPublic } from '@/api/types'
import { usePollPublicStore } from '@/stores/pollPublic'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uuid: 'test-poll-id' } }),
  useRouter: () => ({ push: pushMock }),
}))

const samplePollPublic: PollPublic = {
  id: 'test-poll-id',
  expires_at: '2026-05-27T12:00:00Z',
  features: [{ feature_key: 'fk-1', name: 'Auto-save', description: null }],
}

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () => h('div', { 'data-stub-component': name, ...attrs }, slots.default?.())
    },
  })

const VProgressStub = defineComponent({
  setup(_, { attrs }) {
    return () =>
      h('div', { role: 'progressbar', 'aria-label': attrs['aria-label'] as string })
  },
})

const VBtnStub = defineComponent({
  props: ['text', 'size', 'color'],
  setup(props, { attrs }) {
    return () =>
      h(
        'button',
        {
          'data-testid': attrs['data-testid'] ?? undefined,
          'aria-label': attrs['aria-label'] ?? undefined,
          type: 'button',
          onClick: attrs.onClick as ((e: MouseEvent) => void) | undefined,
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

function mountLanding() {
  return mount(Landing, { global: { stubs: globalStubs } })
}

function seedStore(
  patch: Partial<ReturnType<typeof usePollPublicStore>['$state']> = {},
) {
  const store = usePollPublicStore()
  store.$patch({ fetchState: 'idle', poll: null, error: null, ...patch })
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockReset()
})

describe('Respondent Landing (Story 4-4)', () => {
  test('absence of data-stub marker (regression guard for the Story 3-8 swap)', async () => {
    seedStore({ fetchState: 'loaded', poll: samplePollPublic })
    const wrapper = mountLanding()
    // Story 3-8's structural breadcrumb must not survive the swap.
    expect(wrapper.html()).not.toContain('data-stub="true"')
  })

  test('loading → progress spinner', async () => {
    seedStore({ fetchState: 'loading' })
    const wrapper = mountLanding()
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true)
  })

  test('loaded → LiveLanding renders trust line + Begin button', async () => {
    seedStore({ fetchState: 'loaded', poll: samplePollPublic })
    const wrapper = mountLanding()
    expect(wrapper.find('[data-testid="live-landing"]').exists()).toBe(true)
    const trust = wrapper.find('[data-testid="live-landing-trust-line"]')
    expect(trust.exists()).toBe(true)
    expect(trust.text()).toContain('Tixeo')
    expect(trust.text()).toContain('shapes our roadmap')
    const begin = wrapper.find('[data-testid="live-landing-begin"]')
    expect(begin.exists()).toBe(true)
    expect(begin.attributes('aria-label')).toBe('Begin the poll')
  })

  test('loaded → methodology explainer primes the Kano two-question pair', async () => {
    seedStore({ fetchState: 'loaded', poll: samplePollPublic })
    const wrapper = mountLanding()
    const methodology = wrapper.find('[data-testid="live-landing-methodology"]')
    expect(methodology.exists()).toBe(true)
    expect(methodology.text()).toContain('two quick questions')
    const functional = wrapper.find('[data-testid="live-landing-methodology-functional"]')
    const dysfunctional = wrapper.find(
      '[data-testid="live-landing-methodology-dysfunctional"]',
    )
    expect(functional.text()).toBe("How you'd feel if it's available")
    expect(dysfunctional.text()).toBe("How you'd feel if it's not")
  })

  test('Begin click routes to /poll/:uuid/q/0', async () => {
    seedStore({ fetchState: 'loaded', poll: samplePollPublic })
    const wrapper = mountLanding()
    await wrapper.find('[data-testid="live-landing-begin"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'test-poll-id', index: 0 },
    })
  })

  test('expired → ExpiredPoll renders', async () => {
    seedStore({ fetchState: 'expired' })
    const wrapper = mountLanding()
    expect(wrapper.find('[data-testid="expired-poll"]').exists()).toBe(true)
  })

  test('not-found → PollNotFound renders', async () => {
    seedStore({ fetchState: 'not-found' })
    const wrapper = mountLanding()
    expect(wrapper.find('[data-testid="poll-not-found"]').exists()).toBe(true)
  })

  test('error → PollLoadError renders with retry', async () => {
    seedStore({ fetchState: 'error' })
    const wrapper = mountLanding()
    expect(wrapper.find('[data-testid="poll-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="poll-load-error-retry"]').exists()).toBe(true)
  })

  test('retry on error → invokes loadPoll again', async () => {
    const store = seedStore({ fetchState: 'error' })
    const loadSpy = vi.spyOn(store, 'loadPoll').mockResolvedValue()
    const wrapper = mountLanding()
    await wrapper.find('[data-testid="poll-load-error-retry"]').trigger('click')
    expect(loadSpy).toHaveBeenCalledWith('test-poll-id')
  })
})
