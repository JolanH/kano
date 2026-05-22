// @vitest-environment jsdom
/**
 * Question.vue (Story 4-6 per-feature amendment 2026-05-22) — index is
 * a feature-index from `0..N-1`; each screen renders BOTH Likerts for
 * one feature; auto-advance fires only when both draft entries are
 * non-null. Halfway microcopy has been removed.
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
  setup(props, { emit, attrs }) {
    const pickValue = 3
    return () =>
      h(
        'div',
        {
          'data-testid': attrs['data-testid'] ?? 'kano-likert',
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
              'data-testid': `simulate-select-${props.question}`,
              // KanoLikert's auto-advance event is still emitted in
              // production after the 150 ms confirmation timer, but the
              // parent (Question.vue) no longer reacts to it for
              // navigation — the explicit Next button drives advance.
              // The stub fires both events so this spec can still verify
              // that listeners are absent / ignored.
              onClick: () => {
                emit('update:modelValue', pickValue)
                emit('auto-advance', pickValue)
              },
            },
            'pick 3',
          ),
        ],
      )
  },
})

const VBtnStub = defineComponent({
  name: 'VBtn',
  props: ['text', 'disabled', 'size', 'color'],
  setup(props, { attrs }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'data-testid': attrs['data-testid'] as string,
          disabled: props.disabled || undefined,
          'data-disabled': props.disabled ? 'true' : 'false',
          onClick: attrs.onClick as ((e: MouseEvent) => void) | undefined,
        },
        props.text,
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
  'v-btn': VBtnStub,
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

describe('Question route — per-feature dispatch', () => {
  test('index=0 → both Likerts render for feature[0]', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const fn = wrapper.find('[data-testid="kano-likert-functional"]')
    const dq = wrapper.find('[data-testid="kano-likert-dysfunctional"]')
    expect(fn.exists()).toBe(true)
    expect(dq.exists()).toBe(true)
    expect(fn.attributes('data-feature-key')).toBe('fk-a')
    expect(dq.attributes('data-feature-key')).toBe('fk-a')
    expect(fn.attributes('data-question')).toBe('functional')
    expect(dq.attributes('data-question')).toBe('dysfunctional')
    expect(wrapper.find('[data-testid="feature-name"]').text()).toBe('Feature A')
  })

  test('index=1 → both Likerts render for feature[1]', async () => {
    seedLoadedPoll()
    setIndex(1)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper.find('[data-testid="kano-likert-functional"]').attributes('data-feature-key'),
    ).toBe('fk-b')
    expect(wrapper.find('[data-testid="feature-name"]').text()).toBe('Feature B')
  })
})

describe('Question route — progress', () => {
  test('progress label denominates features, not questions', async () => {
    seedLoadedPoll()
    setIndex(1)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="progress-label"]').text()).toBe(
      'Feature 2 of 3',
    )
  })

  test('halfway microcopy is gone (removed in per-feature amendment)', async () => {
    seedLoadedPoll()
    setIndex(1)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="halfway-microcopy"]').exists()).toBe(false)
  })
})

describe('Question route — explicit Next button gates advance', () => {
  test('button is disabled when no answers are picked', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    const btn = wrapper.find('[data-testid="feature-next"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeDefined()
  })

  test('button is still disabled after only functional is answered', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="feature-next"]').attributes('disabled'),
    ).toBeDefined()
  })

  test('button is still disabled after only dysfunctional is answered', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-dysfunctional"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="feature-next"]').attributes('disabled'),
    ).toBeDefined()
  })

  test('button enables once BOTH answers are picked', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    await wrapper.find('[data-testid="simulate-select-dysfunctional"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="feature-next"]').attributes('disabled'),
    ).toBeUndefined()
  })

  test('KanoLikert auto-advance event does NOT navigate (button-only advance)', async () => {
    // KanoLikert still emits auto-advance after its 150 ms confirmation
    // timer (in-component contract from Story 4-5), but Question.vue no
    // longer listens. Stub fires both events on click; navigation must
    // not happen until the Next button is pressed.
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    await wrapper.find('[data-testid="simulate-select-dysfunctional"]').trigger('click')
    await flushPromises()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('clicking Next advances to next feature index', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    await wrapper.find('[data-testid="simulate-select-dysfunctional"]').trigger('click')
    await wrapper.find('[data-testid="feature-next"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
    })
  })

  test('clicking Next on LAST feature routes to submit-confirm', async () => {
    seedLoadedPoll()
    setIndex(2) // last feature index for N=3
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    await wrapper.find('[data-testid="simulate-select-dysfunctional"]').trigger('click')
    await wrapper.find('[data-testid="feature-next"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-submit-confirm',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('button label is "Next" on non-final features', async () => {
    seedLoadedPoll()
    setIndex(0)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="feature-next"]').text()).toBe('Next')
  })

  test('button label is "Submit" on the last feature', async () => {
    seedLoadedPoll()
    setIndex(2) // N=3 → last
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(wrapper.find('[data-testid="feature-next"]').text()).toBe('Submit')
  })
})

describe('Question route — back-nav', () => {
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

  test('Esc at index=2 routes to index=1', async () => {
    seedLoadedPoll()
    setIndex(2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="question-screen"]').trigger('keydown', {
      key: 'Escape',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
    })
  })

  test('Backspace also navigates back', async () => {
    seedLoadedPoll()
    setIndex(2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="question-screen"]').trigger('keydown', {
      key: 'Backspace',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
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

  test('index=3 (== N) is out of range under per-feature progression', async () => {
    seedLoadedPoll()
    setIndex(3)
    mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-landing',
      params: { uuid: 'poll-uuid' },
    })
  })
})

describe('Question route — draft state', () => {
  test('previously selected answers are passed to both Likerts on revisit', async () => {
    seedLoadedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b', 'fk-c'])
    draft.setAnswer('fk-a', 'functional', 4)
    draft.setAnswer('fk-a', 'dysfunctional', 2)
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper
        .find('[data-testid="kano-likert-functional"]')
        .attributes('data-model-value'),
    ).toBe('4')
    expect(
      wrapper
        .find('[data-testid="kano-likert-dysfunctional"]')
        .attributes('data-model-value'),
    ).toBe('2')
  })

  test('selecting an answer updates the draft store', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
    const draft = useResponseDraftStore()
    expect(draft.getAnswer('fk-a', 'functional')).toBe(3)
  })
})

describe('Question route — per-Likert showError sourcing (Story 4-7)', () => {
  test('?showError=1 + both answers null → both Likerts render error', async () => {
    seedLoadedPoll()
    routeQuery.value = { showError: '1' }
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper
        .find('[data-testid="kano-likert-functional"]')
        .attributes('data-show-error'),
    ).toBe('true')
    expect(
      wrapper
        .find('[data-testid="kano-likert-dysfunctional"]')
        .attributes('data-show-error'),
    ).toBe('true')
  })

  test('?showError=1 + only dysfunctional missing → only dysfunctional Likert renders error', async () => {
    seedLoadedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b', 'fk-c'])
    draft.setAnswer('fk-a', 'functional', 4)
    routeQuery.value = { showError: '1' }
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper
        .find('[data-testid="kano-likert-functional"]')
        .attributes('data-show-error'),
    ).toBe('false')
    expect(
      wrapper
        .find('[data-testid="kano-likert-dysfunctional"]')
        .attributes('data-show-error'),
    ).toBe('true')
  })

  test('absence of showError → neither Likert renders error', async () => {
    seedLoadedPoll()
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(
      wrapper
        .find('[data-testid="kano-likert-functional"]')
        .attributes('data-show-error'),
    ).toBe('false')
    expect(
      wrapper
        .find('[data-testid="kano-likert-dysfunctional"]')
        .attributes('data-show-error'),
    ).toBe('false')
  })

  test('first selection clears the showError query', async () => {
    seedLoadedPoll()
    routeQuery.value = { showError: '1' }
    const wrapper = mount(Question, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="simulate-select-functional"]').trigger('click')
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
