/**
 * Shared frontend types for backend communication.
 *
 * The `ProblemDetails` shape mirrors the RFC 7807 envelope wired in backend
 * Story 1.3 (`kano.api.errors.register_error_handlers`). The error class
 * hierarchy below is what `useApi` throws on a non-2xx response, so callers
 * can do typed catches without re-parsing the body.
 */

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string | null
  instance: string
  request_id: string | null
}

export class KanoApiError extends Error {
  readonly problem: ProblemDetails
  readonly status: number

  constructor(problem: ProblemDetails, status: number) {
    super(problem.title)
    this.name = 'KanoApiError'
    this.problem = problem
    this.status = status
  }
}

export class ValidationError extends KanoApiError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends KanoApiError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'ConflictError'
  }
}

export class NotFoundError extends KanoApiError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'NotFoundError'
  }
}

export class ServerError extends KanoApiError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'ServerError'
  }
}

export class PermissionError extends KanoApiError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'PermissionError'
  }
}

export function classifyApiError(problem: ProblemDetails, status: number): KanoApiError {
  if (status === 400 || status === 422) return new ValidationError(problem, status)
  if (status === 401 || status === 403) return new PermissionError(problem, status)
  if (status === 404) return new NotFoundError(problem, status)
  if (status === 409) return new ConflictError(problem, status)
  if (status >= 500) return new ServerError(problem, status)
  return new KanoApiError(problem, status)
}
