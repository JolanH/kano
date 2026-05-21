// @vitest-environment jsdom
/**
 * Question.vue (Story 4-6) — index → (feature, question) routing,
 * auto-advance, back-nav, halfway acknowledgement, out-of-range
 * redirect, and draft preservation across index transitions.
 *
 * Mounts the real component with Pinia + mocked router + stubbed
 * Vuetify primitives. Pre-seeds the `pollPublicStore` so the component
 * skips the network call.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import Question from '@/pages/poll/Question.vue'
import type { PollPublic } from '@/api/types'
import { usePollPublicStore } from '@/stores/pollPublic'
import { useResponseDraftStore } from '@/stores/responseDraft'

const pushMock = vi.fn()
const replaceMock = vi.fn()

// `route.params` and `route.query` are reactive in production; refs let
// the component's computed properties update when we change `index` or
// `showError`.
const routeParams = ref<{ uuid: string; index: string }>({
  uuid: 'poll-uuid',
  index: '0',
})
const routeQuery = ref<Record<string, string | undefined>>({})

vi.mock('vue-router', () => ({
  useRoute: () => ({
    name: 'poll-question',
    get params() {
      return routeParams.value
    },
    get query() {
      return routeQuery.value
    },
  }),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

// onMounted in Question.vue calls pollPublicStore.loadPoll() when the
// fetchState isn't 'loaded'. The tests pre-seed the store with the state
// they care about; mock useApi so the reload call doesn't actually try
// to hit the network (which would flip 'expired' → 'error' before the
// assertion runs).
const getMock = vi.fn().mockResolvedValue({
  data: {
    id: 'poll-uuid',
    expires_at: '2026-12-31T00:00:00Z',
    features: [],
  },
  requestId: 'r',
  status: 200,
})
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({ get: (path: string) => getMock(path) }),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () =>
        h('div', { 'data-stub-component': name, ...attrs }, slots.default?.())
    },
  })

const VProgressCircularStub = defineComponent({
  setup(_, { attrs }) {
    return () =>
      h('div', { role: 'progressbar', 'aria-label': attrs['aria-label'] as string })
  },
})

const VProgressLinearStub = defineComponent({
  props: ['modelValue'],
  setup(props, { attrs }) {
    return () =>
      h('div', {
        role: 'progressbar',
        'aria-valuenow': attrs['aria-valuenow'] as number,
        'aria-valuemin': attrs['aria-valuemin'] as number,
        'aria-valuemax': attrs['aria-valuemax'] as number,
        'aria-label': attrs['aria-label'] as string,
        'data-fill': props.modelValue,
      })
  },
})

const KanoLikertStub = defineComponent({
  name: 'KanoLikert',
  props: {
    question: { type: String, required: true },
    feature: { type: Object, required: true },
    modelValue: { type: Number, default: null },
    showError: { type: Boolean, default: false },
    confirmationMs: { type: Number, default: 150 },
  },
  emits: ['update:modelValue', 'auto-advance'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'kano-likert',
          'data-question': props.question,
          'data-feature-key':
            (props.feature as { feature_key?: string } | null)?.feature_key ??
            '',
          'data-model-value':
            props.modelValue === null ? 'null' : String(props.modelValue),
          'data-show-error': props.showError ? 'true' : 'false',
        },
        [
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'simulate-select',
              onClick: () => {
                emit('update:modelValue', 3)
                emit('auto-advance', 3)
              },
            },
            'pick 3',
          ),
        ],
      )
  },
})

const VRadioGroupStub = passthrough('v-radio-group')
const VRadioStub = passthrough('v-radio')

const ExpiredPollStub = defineComponent({
  name: 'ExpiredPoll',
  setup() {
    return () => h('div', { 'data-testid': 'expired-poll' }, 'expired')
  },
})

const PollNotFoundStub = defineComponent({
  name: 'PollNotFound',
  setup() {
    return () => h('div', { 'data-testid': 'poll-not-found' }, 'not-found')
  },
})

const PollLoadErrorStub = defineComponent({
  name: 'PollLoadError',
  emits: ['retry'],
  setup(_, { emit }) {
    return () =>
      h('div', { 'data-testid': 'poll-load-error' }, [
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'poll-load-error-retry',
            onClick: () => emit('retry'),
          },
          'retry',
        ),
      ])
  },
})

const globalStubs = {
  KanoLikert: KanoLikertStub,
  ExpiredPoll: ExpiredPollStub,
  PollNotFound: PollNotFoundStub,
  PollLoadError: PollLoadErrorStub,
  'v-progress-circular': VProgressCircularStub,
  'v-progress-linear': VProgressLinearStub,
  'v-radio-group': VRadioGroupStub,
  'v-radio': VRadioStub,
}

const POLL: PollPublic = {
  id: 'poll-uuid',
  expires_at: '2026-12-31T00:00:00Z',
  features: [
    { feature_key: 'fk-a', name: 'Feature A', description: 'A desc' },
    { feature_key: 'fk-b', name: 'Feature B', description: null },
    { feature_key: 'fk-c', name: 'Feature C', description: null },
  ],
}

function seedLoadedPoll(): void {
  const store = usePollPublicStore()
  store.$patch({ fetchState: 'loaded', poll: POLL, error: null })
}

function setIndex(i: number): void {
  routeParams.value = { uuid: 'poll-uuid', index: String(i) }
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockReset()
  replaceMock.mockReset()
  routeParams.value = { uuid: 'poll-uuid', index: '0' }
  routeQuery.value = {}
})

describe('Question route — index dispatch', () => {
  test('index=0 → functional question for feature[0]', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const likert = wrapper.find('[data-testid="kano-likert"]')
    expect(likert.attributes('data-question')).toBe('functional')
    expect(likert.attributes('data-feature-key')).toBe('fk-a')
  })

  test('index=1 → dysfunctional question for feature[0]', async () => {
    seedLoadedPoll()
    setIndex(1)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const likert = wrapper.find('[data-testid="kano-likert"]')
    expect(likert.attributes('data-question')).toBe('dysfunctional')
    expect(likert.attributes('data-feature-key')).toBe('fk-a')
  })

  test('index=2 → functional question for feature[1]', async () => {
    seedLoadedPoll()
    setIndex(2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const likert = wrapper.find('[data-testid="kano-likert"]')
    expect(likert.attributes('data-question')).toBe('functional')
    expect(likert.attributes('data-feature-key')).toBe('fk-b')
  })
})

describe('Question route — progress + halfway', () => {
  test('progress label is honest "Question N of 2N"', async () => {
    seedLoadedPoll()
    setIndex(2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="progress-label"]').text()).toBe(
      'Question 3 of 6',
    )
  })

  test('halfway acknowledgement appears at index === N only', async () => {
    seedLoadedPoll()
    setIndex(3) // N = 3, so halfway is index 3
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const halfway = wrapper.find('[data-testid="halfway-microcopy"]')
    expect(halfway.exists()).toBe(true)
    expect(halfway.attributes('role')).toBe('status')
    expect(halfway.text()).toContain('Halfway there')
  })

  test('halfway is absent at other indices', async () => {
    seedLoadedPoll()
    setIndex(2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="halfway-microcopy"]').exists()).toBe(false)
  })
})

describe('Question route — navigation', () => {
  test('auto-advance routes to the next index', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
    })
  })

  test('auto-advance from the LAST question routes to submit-confirm', async () => {
    seedLoadedPoll()
    setIndex(5) // last index for N=3 (2N - 1)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-submit-confirm',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('Esc at index=0 routes to landing', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="question-screen"]').trigger('keydown', {
      key: 'Escape',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-landing',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('Esc at index=3 routes to index=2', async () => {
    seedLoadedPoll()
    setIndex(3)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="question-screen"]').trigger('keydown', {
      key: 'Escape',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 2 },
    })
  })

  test('Backspace also navigates back', async () => {
    seedLoadedPoll()
    setIndex(3)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="question-screen"]').trigger('keydown', {
      key: 'Backspace',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 2 },
    })
  })
})

describe('Question route — out-of-range', () => {
  test('index=99 redirects to landing when draft is empty', async () => {
    seedLoadedPoll()
    setIndex(99)
    mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-landing',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('index=99 redirects to submit-confirm when draft is complete', async () => {
    seedLoadedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b', 'fk-c'])
    for (const key of ['fk-a', 'fk-b', 'fk-c']) {
      draft.setAnswer(key, 'functional', 3)
      draft.setAnswer(key, 'dysfunctional', 5)
    }
    setIndex(99)
    mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-submit-confirm',
      params: { uuid: 'poll-uuid' },
    })
  })
})

describe('Question route — draft state', () => {
  test('previously selected answer is passed to KanoLikert on revisit', async () => {
    seedLoadedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b', 'fk-c'])
    draft.setAnswer('fk-a', 'functional', 4)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="kano-likert"]').attributes('data-model-value'),
    ).toBe('4')
  })

  test('selecting an answer updates the draft store', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select"]').trigger('click')
    const draft = useResponseDraftStore()
    expect(draft.getAnswer('fk-a', 'functional')).toBe(3)
  })
})

describe('Question route — showError query handling (Story 4-7)', () => {
  test('?showError=1 → KanoLikert receives show-error prop', async () => {
    seedLoadedPoll()
    routeQuery.value = { showError: '1' }
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    // The stub doesn't render the show-error attribute by default; assert
    // via the underlying KanoLikert vnode's props.
    const likert = wrapper.findComponent({ name: 'KanoLikert' })
    expect(likert.props('showError')).toBe(true)
  })

  test('absence of showError → KanoLikert receives show-error=false', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const likert = wrapper.findComponent({ name: 'KanoLikert' })
    expect(likert.props('showError')).toBe(false)
  })

  test('first selection clears the showError query', async () => {
    seedLoadedPoll()
    routeQuery.value = { showError: '1' }
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select"]').trigger('click')

    // First replace strips ?showError; subsequent push handles auto-advance.
    const replaceCalls = replaceMock.mock.calls
    expect(replaceCalls.length).toBeGreaterThanOrEqual(1)
    const lastReplace = replaceCalls[replaceCalls.length - 1][0]
    expect(lastReplace.query).toEqual({})
    expect(lastReplace.name).toBe('poll-question')
  })
})

describe('Question route — error surfaces (reuse, do not reinvent)', () => {
  test('expired → ExpiredPoll component mounted', async () => {
    const store = usePollPublicStore()
    store.$patch({ fetchState: 'expired', poll: null })
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ExpiredPoll' }).exists()).toBe(true)
  })

  test('not-found → PollNotFound component mounted', async () => {
    const store = usePollPublicStore()
    store.$patch({ fetchState: 'not-found', poll: null })
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PollNotFound' }).exists()).toBe(true)
  })

  test('error → PollLoadError component mounted', async () => {
    const store = usePollPublicStore()
    store.$patch({ fetchState: 'error', poll: null })
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PollLoadError' }).exists()).toBe(true)
  })
})
