/**
 * FeatureListEditor — ARIA grid semantics, inline create/edit/delete, paste
 * multi-line, 409 emit. Mounts the component against a stubbed `useApi` via
 * the projects store (which the component imports through Pinia).
 */

// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// The component intentionally avoids Vuetify primitives (uses plain
// <input> + <button>) so this spec mounts without auto-importing Vuetify's
// stylesheets. If a Vuetify component is added later, switch this to
// `mount(..., { global: { stubs: { ... } } })`.
const globalStubs: Record<string, unknown> = {}

import { ConflictError, type Feature, type ProblemDetails } from '@/api/types'
import FeatureListEditor from '@/components/FeatureListEditor.vue'
import { useProjectsStore } from '@/stores/projects'

const postMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: vi.fn(),
    post: (path: string, body: unknown) => postMock(path, body),
    patch: (path: string, body: unknown) => patchMock(path, body),
    delete: (path: string) => deleteMock(path),
    put: vi.fn(),
    resetCsrf: vi.fn(),
  }),
}))

function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: overrides.id ?? 'feat-id-1',
    feature_key: overrides.feature_key ?? 'feat-key-1',
    name: overrides.name ?? 'Existing',
    description: overrides.description ?? null,
    is_active: true,
    created_at: '2026-05-19T00:00:00Z',
    epoch: 1,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  postMock.mockReset()
  patchMock.mockReset()
  deleteMock.mockReset()
  // Seed `current` so the store's optimistic-update branch doesn't trip.
  const store = useProjectsStore()
  store.current = {
    id: 'p-1',
    name: 'P',
    version: '1.0',
    current_epoch: 1,
    created_at: '',
    updated_at: '',
    active_features: [],
  }
})

