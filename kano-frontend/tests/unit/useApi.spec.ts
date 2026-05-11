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
  PermissionError,
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

  test('401 → PermissionError', async () => {
    fetchImpl = () => problemResponse(401, 'Unauthorized')

    await expect(useApi().get('/private')).rejects.toBeInstanceOf(PermissionError)
  })

  test('403 → PermissionError', async () => {
    fetchImpl = () => problemResponse(403, 'Forbidden')

    await expect(useApi().get('/private')).rejects.toBeInstanceOf(PermissionError)
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

describe('useApi — credentials', () => {
  test('every fetch carries credentials: include (session cookie required)', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/projects', { name: 'p' })

    for (const call of fetchCalls) {
      expect(call.init.credentials).toBe('include')
    }
  })
})

describe('useApi — bootstrap failure throws KanoApiError', () => {
  test('500 from /csrf-token surfaces as ServerError, not a plain Error', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return problemResponse(500, 'CSRF generation failed')
      throw new Error(`unexpected URL: ${url}`)
    }

    await expect(useApi().post('/projects', { name: 'p' })).rejects.toBeInstanceOf(ServerError)
  })

  test('400 from /csrf-token surfaces as ValidationError', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return problemResponse(400)
      throw new Error(`unexpected URL: ${url}`)
    }

    await expect(useApi().post('/projects', { name: 'p' })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('useApi — body serialization', () => {
  test('object/array bodies set Content-Type and serialize', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/projects', { name: 'p' })
    await useApi().post('/items', [1, 2, 3])

    const projectsCall = fetchCalls.find((c) => c.url === '/api/v1/projects')
    const itemsCall = fetchCalls.find((c) => c.url === '/api/v1/items')
    expect(projectsCall?.init.body).toBe('{"name":"p"}')
    expect((projectsCall?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    expect(itemsCall?.init.body).toBe('[1,2,3]')
  })

  test('primitive bodies (false / 0 / "") are NOT serialized — sent body-less', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/a', false)
    await useApi().post('/b', 0)
    await useApi().post('/c', '')

    for (const url of ['/api/v1/a', '/api/v1/b', '/api/v1/c']) {
      const call = fetchCalls.find((c) => c.url === url)
      expect(call?.init.body).toBeUndefined()
      expect((call?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    }
  })

  test('null / undefined bodies are sent body-less', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/a', null)
    await useApi().post('/b', undefined)

    for (const url of ['/api/v1/a', '/api/v1/b']) {
      const call = fetchCalls.find((c) => c.url === url)
      expect(call?.init.body).toBeUndefined()
    }
  })

  test('FormData is forwarded verbatim — no JSON serialization, no Content-Type override', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    const fd = new FormData()
    fd.append('name', 'p')
    await useApi().post('/upload', fd)

    const call = fetchCalls.find((c) => c.url === '/api/v1/upload')
    expect(call?.init.body).toBe(fd)
    expect((call?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  test('URLSearchParams is forwarded verbatim', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    const params = new URLSearchParams({ a: '1', b: '2' })
    await useApi().post('/x', params)

    const call = fetchCalls.find((c) => c.url === '/api/v1/x')
    expect(call?.init.body).toBe(params)
    expect((call?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  test('Date instance is treated as primitive (not stringified) — body-less', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/t', new Date())

    const call = fetchCalls.find((c) => c.url === '/api/v1/t')
    expect(call?.init.body).toBeUndefined()
    expect((call?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  test('caller-supplied Content-Type is preserved on plain-object body', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    await useApi().post('/patch', [{ op: 'replace', path: '/name', value: 'x' }], {
      headers: { 'Content-Type': 'application/json-patch+json' },
    })

    const call = fetchCalls.find((c) => c.url === '/api/v1/patch')
    expect((call?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    )
    // Body is still serialized (it's a plain array).
    expect(typeof call?.init.body).toBe('string')
  })
})

describe('useApi — buildUrl input hardening', () => {
  test('protocol-relative path is rejected', async () => {
    await expect(useApi().get('//evil.example.com/api')).rejects.toThrow(/protocol-relative/)
  })

  test('typo "api/v1projects" (missing slash) is rejected', async () => {
    await expect(useApi().get('/api/v1projects')).rejects.toThrow(/missing slash/)
  })

  test('non-string path is rejected', async () => {
    // Caller has type checking off — wrapper must still refuse.
    await expect(useApi().get(undefined as unknown as string)).rejects.toThrow(/non-empty string/)
  })

  test('relative path without leading slash is normalized', async () => {
    fetchImpl = () => jsonResponse({ ok: true })

    await useApi().get('projects')

    expect(fetchCalls[0].url).toBe('/api/v1/projects')
  })
})

describe('useApi — AbortSignal threading', () => {
  test('aborting before CSRF bootstrap aborts the bootstrap fetch too', async () => {
    let bootstrapAborted = false
    fetchImpl = (url: string, init: RequestInit = {}) => {
      if (url === '/api/v1/csrf-token') {
        // Simulate the signal-checking that real fetch performs: if the
        // caller already aborted before fetch started, throw an AbortError.
        if (init.signal?.aborted) {
          bootstrapAborted = true
          const err = new Error('aborted')
          err.name = 'AbortError'
          throw err
        }
      }
      return jsonResponse({}, 201)
    }

    const ctrl = new AbortController()
    ctrl.abort()

    await expect(
      useApi().post('/projects', { name: 'p' }, { signal: ctrl.signal }),
    ).rejects.toThrow(/aborted/)
    expect(bootstrapAborted).toBe(true)
  })
})

describe('useApi — X-Request-ID correlation through bootstrap', () => {
  test('CSRF bootstrap reuses the parent request ID', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    const response = await useApi().post('/projects', { name: 'p' })

    const bootstrapCall = fetchCalls.find((c) => c.url === '/api/v1/csrf-token')
    const projectsCall = fetchCalls.find((c) => c.url === '/api/v1/projects')
    const bootstrapRid = (bootstrapCall?.init.headers as Record<string, string>)['X-Request-ID']
    const projectsRid = (projectsCall?.init.headers as Record<string, string>)['X-Request-ID']
    expect(bootstrapRid).toBe(projectsRid)
    expect(bootstrapRid).toBe(response.requestId)
  })
})

describe('useApi — stale CSRF token recovery', () => {
  test('csrf-validation-failed Problem Details triggers cache reset + retry', async () => {
    let csrfCallCount = 0
    let projectsCallCount = 0

    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') {
        csrfCallCount += 1
        return jsonResponse({ csrf_token: csrfCallCount === 1 ? 'stale' : 'fresh' })
      }
      if (url === '/api/v1/projects') {
        projectsCallCount += 1
        if (projectsCallCount === 1) {
          return new Response(
            JSON.stringify({
              type: 'https://kano.example.com/problems/csrf-validation-failed',
              title: 'CSRF token missing or invalid',
              status: 400,
              detail: null,
              instance: '/api/v1/projects',
              request_id: 'rid',
            }),
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }
        return jsonResponse({ id: 1 }, 201)
      }
      throw new Error(`unexpected URL: ${url}`)
    }

    const response = await useApi().post('/projects', { name: 'p' })

    expect(response.data).toEqual({ id: 1 })
    expect(csrfCallCount).toBe(2) // bootstrap + retry-after-rotation
    expect(projectsCallCount).toBe(2) // failed + retried
    const retryHeaders = fetchCalls
      .filter((c) => c.url === '/api/v1/projects')[1].init.headers as Record<string, string>
    expect(retryHeaders['X-CSRF-Token']).toBe('fresh')
  })

  test('non-CSRF 400 (e.g. validation) does NOT trigger retry', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return problemResponse(400, 'Invalid name')
    }

    await expect(useApi().post('/projects', { name: '' })).rejects.toBeInstanceOf(ValidationError)
    const projectsCalls = fetchCalls.filter((c) => c.url === '/api/v1/projects')
    expect(projectsCalls).toHaveLength(1) // no retry
  })

  test('resetCsrf() clears the cache so the next mutation re-bootstraps', async () => {
    fetchImpl = (url: string) => {
      if (url === '/api/v1/csrf-token') return jsonResponse({ csrf_token: 't' })
      return jsonResponse({}, 201)
    }

    const api = useApi()
    await api.post('/projects', { name: 'p1' })
    api.resetCsrf()
    await api.post('/projects', { name: 'p2' })

    const csrfFetches = fetchCalls.filter((c) => c.url === '/api/v1/csrf-token')
    expect(csrfFetches).toHaveLength(2)
  })
})
