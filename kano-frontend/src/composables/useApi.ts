/**
 * The single backend HTTP client for the SPA.
 *
 * Per architecture §API & Communication Patterns (D10), every call from the
 * frontend goes through this composable so request-id generation, CSRF token
 * fetching/attachment, and Problem Details parsing live in exactly one place.
 *
 * Behaviors:
 * - Prepends `/api/v1/` to the caller's path; the SPA never speaks an absolute
 *   origin (Caddy reverse-proxies in prod, Vite proxies in dev). Rejects
 *   malformed paths (protocol-relative `//foo`, missing slash after the API
 *   prefix, etc.) before they reach `fetch`.
 * - Generates `X-Request-ID: <uuid>` per request via `crypto.randomUUID()` and
 *   exposes it on the response object so callers can correlate with backend
 *   logs without re-implementing UUID v4. The CSRF bootstrap call piggybacks
 *   on the parent request's ID so operators can trace bootstrap + retry +
 *   user-action as a single causal chain.
 * - On the first non-GET to a CSRF-protected route (everything except the
 *   `/csrf-token` and `/health` bootstrap pair), lazily fetches the CSRF token
 *   once per session, caches it, and attaches `X-CSRF-Token` to subsequent
 *   non-GETs. Concurrent first-POSTs share one bootstrap fetch via the
 *   `csrfFetchPromise` mutex.
 * - Honors `AbortSignal` end-to-end — including the CSRF bootstrap fetch — so
 *   a caller that aborts mid-bootstrap doesn't leak a pending network request.
 * - Bootstrap failures are themselves routed through `parseProblemDetails` +
 *   `classifyApiError`, so callers can rely uniformly on `KanoApiError`.
 * - Auto-recovers from a stale cached token: on a `csrf-validation-failed`
 *   Problem Details, clears the cache + in-flight promise, fences against
 *   concurrent retries via a version counter, and re-issues the original
 *   request exactly once with the new token.
 * - JSON-serializes only plain objects and arrays. Native body types
 *   (`FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer`, `ReadableStream`)
 *   are forwarded to `fetch` unchanged. Primitives are sent body-less.
 *   Caller-supplied `Content-Type` is preserved (never overridden).
 * - Parses `application/problem+json` error bodies and throws a typed
 *   `KanoApiError` subclass; HTTP 204 returns `null`; everything else returns
 *   the parsed JSON body.
 */

import {
  classifyApiError,
  KanoApiError,
  PROBLEM_TYPE,
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
const CSRF_PROBLEM_TYPE_SUFFIX = PROBLEM_TYPE.CSRF_VALIDATION_FAILED

let cachedCsrfToken: string | null = null
let csrfFetchPromise: Promise<string> | null = null
// Incremented every time the cache is invalidated. The retry path uses the
// pre-failure version to fence concurrent stale-token failures into a single
// re-bootstrap rather than N independent ones.
let csrfTokenVersion = 0

function buildUrl(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError(`useApi: path must be a non-empty string, got ${typeof path}`)
  }
  // Protocol-relative inputs (`//example.com/...`) and `/api/v1` substring
  // typos that lack a slash boundary are rejected at the wrapper level so
  // they never reach `fetch` (where they'd silently target the wrong origin
  // or produce a 404 the caller has to debug).
  if (path.startsWith('//')) {
    throw new TypeError(`useApi: protocol-relative paths are not allowed (got "${path}")`)
  }
  const trimmed = path.startsWith('/') ? path : `/${path}`
  if (trimmed === API_PREFIX || trimmed.startsWith(`${API_PREFIX}/`)) return trimmed
  if (trimmed.startsWith(API_PREFIX) && !trimmed.startsWith(`${API_PREFIX}/`)) {
    // e.g. `/api/v1projects` — missing slash after the prefix. Reject loudly.
    throw new TypeError(
      `useApi: path "${path}" looks like a malformed API URL (missing slash after ${API_PREFIX})`,
    )
  }
  return `${API_PREFIX}${trimmed}`
}

function generateRequestId(): string {
  // `crypto.randomUUID` is available in every browser the SPA targets
  // (Chromium 92+, Firefox 95+, Safari 15.4+) — older browsers are out of
  // scope per NFR9 platform-support matrix.
  return crypto.randomUUID()
}

async function parseProblemDetails(response: Response): Promise<ProblemDetails> {
  try {
    return (await response.json()) as ProblemDetails
  } catch {
    return {
      type: 'about:blank',
      title: response.statusText || `HTTP ${response.status}`,
      status: response.status,
      detail: null,
      instance: '',
      request_id: null,
    }
  }
}