describe('FeatureListEditor — ARIA grid + inline authoring', () => {
  test('renders role=grid with one new-row at the bottom', () => {
    const wrapper = mount(FeatureListEditor, {
      props: { features: [feature()], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    expect(wrapper.attributes('role')).toBe('grid')
    const rows = wrapper.findAll('[role="row"]')
    // 1 feature row + 1 always-present empty row at the bottom
    expect(rows).toHaveLength(2)
    expect(wrapper.find('[data-testid="feature-new-row"]').exists()).toBe(true)
  })

  test('Enter on the new-row name commits create via the store and clears the inputs', async () => {
    postMock.mockResolvedValue({
      data: {
        ...feature({ feature_key: 'feat-new', name: 'Added' }),
      },
      requestId: 'r',
      status: 201,
    })
    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    const nameInput = wrapper.find('[data-testid="feature-new-name"]')
    await nameInput.setValue('Added')
    await nameInput.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(postMock).toHaveBeenCalledWith('/projects/p-1/features', {
      name: 'Added',
      description: null,
    })
    const created = wrapper.emitted('feature-created')
    expect(created).toBeTruthy()
    expect(wrapper.emitted('feature-created')?.[0]?.[0]).toMatchObject({ name: 'Added' })
    // Input cleared after commit
    expect((nameInput.element as HTMLInputElement).value).toBe('')
  })

  test('Esc on the new-row clears pending text', async () => {
    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    const nameInput = wrapper.find('[data-testid="feature-new-name"]')
    await nameInput.setValue('draft')
    await nameInput.trigger('keydown', { key: 'Escape' })

    expect((nameInput.element as HTMLInputElement).value).toBe('')
  })

  test('trash icon calls delete', async () => {
    deleteMock.mockResolvedValue({ data: null, requestId: 'r', status: 204 })
    const wrapper = mount(FeatureListEditor, {
      props: { features: [feature({ feature_key: 'k-del' })], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="feature-delete"]').trigger('click')
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith('/projects/p-1/features/k-del')
    expect(wrapper.emitted('feature-deleted')?.[0]?.[0]).toBe('k-del')
  })

  test('paste multi-line text creates one feature per non-empty line', async () => {
    postMock.mockImplementation((_, body) =>
      Promise.resolve({
        data: feature({ feature_key: `key-${(body as { name: string }).name}`, name: (body as { name: string }).name }),
        requestId: 'r',
        status: 201,
      }),
    )
    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    const nameInput = wrapper.find('[data-testid="feature-new-name"]')
    const clipboardEvent = new Event('paste') as unknown as ClipboardEvent
    // jsdom doesn't supply clipboardData by default; attach manually.
    Object.defineProperty(clipboardEvent, 'clipboardData', {
      value: { getData: () => 'A\nB\n\nC' },
    })
    await nameInput.element.dispatchEvent(clipboardEvent)
    await flushPromises()

    expect(postMock).toHaveBeenCalledTimes(3)
    const names = postMock.mock.calls.map((c) => (c[1] as { name: string }).name)
    expect(names).toEqual(['A', 'B', 'C'])
  })

  test('409 epoch-bump-required surfaces an event with replay callback + epoch numbers', async () => {
    const problem: ProblemDetails & {
      project_id: string
      current_epoch: number
      would_be_epoch: number
    } = {
      type: 'https://kano.example.com/problems/epoch-bump-required',
      title: 'Feature change requires epoch bump',
      status: 409,
      detail: 'polls exist',
      instance: '/api/v1/projects/p-1/features',
      request_id: 'r',
      project_id: 'p-1',
      current_epoch: 3,
      would_be_epoch: 4,
    }
    postMock
      .mockRejectedValueOnce(new ConflictError(problem, 409))
      // The replay-with-ack succeeds
      .mockResolvedValueOnce({
        data: feature({ feature_key: 'k-new', name: 'Added' }),
        requestId: 'r',
        status: 201,
      })

    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })
    const nameInput = wrapper.find('[data-testid="feature-new-name"]')
    await nameInput.setValue('Added')
    await nameInput.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const emitted = wrapper.emitted('epoch-bump-required')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as {
      mutation: () => Promise<void>
      currentEpoch: number
      wouldBeEpoch: number
    }
    expect(payload.currentEpoch).toBe(3)
    expect(payload.wouldBeEpoch).toBe(4)

    // Invoking the replay callback re-issues the request with acknowledged in body.
    await payload.mutation()
    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[1][0]).toBe('/projects/p-1/features')
    expect(postMock.mock.calls[1][1]).toMatchObject({ acknowledged: true })
  })

  test('description cell is a resizable textarea capped at 2048 chars', () => {
    const wrapper = mount(FeatureListEditor, {
      props: { features: [feature({ description: 'some text' })], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    const desc = wrapper.find('.pm-feature-cell--description textarea')
    expect(desc.exists()).toBe(true)
    expect(desc.attributes('maxlength')).toBe('2048')
    // New-row description is a textarea too.
    expect(
      (wrapper.find('[data-testid="feature-new-description"]').element as HTMLElement).tagName,
    ).toBe('TEXTAREA')
  })

  test('Enter inside a description textarea does not commit (it inserts a newline)', async () => {
    const wrapper = mount(FeatureListEditor, {
      props: {
        features: [feature({ feature_key: 'k1', name: 'N', description: 'D' })],
        projectId: 'p-1',
      },
      global: { stubs: globalStubs },
    })

    const desc = wrapper.find('.pm-feature-cell--description textarea')
    await desc.setValue('D\nmore')
    await desc.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    // Plain Enter must not PATCH — commit happens on blur instead.
    expect(patchMock).not.toHaveBeenCalled()
  })

  test('blur on the new-row description commits a create with the typed description', async () => {
    postMock.mockResolvedValue({
      data: feature({ feature_key: 'feat-new', name: 'Added', description: 'A multi-line\ndesc' }),
      requestId: 'r',
      status: 201,
    })
    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="feature-new-name"]').setValue('Added')
    const descInput = wrapper.find('[data-testid="feature-new-description"]')
    await descInput.setValue('A multi-line\ndesc')
    await descInput.trigger('blur')
    await flushPromises()

    expect(postMock).toHaveBeenCalledWith('/projects/p-1/features', {
      name: 'Added',
      description: 'A multi-line\ndesc',
    })
    expect(wrapper.emitted('feature-created')?.[0]?.[0]).toMatchObject({ name: 'Added' })
  })

  test('does not double-create when a second commit fires while the first is in flight', async () => {
    // Hold the POST pending so a second trigger lands mid-flight.
    let resolvePost: (value: unknown) => void = () => {}
    postMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const wrapper = mount(FeatureListEditor, {
      props: { features: [], projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="feature-new-name"]').setValue('Added')
    const descInput = wrapper.find('[data-testid="feature-new-description"]')
    await descInput.setValue('desc')

    // Two commits back-to-back (blur + a stray re-trigger) before the POST resolves.
    await descInput.trigger('blur')
    await descInput.trigger('blur')

    // The in-flight guard must collapse these into a single create.
    expect(postMock).toHaveBeenCalledTimes(1)

    resolvePost({
      data: feature({ feature_key: 'fk', name: 'Added' }),
      requestId: 'r',
      status: 201,
    })
    await flushPromises()
  })
})
