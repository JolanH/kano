/**
 * The single backend HTTP client for the SPA.
 *
 * Per architecture §API & Communication Patterns (D10), every call from the
 * frontend goes through this composable so request-id generation, CSRF token
 * fetching/attachment, and Problem Details parsing live in exactly one place.
 *
 * Behaviors:
 * - Prepends `/api/v1/` to the caller's path; the SPA never speaks an absolute
 *   origin (Caddy reverse-proxies in prod, Vite proxies in dev).
 * - Generates `X-Request-ID: <uuid>` per request via `crypto.randomUUID()` and
 *   exposes it on the response object so callers can correlate with backend
 *   logs without re-implementing UUID v4.
 * - On the first non-GET to a CSRF-protected route (everything except the
 *   `/csrf-token` and `/health` bootstrap pair), lazily fetches the CSRF token
 *   once per session, caches it, and attaches `X-CSRF-Token` to subsequent
 *   non-GETs.
 * - Parses `application/problem+json` error bodies and throws a typed
 *   `KanoApiError` subclass; HTTP 204 returns `null`; everything else returns
 *   the parsed JSON body.
 */

import {
  classifyApiError,
  KanoApiError,
  type ProblemDetails,
} from '@/api/types'

export interface ApiResponse<T> {
  data: T
  requestId: string
  status: number
}

export interface ApiRequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
}

const API_PREFIX = '/api/v1'
const CSRF_TOKEN_PATH = `${API_PREFIX}/csrf-token`

let cachedCsrfToken: string | null = null
let csrfFetchPromise: Promise<string> | null = null

function buildUrl(path: string): string {
  const trimmed = path.startsWith('/') ? path : `/${path}`
  if (trimmed.startsWith(API_PREFIX)) return trimmed
  return `${API_PREFIX}${trimmed}`
}

function generateRequestId(): string {
  // `crypto.randomUUID` is available in every browser the SPA targets
  // (Chromium 92+, Firefox 95+, Safari 15.4+) — older browsers are out of
  // scope per NFR9 platform-support matrix.
  return crypto.randomUUID()
}

async function fetchCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    const response = await fetch(CSRF_TOKEN_PATH, {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Request-ID': generateRequestId() },
    })
    if (!response.ok) {
      throw new Error(`Failed to bootstrap CSRF token: HTTP ${response.status}`)
    }
    const body = (await response.json()) as { csrf_token: string }
    cachedCsrfToken = body.csrf_token
    return body.csrf_token
  })()

  try {
    return await csrfFetchPromise
  } finally {
    csrfFetchPromise = null
  }
}

async function parseProblemDetails(response: Response): Promise<ProblemDetails> {
  try {
    return (await response.json()) as ProblemDetails
  } catch {
    return {
      type: 'about:blank',
      title: response.statusText || 'Unknown error',
      status: response.status,
      detail: null,
      instance: '',
      request_id: null,
    }
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = buildUrl(path)
  const requestId = generateRequestId()
  const headers: Record<string, string> = {
    'X-Request-ID': requestId,
    ...(options.headers ?? {}),
  }

  const isMutation = method !== 'GET' && method !== 'HEAD'
  const isBootstrap = url === CSRF_TOKEN_PATH
  if (isMutation && !isBootstrap) {
    const token = await fetchCsrfToken()
    headers['X-CSRF-Token'] = token
  }

  let serializedBody: BodyInit | undefined
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json'
    serializedBody = JSON.stringify(body)
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    signal: options.signal,
    headers,
    body: serializedBody,
  })

  if (!response.ok) {
    const problem = await parseProblemDetails(response)
    throw classifyApiError(problem, response.status)
  }

  if (response.status === 204) {
    return { data: null as T, requestId, status: 204 }
  }

  const data = (await response.json()) as T
  return { data, requestId, status: response.status }
}

export interface KanoApi {
  get<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  delete<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>
}

const api: KanoApi = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options),
}

/** Returns the singleton `KanoApi` instance — same instance for every caller. */
export function useApi(): KanoApi {
  return api
}

/** Test-only: reset the cached CSRF token between specs. */
export function _resetCsrfCacheForTests(): void {
  cachedCsrfToken = null
  csrfFetchPromise = null
}

export { KanoApiError }
