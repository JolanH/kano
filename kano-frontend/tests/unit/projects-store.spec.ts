/**
 * Pinia `useProjectsStore` — happy path + NotFound handling.
 *
 * Mocks `useApi()` at the import boundary so no `fetch` runs. Each test
 * gets a fresh Pinia instance via `setActivePinia(createPinia())`.
 */

import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { NotFoundError, type ProblemDetails } from '@/api/types'
import { useProjectsStore } from '@/stores/projects'

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: (path: string) => getMock(path),
    post: (path: string, body: unknown) => postMock(path, body),
    patch: (path: string, body: unknown) => patchMock(path, body),
    delete: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    put: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    resetCsrf: () => undefined,
  }),
}))

function ok<T>(data: T) {
  return Promise.resolve({ data, requestId: 'rid', status: 200 })
}

const sampleSummary = {
  id: 'p-1',
  name: 'Q3',
  version: '1.0',
  current_epoch: 1,
  created_at: '2026-05-19T10:00:00Z',
}

const sampleDetail = {
  ...sampleSummary,
  updated_at: '2026-05-19T10:00:00Z',
  active_features: [],
}

beforeEach(() => {
  setActivePinia(createPinia())
  getMock.mockReset()
  postMock.mockReset()
  patchMock.mockReset()
})

describe('useProjectsStore', () => {
  test('loadProjects populates items and flips isLoading', async () => {
    getMock.mockImplementation(() => ok([sampleSummary]))
    const store = useProjectsStore()
    expect(store.isLoading).toBe(false)
    const promise = store.loadProjects()
    expect(store.isLoading).toBe(true)
    await promise
    expect(store.isLoading).toBe(false)
    expect(store.items).toEqual([sampleSummary])
  })

  test('createProject prepends the new row optimistically', async () => {
    const store = useProjectsStore()
    store.items = [sampleSummary]
    postMock.mockImplementation(() =>
      ok({
        id: 'p-2',
        name: 'New',
        version: '1.0',
        current_epoch: 1,
        created_at: '2026-05-19T11:00:00Z',
        updated_at: '2026-05-19T11:00:00Z',
      }),
    )

    await store.createProject({ name: 'New', version: '1.0' })

    expect(postMock).toHaveBeenCalledWith('/projects/', { name: 'New', version: '1.0' })
    expect(store.items.map((p) => p.id)).toEqual(['p-2', 'p-1'])
  })

  test('loadProject populates current; NotFound sets lastLoadError without throwing', async () => {
    const store = useProjectsStore()
    // Happy path
    getMock.mockImplementationOnce(() => ok(sampleDetail))
    await store.loadProject('p-1')
    expect(store.current?.id).toBe('p-1')
    expect(store.lastLoadError).toBeNull()

    // 404
    const problem: ProblemDetails = {
      type: 'https://kano.example.com/problems/entity-not-found',
      title: 'Entity not found',
      status: 404,
      detail: null,
      instance: '/api/v1/projects/missing',
      request_id: null,
    }
    getMock.mockImplementationOnce(() => Promise.reject(new NotFoundError(problem, 404)))
    await store.loadProject('missing')
    expect(store.current).toBeNull()
    expect(store.lastLoadError).toBeInstanceOf(NotFoundError)
  })

  test('updateProject mirrors changes into current and items', async () => {
    const store = useProjectsStore()
    store.items = [sampleSummary]
    store.current = sampleDetail

    patchMock.mockImplementation(() =>
      ok({
        ...sampleSummary,
        name: 'Renamed',
        updated_at: '2026-05-19T12:00:00Z',
      }),
    )

    await store.updateProject('p-1', { name: 'Renamed' })

    expect(patchMock).toHaveBeenCalledWith('/projects/p-1', { name: 'Renamed' })
    expect(store.current?.name).toBe('Renamed')
    expect(store.items[0].name).toBe('Renamed')
  })
})
