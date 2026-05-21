// @vitest-environment jsdom
/**
 * Thanks.vue (Story 4-7) — respectful close, no CTAs, no API.
 */

import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import Thanks from '@/pages/poll/Thanks.vue'
import { usePollPublicStore } from '@/stores/pollPublic'

const getMock = vi.fn()
const postMock = vi.fn()
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: (path: string) => getMock(path),
    post: (path: string, body: unknown) => postMock(path, body),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uuid: 'poll-uuid' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () =>
        h('div', { 'data-stub-component': name, ...attrs }, slots.default?.())
    },
  })

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-card-title': passthrough('v-card-title'),
  'v-card-text': passthrough('v-card-text'),
}

beforeEach(() => {
  setActivePinia(createPinia())
  getMock.mockReset()
  postMock.mockReset()
})

describe('Thanks page', () => {
  test('renders title + body from copy deck', () => {
    const wrapper = mount(Thanks, { global: { stubs: globalStubs } })
    expect(wrapper.text()).toContain('Thanks — your input is on the record')
    expect(wrapper.text()).toContain('Your product manager will see this')
  })

  test('does NOT call any API', () => {
    mount(Thanks, { global: { stubs: globalStubs } })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  test('renders even when pollPublicStore.poll is null', () => {
    const store = usePollPublicStore()
    store.$patch({ fetchState: 'idle', poll: null })
    const wrapper = mount(Thanks, { global: { stubs: globalStubs } })
    expect(wrapper.find('[data-testid="poll-thanks"]').exists()).toBe(true)
  })

  test('renders even when poll is expired (unconditional acknowledgement)', () => {
    const store = usePollPublicStore()
    store.$patch({ fetchState: 'expired', poll: null })
    const wrapper = mount(Thanks, { global: { stubs: globalStubs } })
    expect(wrapper.text()).toContain('Thanks — your input is on the record')
  })

  test('no next-action CTA / share button rendered', () => {
    const wrapper = mount(Thanks, { global: { stubs: globalStubs } })
    expect(wrapper.findAll('button').length).toBe(0)
    expect(wrapper.findAll('a').length).toBe(0)
  })
})
