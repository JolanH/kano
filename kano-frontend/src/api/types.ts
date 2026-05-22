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

/**
 * RFC 7807 ``type`` slug suffixes the backend emits. Mirror of the
 * ``type_slug`` constants on each ``KanoError`` subclass in
 * ``kano-backend/src/kano/exceptions.py``. Keep this in sync — these are
 * the only acceptable string-match anchor points for problem-type detection
 * on the frontend. Match via ``problem.type.endsWith(...)`` so the
 * domain-prefixed URL ``https://kano.example.com/problems/<slug>`` resolves
 * against the suffix regardless of host.
 */
export const PROBLEM_TYPE = {
  EPOCH_BUMP_REQUIRED: 'epoch-bump-required',
  CSRF_VALIDATION_FAILED: 'csrf-validation-failed',
  ENTITY_NOT_FOUND: 'entity-not-found',
  VALIDATION_ERROR: 'validation-error',
  POLL_EXPIRED: 'poll-expired',
  POLL_REQUIRES_FEATURES: 'poll-requires-features',
  PARTIAL_SUBMISSION: 'partial-submission',
} as const

export type ProblemTypeSlug = (typeof PROBLEM_TYPE)[keyof typeof PROBLEM_TYPE]

/** True iff ``problem.type`` ends with the given slug (host-agnostic match). */
export function isProblemType(problem: ProblemDetails, slug: ProblemTypeSlug): boolean {
  return typeof problem.type === 'string' && problem.type.endsWith(slug)
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

/**
 * Specialized 422 raised by the create-poll endpoint when the target project
 * has zero active features on its current epoch. Surfaced to the UI so
 * Story 3-6 can render the "Add at least one feature" warning inline
 * instead of the generic validation toast.
 */
export class PollRequiresFeaturesError extends ValidationError {
  constructor(problem: ProblemDetails, status: number) {
    super(problem, status)
    this.name = 'PollRequiresFeaturesError'
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
  if (status === 422 && isProblemType(problem, PROBLEM_TYPE.POLL_REQUIRES_FEATURES)) {
    return new PollRequiresFeaturesError(problem, status)
  }
  if (status === 400 || status === 422) return new ValidationError(problem, status)
  if (status === 401 || status === 403) return new PermissionError(problem, status)
  if (status === 404) return new NotFoundError(problem, status)
  if (status === 409) return new ConflictError(problem, status)
  if (status >= 500) return new ServerError(problem, status)
  return new KanoApiError(problem, status)
}

/**
 * Backend resource types (Stories 2-1 .. 2-8).
 *
 * Shapes mirror the Pydantic schemas in `kano-backend/src/kano/schemas/`.
 * Keep field names snake_case so the JSON returned by the API drops in
 * without aliasing — architecture §Format Patterns.
 */

/**
 * Kano-matrix category wire codes. Mirror of the backend
 * `kano.services.kano_matrix.Category` enum values — letter codes only
 * cross the wire; the human-readable names live in `src/copy/en.ts` under
 * `pm.category.*` and are resolved at render time by `<CatBadge>`.
 */
export type Category = 'M' | 'L' | 'E' | 'I' | 'C' | 'D'

export interface ProjectSummary {
  id: string
  name: string
  version: string
  current_epoch: number
  created_at: string
}

export interface Project extends ProjectSummary {
  updated_at: string
}

export interface Feature {
  id: string
  feature_key: string
  name: string
  description: string | null
  is_active?: boolean
  created_at: string
  epoch?: number
}

export interface ProjectDetail extends Project {
  active_features: Feature[]
}

export interface ProjectCreateInput {
  name: string
  version: string
}

export interface ProjectUpdateInput {
  name?: string
  version?: string
}

export interface FeatureAtEpoch extends Feature {
  is_active: boolean
  epoch: number
}

/**
 * Wire shapes for the poll aggregate (Epic 3 — Stories 3-1+). Mirror of
 * `kano.schemas.poll`. `response_count` and `is_expired` are computed by
 * the service layer at query/response time, not stored on the DB row.
 */

export interface PollSummary {
  id: string
  project_id: string
  epoch: number
  created_at: string
  expires_at: string
  response_count: number
  is_expired: boolean
}

export interface PollSummaryWithProject extends PollSummary {
  project_name: string
  project_version: string
}

export interface PollPublicFeature {
  feature_key: string
  name: string
  description: string | null
}

export interface PollPublic {
  id: string
  expires_at: string
  features: PollPublicFeature[]
}
