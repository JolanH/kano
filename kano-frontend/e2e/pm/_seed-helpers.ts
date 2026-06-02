/**
 * Shared analysis-page fixture builders for the Story 5-8 perf + keyboard +
 * axe-at-scale specs. Mirrors the shape `kano-backend/scripts/seed_analysis_dataset.py`
 * produces against a real database, but emitted as pure JS so the existing
 * Playwright route-mocking pattern (no live backend in CI) extends without a
 * test-server dependency.
 *
 * Tradeoff vs the Python seeder: this module does NOT measure the API path —
 * the 500 ms server-side budget is the integration-test gate
 * (`kano-backend/tests/integration/test_analysis_api_perf.py`). What the
 * Playwright perf spec measures with this fixture is the *client* render +
 * layout budget on a realistic payload, which is the other half of the
 * NFR1 ceiling. The manual sweep against `seed_analysis_dataset.py` is the
 * end-to-end verification that ties both halves together (see
 * `docs/a11y/analysis-checklist.md`).
 *
 * `buildAnalysisFixture` returns a `PollAnalysis`-shaped payload with 20
 * feature rows and a pinned tie row (feat-02) so the FR35 tie-state
 * assertions across the perf / keyboard / axe specs all reference the same
 * deterministic shape.
 */

import { type Page, type Route, expect } from 'playwright/test'

import type { Category, PollAnalysis } from '../../src/api/types'

export const PROJECT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
export const POLL_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
export const EMPTY_POLL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const ZERO_DIST: Record<Category, number> = {
  M: 0,
  O: 0,
  A: 0,
  I: 0,
  R: 0,
  Q: 0,
}

function dist(overrides: Partial<Record<Category, number>>): Record<Category, number> {
  return { ...ZERO_DIST, ...overrides }
}

/**
 * Build a deterministic 20-feature analysis payload matching the NFR1
 * dataset shape (20 features × 500 submissions = 10 000 response rows).
 *
 * Feature row layout (mirrors `_shape_for_feature_index` in the backend
 * seeder, so the manual sweep's "row 2 is the tie row" expectation holds
 * regardless of which seed path produced the data):
 *
 * - feat-01 — single-dominant Must-be (~500 M, sparse O/A/I noise)
 * - feat-02 — 50/50 Must-be ↔ Performance tie (250 M, 250 O)
 * - feat-03 — 50/50 Performance ↔ Attractive tie (250 O, 250 A)
 * - feat-04..feat-20 — pseudo-random distributions seeded from a fixed RNG
 *   so the fixture is reproducible run-to-run.
 */