async function fetchCsrfToken(
  parentRequestId: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    const response = await fetch(CSRF_TOKEN_PATH, {
      method: 'GET',
      credentials: 'include',
      // The bootstrap call shares the parent request's ID so backend logs
      // collapse the bootstrap + user-action pair into one trace.
      headers: { 'X-Request-ID': parentRequestId },
      signal,
    })
    if (!response.ok) {
      // Route bootstrap failure through the same typed-error pipeline as the
      // regular request path, so callers' `try/catch (e: KanoApiError)`
      // contract holds even for the CSRF GET.
      const problem = await parseProblemDetails(response)
      throw classifyApiError(problem, response.status)
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

function isNativeBody(body: unknown): boolean {
  // Native body types that `fetch` already knows how to send. Forwarded
  // verbatim with whatever Content-Type the caller (or `fetch`) sets.
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof ReadableStream
  )
}

function isPlainJsonBody(body: unknown): body is object {
  // Plain objects and arrays only. `Date`, `Map`, `Set`, custom class
  // instances, etc. are intentionally rejected — `JSON.stringify`'ing them
  // produces shapes the backend has no contract for.
  if (body === null || typeof body !== 'object') return false
  if (Array.isArray(body)) return true
  const proto = Object.getPrototypeOf(body)
  return proto === Object.prototype || proto === null
}

function isCsrfRejection(err: unknown): boolean {
  return (
    err instanceof KanoApiError &&
    typeof err.problem.type === 'string' &&
    err.problem.type.endsWith(CSRF_PROBLEM_TYPE_SUFFIX)
  )
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return true
  }
  return false
}

async function dispatchOnce<T>(
  method: string,
  url: string,
  body: unknown,
  options: ApiRequestOptions,
  requestId: string,
): Promise<ApiResponse<T>> {
  const callerHeaders = options.headers ?? {}
  const headers: Record<string, string> = {
    'X-Request-ID': requestId,
    ...callerHeaders,
  }

  const isMutation = method !== 'GET' && method !== 'HEAD'
  const isBootstrap = url === CSRF_TOKEN_PATH
  if (isMutation && !isBootstrap) {
    const token = await fetchCsrfToken(requestId, options.signal)
    headers['X-CSRF-Token'] = token
  }

  let serializedBody: BodyInit | undefined
  if (isNativeBody(body)) {
    serializedBody = body as BodyInit
  } else if (isPlainJsonBody(body)) {
    // Only set Content-Type if the caller didn't supply one — caller wins.
    if (!hasHeader(callerHeaders, 'content-type')) {
      headers['Content-Type'] = 'application/json'
    }
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

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = buildUrl(path)
  const requestId = generateRequestId()
  // Snapshot the cache version at dispatch start. The retry path uses this
  // to detect whether another concurrent failure has already invalidated
  // the cache, so we don't trigger N independent re-bootstraps for N
  // concurrent stale-token failures — only the first one bumps the version.
  const versionAtAttempt = csrfTokenVersion

  try {
    return await dispatchOnce<T>(method, url, body, options, requestId)
  } catch (err) {
    if (!isCsrfRejection(err)) throw err

    if (csrfTokenVersion === versionAtAttempt) {
      // First concurrent failure for this token version — invalidate.
      cachedCsrfToken = null
      csrfFetchPromise = null
      csrfTokenVersion += 1
    }
    // Subsequent concurrent failures fall through to re-dispatch; the
    // re-bootstrap is deduplicated via the existing `csrfFetchPromise`
    // mutex inside `fetchCsrfToken`.
    return await dispatchOnce<T>(method, url, body, options, requestId)
  }
}

export interface KanoApi {
  get<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  delete<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>>
  /** Drop the cached CSRF token (call on logout / explicit session reset). */
  resetCsrf(): void
}

const api: KanoApi = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, body, options) => request('DELETE', path, body, options),
  resetCsrf: () => {
    cachedCsrfToken = null
    csrfFetchPromise = null
    csrfTokenVersion += 1
  },
}

/** Returns the singleton `KanoApi` instance — same instance for every caller. */
export function useApi(): KanoApi {
  return api
}

/** Test-only: reset the cached CSRF token between specs. */
export function _resetCsrfCacheForTests(): void {
  cachedCsrfToken = null
  csrfFetchPromise = null
  csrfTokenVersion = 0
}

export { KanoApiError }
