/**
 * useApi composable — request shape, CSRF bootstrap, Problem Details parsing.
 *
 * `fetch` is mocked so we can assert the URL prefix, the `X-Request-ID` /
 * `X-CSRF-Token` headers, and the typed-error throw path without a backend.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  ConflictError,
  KanoApiError,
  NotFoundError,
  ServerError,
  ValidationError,
} from '@/api/types'
import { _resetCsrfCacheForTests, useApi } from '@/composables/useApi'

interface FetchCall {
  url: string
  init: RequestInit
}

let fetchCalls: FetchCall[] = []
let fetchImpl: ((url: string, init: RequestInit) => Response) | null = null

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problemResponse(status: number, title = 'Boom'): Response {
  return new Response(
    JSON.stringify({
      type: 'https://kano.example.com/problems/test',
      title,
      status,
      detail: null,
      instance: '/',
      request_id: 'test-rid',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

beforeEach(() => {
  fetchCalls = []
  fetchImpl = null
  _resetCsrfCacheForTests()
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      fetchCalls.push({ url, init })
      if (!fetchImpl) throw new Error(`unexpected fetch: ${url}`)
      return fetchImpl(url, init)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useApi.get', () => {
  test('prepends /api/v1, sends request-id, returns parsed body', async () => {
    fetchImpl = () => jsonResponse({ hello: 'world' })

    const api = useApi()
    const response = await api.get<{ hello: string }>('/projects')

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('/api/v1/projects')
    const headers = fetchCalls[0].init.headers as Record<string, string>
    expect(headers['X-Request-ID']).toBeTruthy()
    expect(response.data).toEqual({ hello: 'world' })
    expect(response.status).toBe(200)
  })

  test('idempotent on path with leading /api/v1 already present', async () => {
    fetchImpl = () => jsonResponse({ ok: true })

    await useApi().get('/api/v1/health')

    expect(fetchCalls[0].url).toBe('/api/v1/health')
  })
})

describe('useApi.post — CSRF bootstrap', () => {
  test('first POST fetches /csrf-token, then attaches X-CSRF-Token to request', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 'abc-token' })
      if (url === '/api/v1/projects') return jsonResponse({ id: 1 }, 201)
      throw new Error(`unexpected URL: ${url}`)
    }

    const api = useApi()
    const response = await api.post('/projects', { name: 'p' })

    expect(fetchCalls.map((c) => c.url)).toEqual([
      '/api/v1/csrf-token',
      '/api/v1/projects',
    ])
    const projectsHeaders = fetchCalls[1].init.headers as Record<string, string>
    expect(projectsHeaders['X-CSRF-Token']).toBe('abc-token')
    expect(projectsHeaders['Content-Type']).toBe('application/json')
    expect(response.data).toEqual({ id: 1 })
  })

  test('second POST reuses cached CSRF token (one /csrf-token fetch only)', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 'abc-token' })
      return jsonResponse({}, 201)
    }

    const api = useApi()
    await api.post('/projects', { name: 'p1' })
    await api.post('/projects', { name: 'p2' })

    const csrfFetches = fetchCalls.filter((c) => c.url === '/api/v1/csrf-token')
    expect(csrfFetches).toHaveLength(1)
  })

  test('GET does NOT fetch CSRF token', async () => {
    fetchImpl = () => jsonResponse({ ok: true })

    await useApi().get('/projects')

    expect(fetchCalls.map((c) => c.url)).toEqual(['/api/v1/projects'])
  })
})

describe('useApi — typed Problem Details errors', () => {
  test('400 → ValidationError', async () => {
    fetchImpl = () => problemResponse(400, 'Invalid request')

    await expect(useApi().get('/projects')).rejects.toBeInstanceOf(ValidationError)
  })

  test('404 → NotFoundError', async () => {
    fetchImpl = () => problemResponse(404)

    await expect(useApi().get('/missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  test('409 → ConflictError', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return problemResponse(409)
    }

    await expect(useApi().post('/conflict', {})).rejects.toBeInstanceOf(ConflictError)
  })

  test('500 → ServerError', async () => {
    fetchImpl = () => problemResponse(500)

    await expect(useApi().get('/boom')).rejects.toBeInstanceOf(ServerError)
  })

  test('thrown error carries the parsed Problem Details payload', async () => {
    fetchImpl = () => problemResponse(400, 'Validation oops')

    try {
      await useApi().get('/projects')
      throw new Error('expected ValidationError')
    } catch (e) {
      expect(e).toBeInstanceOf(KanoApiError)
      const err = e as KanoApiError
      expect(err.status).toBe(400)
      expect(err.problem.title).toBe('Validation oops')
    }
  })
})

describe('useApi — 204 No Content', () => {
  test('returns null data without throwing', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return new Response(null, { status: 204 })
    }

    const response = await useApi().delete('/projects/1')

    expect(response.data).toBeNull()
    expect(response.status).toBe(204)
  })
})