export function buildAnalysisFixture(): PollAnalysis {
  const features: PollAnalysis['features'] = []

  // feat-01: 100 % Must-be (the manual sweep references this as the
  // "single dominant" reference row). The Python seeder's `single_M` shape
  // deterministically emits (2, 5) → MUSTBE on every response — this
  // fixture mirrors that exact distribution so the JS fixture and the live
  // seeded backend present the same "100 percent. Must-be" announcement
  // to VoiceOver against `analysis-checklist.md` row #11.
  features.push({
    feature_key: 'feat-01',
    name: 'Feature 01',
    description: 'Auto-generated description for Feature 01',
    distribution: dist({ M: 500 }),
    dominant_categories: ['M'],
    dominant_percentage: 100,
  })

  // feat-02: 50/50 Must-be ↔ Performance tie — the load-bearing tie row.
  features.push({
    feature_key: 'feat-02',
    name: 'Feature 02',
    description: 'Auto-generated description for Feature 02',
    distribution: dist({ M: 250, O: 250 }),
    dominant_categories: ['M', 'O'],
    dominant_percentage: 50,
  })

  // feat-03: 50/50 Performance ↔ Attractive tie.
  features.push({
    feature_key: 'feat-03',
    name: 'Feature 03',
    description: 'Auto-generated description for Feature 03',
    distribution: dist({ O: 250, A: 250 }),
    dominant_categories: ['O', 'A'],
    dominant_percentage: 50,
  })

  // feat-04..feat-20: deterministic pseudo-random shapes. Seeded LCG (no
  // dependency on `Math.random` global state — runs reproducibly across
  // Node versions) generates one feature per loop. Each distribution is
  // weighted to land on a single dominant category so the cross-index
  // surface has plenty of category panels populated.
  let lcgState = 0xdeadbeef
  const nextRandom = (): number => {
    // 32-bit Linear Congruential Generator (Numerical Recipes constants).
    lcgState = (lcgState * 1664525 + 1013904223) & 0xffffffff
    return (lcgState >>> 0) / 0x100000000
  }

  const FALLBACK_CATEGORIES: Category[] = ['M', 'O', 'A', 'I', 'R', 'Q']
  for (let i = 4; i <= 20; i++) {
    const key = `feat-${String(i).padStart(2, '0')}`
    // Build a six-bucket distribution biased toward one of the six
    // categories. Bias keeps each row single-dominant rather than tied so
    // we exercise the dominant cross-index surface broadly.
    const dominant = FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length]
    const dominantCount = 300 + Math.floor(nextRandom() * 100) // 300..399
    const distribution = dist({})
    distribution[dominant] = dominantCount
    let remaining = 500 - dominantCount
    for (const cat of FALLBACK_CATEGORIES) {
      if (cat === dominant) continue
      const share = remaining > 0 ? Math.floor(nextRandom() * Math.max(1, remaining)) : 0
      distribution[cat] = share
      remaining -= share
    }
    // Sweep any remainder into the dominant so the row sums to 500.
    distribution[dominant] += Math.max(0, remaining)

    features.push({
      feature_key: key,
      name: `Feature ${String(i).padStart(2, '0')}`,
      description: `Auto-generated description for Feature ${String(i).padStart(2, '0')}`,
      distribution,
      dominant_categories: [dominant],
      dominant_percentage: Math.round((distribution[dominant] / 500) * 1000) / 10,
    })
  }

  return {
    poll_id: POLL_ID,
    epoch: 1,
    total_submissions: 500,
    features,
  }
}

export function buildEmptyAnalysisFixture(): PollAnalysis {
  return {
    poll_id: EMPTY_POLL_ID,
    epoch: 1,
    total_submissions: 0,
    features: [],
  }
}

export interface PerfSeed {
  projectId: string
  pollId: string
}

export async function seedAnalysisFixture(
  page: Page,
  { empty = false }: { empty?: boolean } = {},
): Promise<PerfSeed> {
  const payload = empty ? buildEmptyAnalysisFixture() : buildAnalysisFixture()
  const targetPollId = empty ? EMPTY_POLL_ID : POLL_ID

  await page.route('**/api/v1/csrf-token', (route: Route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ csrf_token: 't-stub' }),
    }),
  )

  await page.route(`**/api/v1/projects/${PROJECT_ID}`, (route: Route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: PROJECT_ID,
        name: 'Analysis perf seed',
        version: '1.0',
        current_epoch: 1,
        created_at: '2026-05-19T10:00:00Z',
        updated_at: '2026-05-19T10:00:00Z',
        active_features: [],
      }),
    }),
  )

  await page.route(`**/api/v1/polls/${targetPollId}/analysis`, (route: Route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }),
  )

  return { projectId: PROJECT_ID, pollId: targetPollId }
}

/**
 * Helper used by every spec consuming the fixture: navigate + wait for the
 * fully-rendered analysis table. The wait targets the 20th `<tr>` (last
 * row) by stable feature_key, so a partial render fails the wait rather
 * than the test reading an empty body.
 */
export async function gotoAnalysisAndWait(
  page: Page,
  { projectId, pollId }: PerfSeed,
): Promise<void> {
  await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
  await expect(page.locator('#feature-feat-20')).toBeVisible()
}
