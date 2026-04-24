# Story 5.5: Analysis page table composition with dominant, tie, empty state, confidence beat

Status: ready-for-dev

## Story

As Paola,
I want the analysis page rendered as a table-row composition with feature | dominant category + % | distribution bar | n count, plus an empty state for zero responses and a quiet confidence-beat meta line,
so that I can scan the dominant column top-to-bottom to read claims and share the screen with stakeholders without reformatting.

## Acceptance Criteria

1. **Given** I navigate to `/app/projects/:projectId/polls/:pollId/analysis`, **when** the page mounts, **then** it calls `GET /api/v1/polls/:pollId/analysis` (Story 5.2), renders a `v-skeleton-loader` while loading (architecture §Loading States line 732), and on success shows a page header composed of: project name + "Version N" badge (via `common.version` copy key) + confidence-beat meta line (`"{total} of {expected} responses"`) in secondary text weight — **not** a blocking banner — per UX-DR21 (UX spec design rationale).
2. **Given** `total_submissions > 0`, **when** the page renders the analysis body, **then** a `v-data-table` below the header shows **one row per feature** with four columns:
   - **Feature**: name bold 14 px + description 12 px muted (grey secondary), responsive wrap
   - **Dominant**: 20 px tabular-number percentage (e.g., "71%"), with `<CatBadge>`(s) below — one when single dominant, multiple joined by `" / "` when tied
   - **Distribution**: `<KanoStackedBar variant="default" />` + sibling `<KanoStackedBarTable :id="'stb-<feature_key>'" />` (Story 5.4) wired via `aria-labelled-by`
   - **n**: response count for that feature (sum of its distribution values), tabular numerals, right-aligned
3. **Given** a feature has exactly one dominant category, **when** the Dominant cell renders, **then** the percentage text reads "71%" (integer % if exact, one decimal otherwise — see Story 5.1 rounding contract) followed by exactly one `<CatBadge :category="winner" />` below the percentage.
4. **Given** a feature has 2 or more tied dominant categories, **when** the Dominant cell renders, **then** the percentage reads `"{pct}% each"` (via copy key `analysis.dominant.tiedPercent` with `{pct}` interpolation) followed by all `dominant_categories` rendered as `<CatBadge>`s joined by `" / "` separator, and the stacked bar's tied segments render at equal width (already the default — `<KanoStackedBar>` proportional widths naturally produce equal widths for equal counts, no extra ornamentation per UX spec line 1305).
5. **Given** `total_submissions == 0`, **when** the page renders, **then** the entire `v-data-table` is **replaced** by a single empty-state block: a `v-card` or centered div containing the copy-deck string `analysis.emptyState` (`"0 of {expected} expected responses — analysis will populate as responses arrive"`) — FR37. **Never** render empty bars or zero-percent dominant cells under any circumstance; zero-submission rows are also not rendered individually (the empty state is full-table).
6. **Given** the page renders at any viewport, **when** the table container is measured, **then** it has a fixed `max-width: 1440px` centered in the viewport (UX-DR22), with horizontal padding collapsing gracefully below 1440 px (no horizontal scroll, no clipping). The PM home poll-list from Story 3.7 uses the same container width — reuse its layout helper if one was extracted; otherwise, inline the max-width + centering.
7. **Given** I hover a row, **when** the pointer moves over it, **then** the row background switches to `surface-bright` (Tixeo token `#F7F8FA`). Click on a row in v1 is **reserved**: no navigation happens, no cursor hint appears (cursor remains default). A code comment documents the post-MVP drill-down affordance is deferred.
8. **Given** the page renders, **when** any user-visible string is inspected, **then** all strings flow through `useCopy` — no inline literals (ESLint gate from Story 1.7 enforces). New copy keys are added in this story (list in Tasks below).
9. **Given** the page renders, **when** keyboard-navigated, **then** Tab focuses interactive elements in reading order: epoch selector (top-bar) → each feature row's `<KanoStackedBar>` segments (Tab-scoped per Story 5.4) → any row-level buttons (none in v1). Focus rings use the Tixeo primary outline pattern (per UX spec line 581). Non-interactive rows are NOT in the tab order.
10. **Given** an error response from `/api/v1/polls/:pollId/analysis` (network failure, 500, 404), **when** the page handles the error, **then** it renders a typed error surface: 404 → "This poll doesn't exist" card with back-to-PM-home link; 500/network → inline `v-alert` error with retry button that re-invokes the fetch. Uses `useApi`'s typed error classes (Story 1.6 + Story 3.4 precedent).
11. A Playwright E2E test (`e2e/pm/analysis-page.spec.ts`) seeds:
    - a populated poll (5 features × 20 submissions with a known distribution covering single-dominant, 2-tie, and all-same cases) → assert the page renders the header, 5 rows, correct percentages, correct CatBadge counts per row
    - a zero-submission poll → assert the empty-state copy renders and no `v-data-table` element is present
    - a 404 case (unknown poll UUID) → assert the error card with back link
    - axe-core violations on both populated + empty states → zero
12. The epoch selector (Story 2.12's `<EpochSelector>`) appears in the analysis-page top-bar (not inside the table header) and navigates to the same route with a `?epoch=N` query string. On mount, the page reads `?epoch` from the URL and uses it as the pinned-epoch display — the analysis payload itself always reflects the poll's pinned epoch (since poll is pinned on creation per Story 3.2); the selector governs **which poll** is shown when the project has multiple polls across epochs, not which epoch's analysis runs. See Dev Notes for the routing interaction.

## Tasks / Subtasks

- [ ] Route + page scaffold (AC: #1, #10, #12)
  - [ ] Register route in `src/router.ts`:
    ```ts
    {
      path: '/app/projects/:projectId/polls/:pollId/analysis',
      name: 'analysis',
      component: () => import('./routes/app/Analysis.vue'),
      meta: { layout: 'pm' },
    }
    ```
  - [ ] New file `src/routes/app/Analysis.vue`:
    ```vue
    <script setup lang="ts">
    import { ref, onMounted, computed } from 'vue'
    import { useRoute } from 'vue-router'
    import { useApi } from '@/composables/useApi'
    import { useCopy } from '@/composables/useCopy'
    import type { PollAnalysis } from '@/api/types'
    import AnalysisTable from '@/components/AnalysisTable.vue'
    import AnalysisEmptyState from '@/components/AnalysisEmptyState.vue'
    // ...

    const route = useRoute()
    const copy = useCopy()
    const api = useApi()
    const analysis = ref<PollAnalysis | null>(null)
    const loading = ref(true)
    const error = ref<ApiError | null>(null)

    async function load() {
      loading.value = true
      error.value = null
      try {
        analysis.value = await api.get<PollAnalysis>(`/polls/${route.params.pollId}/analysis`)
      } catch (e) {
        error.value = e as ApiError
      } finally {
        loading.value = false
      }
    }
    onMounted(load)

    const isEmpty = computed(() => !!analysis.value && analysis.value.total_submissions === 0)
    </script>

    <template>
      <div class="analysis-page">
        <header class="analysis-header">...</header>
        <v-skeleton-loader v-if="loading" type="table" />
        <AnalysisErrorSurface v-else-if="error" :error="error" @retry="load" />
        <AnalysisEmptyState v-else-if="isEmpty" :expected="expectedResponses" />
        <AnalysisTable v-else :analysis="analysis!" />
      </div>
    </template>
    ```
  - [ ] `expectedResponses`: for v1, the empty-state copy renders `{expected}` as "N expected" — where N comes from... **see Dev Notes**. Short answer: hard-code the UI to `"0 of ? expected responses"` in v1 if the expected-count is not stored, OR treat the empty state as unparameterized copy (drop the `{expected}` interpolation). Pick a path and document it.
- [ ] `AnalysisTable.vue` component (AC: #2, #3, #4, #6, #7)
  - [ ] New file `src/components/AnalysisTable.vue`:
    ```vue
    <script setup lang="ts">
    import { computed } from 'vue'
    import { useCopy } from '@/composables/useCopy'
    import CatBadge from './CatBadge.vue'
    import KanoStackedBar from './KanoStackedBar.vue'
    import KanoStackedBarTable from './KanoStackedBarTable.vue'
    import type { PollAnalysis, FeatureAnalysis } from '@/api/types'

    interface Props { analysis: PollAnalysis }
    const props = defineProps<Props>()
    const copy = useCopy()

    const rows = computed(() => props.analysis.features.map(f => ({
      feature_key: f.feature_key,
      name: f.name,
      description: f.description,
      dominant_categories: f.dominant_categories,
      dominant_percentage: f.dominant_percentage,
      distribution: f.distribution,
      n: Object.values(f.distribution).reduce((a, b) => a + b, 0),
    })))

    const headers = [
      { key: 'feature', title: copy('analysis.table.col.feature') },
      { key: 'dominant', title: copy('analysis.table.col.dominant') },
      { key: 'distribution', title: copy('analysis.table.col.distribution') },
      { key: 'n', title: copy('analysis.table.col.n'), align: 'end' },
    ]

    function dominantLabel(row: FeatureAnalysis): string {
      const pct = row.dominant_percentage
      const pctStr = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
      if (row.dominant_categories.length === 1) return pctStr
      return copy('analysis.dominant.tiedPercent', { pct: pctStr })
    }
    </script>

    <template>
      <v-data-table
        :headers="headers"
        :items="rows"
        density="comfortable"
        :hover="true"
        class="analysis-table"
      >
        <template #item.feature="{ item }">
          <div class="feature-cell">
            <div class="feature-name">{{ item.name }}</div>
            <div class="feature-desc" v-if="item.description">{{ item.description }}</div>
          </div>
        </template>
        <template #item.dominant="{ item }">
          <div class="dominant-cell">
            <div class="pct-text">{{ dominantLabel(item) }}</div>
            <div class="badges">
              <template v-for="(c, idx) in item.dominant_categories" :key="c">
                <CatBadge :category="c" />
                <span v-if="idx < item.dominant_categories.length - 1" class="badge-sep">/</span>
              </template>
            </div>
          </div>
        </template>
        <template #item.distribution="{ item }">
          <div class="dist-cell">
            <KanoStackedBar
              :distribution="item.distribution"
              :total="item.n"
              :aria-labelled-by="`stb-${item.feature_key}`"
              variant="default"
            />
            <KanoStackedBarTable
              :distribution="item.distribution"
              :total="item.n"
              :id="`stb-${item.feature_key}`"
            />
          </div>
        </template>
        <template #item.n="{ item }">
          <span class="tabular-num">{{ item.n }}</span>
        </template>
      </v-data-table>
    </template>

    <style scoped>
    .analysis-table { max-width: 1440px; margin: 0 auto; }
    .feature-name { font-weight: 700; font-size: 14px; color: rgb(var(--v-theme-on-surface)); }
    .feature-desc { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); margin-top: 2px; }
    .pct-text { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .badges { display: flex; gap: 4px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
    .badge-sep { color: rgb(var(--v-theme-on-surface-variant)); font-size: 14px; }
    .tabular-num { font-variant-numeric: tabular-nums; }
    .dist-cell { min-width: 200px; }
    /* Vuetify row-hover is default on; override only if needed */
    </style>
    ```
  - [ ] Per-row `n` derived client-side (sum of distribution values per feature). **Not** the global `total_submissions` — per-feature `n` is count of responses received *for that feature*, which equals `total_submissions` under the FR24 full-submission invariant but could differ if a dev inserts partials. Derive, don't inline the global.
  - [ ] Row click is **not** wired (AC #7). Do NOT add `@click` to rows. Do NOT apply `cursor: pointer`. Add a code comment: `// Row click reserved for post-MVP drill-down (UX spec line 1312).`
- [ ] `AnalysisEmptyState.vue` component (AC: #5)
  - [ ] New file `src/components/AnalysisEmptyState.vue`:
    ```vue
    <script setup lang="ts">
    import { useCopy } from '@/composables/useCopy'
    interface Props { expected?: number }
    const props = defineProps<Props>()
    const copy = useCopy()
    </script>

    <template>
      <div class="analysis-empty">
        <v-card class="empty-card">
          <div class="empty-text">{{ copy('analysis.emptyState', { expected: expected ?? '—' }) }}</div>
        </v-card>
      </div>
    </template>

    <style scoped>
    .analysis-empty { max-width: 1440px; margin: 48px auto; }
    .empty-card { padding: 48px 32px; text-align: center; }
    .empty-text {
      font-size: 16px;
      color: rgb(var(--v-theme-on-surface-variant));
      font-weight: 400;
    }
    </style>
    ```
  - [ ] If `expected` can't be sourced in v1, the template becomes unconditional: `"0 of — expected responses — analysis will populate as responses arrive"` OR drop the count entirely in copy: `"No responses yet — analysis will populate as responses arrive"`. **Pick one** in Dev Notes and document the choice.
- [ ] `AnalysisErrorSurface.vue` component (AC: #10)
  - [ ] New file or inline component within `Analysis.vue`:
    - 404 → `v-card` with `analysis.error.notFound.title` + `analysis.error.notFound.body` + `router.push` link back to `/app/projects/:projectId`
    - 500 / network → `v-alert` with retry button, copy from `analysis.error.load.*`
  - [ ] Uses `useApi`'s typed error classes (Story 1.6 / 3.4 precedent). Do NOT catch `Error` broadly; catch specific subclasses (`NotFoundError`, `ServerError`, `NetworkError`).
- [ ] Analysis-page header (AC: #1, #12)
  - [ ] Header composition in `Analysis.vue`:
    - Title: `{{ project.name }}` (from `projectsStore` — may need an additional fetch; see Dev Notes)
    - Badge: `<v-chip>` with `{{ copy('common.version') }} {{ analysis.epoch }}`
    - Confidence beat: `copy('analysis.confidenceBeat', { total: analysis.total_submissions, expected: '?' })` — secondary-text weight (16 px, `on-surface-variant` color), NOT a banner, NOT `v-alert`
    - Epoch selector (`<EpochSelector>` from Story 2.12) positioned in the header area (UX spec line 636: "top-bar of the analysis page, above the header")
  - [ ] Project name requires the project object — options: (a) fetch `/api/v1/projects/:projectId` alongside the analysis; (b) read from `projectsStore` if already populated from Story 2.3's list fetch; (c) defer to server-side by extending `/analysis` response to include `project_name`. **Decision**: pick (b) — if the user navigated via the PM home (Story 3.7) or project detail (Story 2.9), the store is populated; if not (direct URL entry, fresh tab), fire a parallel `api.get('/projects/:projectId')` on mount. Document the choice.
- [ ] Copy-deck extensions (AC: #8)
  - [ ] `src/copy/en.ts` — add:
    - `analysis.table.col.feature` → `"Feature"`
    - `analysis.table.col.dominant` → `"Dominant"`
    - `analysis.table.col.distribution` → `"Distribution"`
    - `analysis.table.col.n` → `"n"`
    - `analysis.dominant.tiedPercent` → `"{pct} each"`
    - `analysis.emptyState` → `"No responses yet — analysis will populate as responses arrive."` (if dropping `{expected}`; otherwise `"0 of {expected} expected responses — analysis will populate as responses arrive."`)
    - `analysis.confidenceBeat` → `"{total} of {expected} responses"` (or unparameterized if expected unresolvable)
    - `analysis.error.notFound.title` → `"Poll not found"`
    - `analysis.error.notFound.body` → `"The poll URL is invalid or was removed."`
    - `analysis.error.notFound.cta` → `"Back to projects"`
    - `analysis.error.load.title` → `"Couldn't load analysis"`
    - `analysis.error.load.body` → `"Please check your connection and try again."`
    - `analysis.error.load.retry` → `"Retry"`
  - [ ] `docs/copy-deck.md` (Story 1.7) — reflect new keys.
- [ ] Playwright E2E (AC: #11)
  - [ ] New file `kano-frontend/e2e/pm/analysis-page.spec.ts`:
    ```ts
    import { test, expect } from '@playwright/test'
    import AxeBuilder from '@axe-core/playwright'

    test.describe('Analysis page', () => {
      test('renders populated analysis', async ({ page, request }) => {
        // Seed via test API helper: project + 5 features + poll + 20 submissions with known distribution
        const { projectId, pollId } = await seedPopulatedPoll(request)
        await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
        // Header
        await expect(page.getByText(/Version 1/)).toBeVisible()
        await expect(page.getByText(/20 of /)).toBeVisible()
        // Table
        const rows = page.locator('.analysis-table tbody tr')
        await expect(rows).toHaveCount(5)
        // Known-distribution row: feature "feature-a" has 70% Must-have
        const aRow = rows.filter({ hasText: 'feature-a' })
        await expect(aRow).toContainText('70%')
        await expect(aRow.getByText('Must-have')).toBeVisible()
        // Tie row: feature "feature-tie" has 50% each, two badges
        const tieRow = rows.filter({ hasText: 'feature-tie' })
        await expect(tieRow).toContainText('50% each')
        await expect(tieRow.getByText('Must-have')).toBeVisible()
        await expect(tieRow.getByText('Performance')).toBeVisible()
        // axe-core
        const axe = await new AxeBuilder({ page }).analyze()
        expect(axe.violations).toEqual([])
      })

      test('renders empty state', async ({ page, request }) => {
        const { projectId, pollId } = await seedZeroSubmissionPoll(request)
        await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
        await expect(page.getByText(/No responses yet|0 of/)).toBeVisible()
        await expect(page.locator('.analysis-table')).toHaveCount(0)
        const axe = await new AxeBuilder({ page }).analyze()
        expect(axe.violations).toEqual([])
      })

      test('renders 404 on unknown poll', async ({ page }) => {
        await page.goto('/app/projects/00000000-0000-0000-0000-000000000000/polls/00000000-0000-0000-0000-000000000001/analysis')
        await expect(page.getByText(/Poll not found/)).toBeVisible()
        await expect(page.getByRole('link', { name: /Back to projects/ })).toBeVisible()
      })
    })
    ```
  - [ ] Seed helpers: either reuse the `tests/fixtures/*` seeders from prior Playwright specs (Stories 2.9, 3.7) or write minimal inline seeders via direct API POSTs. Do NOT seed through the UI — too slow for E2E.
- [ ] Skeleton loader styling
  - [ ] Use `<v-skeleton-loader type="table">` for the initial fetch (matches architecture §Process Patterns line 732 "Vuetify skeleton loaders only on the analysis-page initial fetch").
  - [ ] Skeleton should roughly match the final layout dimensions (avoid jarring reflow when real data lands).

## Dev Notes

### This story composes 5.1 / 5.2 / 5.3 / 5.4 — the page is the composition, not new primitives

Every primitive on this page exists from earlier stories:
- Analysis payload: Stories 5.1 + 5.2
- `<CatBadge>`: Story 5.3
- `<KanoStackedBar>` + `<KanoStackedBarTable>`: Story 5.4
- `<EpochSelector>`: Story 2.12
- Skeleton loader, copy deck, useApi: Stories 1.6 / 1.7

This story adds the **page-level orchestration**: the route, the data fetch, the header, the empty state, the error surfaces, and the composition logic that picks between them. Resist the temptation to re-solve rendering concerns — consume the primitives as-is and surface bugs in their stories instead of patching them here.

### `total_submissions` vs per-row `n` — reconciling with Story 5.1

Story 5.1 defines `total_submissions` on `PollAnalysis` as the poll-level submission count. Per-row `n` in the analysis table is the count of responses for THAT feature, computed as `sum(distribution.values())` per feature.

Under the FR24 full-submission invariant (Story 4.2), every submission produces exactly one response per active feature, so per-feature `n == total_submissions` for every row. They diverge only under corruption or partials — the table shows the truth per-row; the confidence-beat in the header shows the poll-level total.

Both are correct; neither is redundant. The header answers "how many people answered?", the column answers "how many data points informed this row's percentage?".

### `expected_responses` — the confidence beat number we don't have

UX-DR21 calls for `"{total} of {expected}"`. We have `total_submissions` (from the analysis payload). We do NOT have `expected` anywhere in the data model — polls don't record an "expected respondent count." Looking upstream:

- PRD: no requirement to capture an expected count
- Architecture: schema has no `expected_respondents` column on `polls`
- Epic 3 stories: poll creation doesn't ask for one
- UX spec: shows `"5 of 12 responses"` in flow diagrams but doesn't specify how `12` is derived

**Decision tree for this story**:
1. If a recent story (check the sprint board) added an `expected_count` to polls, use it. Unlikely.
2. If not, pick ONE of:
   - (A) Render `"{total} responses"` only; drop the "of N" entirely from both the header confidence beat AND the empty-state copy. Simpler; no missing data.
   - (B) Render `"{total} of — responses"` with an em-dash placeholder. Communicates "we don't know" honestly.
   - (C) Add an `expected_respondents` field to `polls` (schema change, Alembic migration) and plumb it through — too much scope for this story.

**Recommendation**: (A). The confidence beat's job is to give Paola a signal of response volume; the "of N" is a bonus context that, without N, adds nothing. The copy deck entries above follow (A). If UX review later wants (B) or (C), follow up in a targeted PR.

**Open this as a question** in Dev Agent Record if you disagree with (A); pick it up with the PM before merging.

### Epoch selector — routing semantics

The analysis URL is `/app/projects/:projectId/polls/:pollId/analysis`. The pinned epoch is a property of the **poll** (Story 3.2 pins at creation). The `<EpochSelector>` on this page doesn't change which epoch's analysis runs — that's immutable per poll. What it DOES do: when the project has multiple polls across epochs, the selector navigates between *different pollIds*.

The semantics are:
- Selector shows: current epoch's poll (if one exists), plus prior epochs' polls listed by date
- Selecting an entry: `router.push({ name: 'analysis', params: { pollId: newPollId } })` with the same `projectId`
- Query string `?epoch=N` is NOT required; the selector navigates directly by pollId

This is **different** from Story 2.12's use of `<EpochSelector>` on the project-detail page, where the selector switches which epoch's feature set is displayed. Same component, different parent logic.

Document the split in a code comment pointing at this paragraph.

### Tie rendering — "40% each" + badges joined by "/"

The exact copy from UX spec line 1305: `"40% each"` followed by `"<CatBadge> / <CatBadge>"`. Parse the epic/UX carefully:

- The percentage text is the shared percentage (same value for all tied categories)
- The word "each" clarifies that this isn't 40% total across the tie but 40% per category
- The badges are joined by `" / "` — a space, slash, space (not `" and "`, not comma)
- Three-way ties follow the same pattern: `"33.3% each"` + `<M> / <L> / <E>`

Copy-deck key design:
- `analysis.dominant.tiedPercent` → `"{pct} each"` (the "% each" suffix; pct includes its own % sign)
- Consumer interpolates via `useCopy('analysis.dominant.tiedPercent', { pct: '40%' })` → `"40% each"`

The slash separator between badges is a **template concern**, not a copy-deck string. Coding a separator as a copy string invites i18n breakage for languages with different conjoining conventions; for v1 English, inline the `" / "` in the template is correct. If fr.ts lands, consider a copy key; not now.

### Row click and drill-down

UX spec line 1312 reserves row click for post-MVP. In this story:
- Do NOT apply `cursor: pointer` to rows
- Do NOT emit any click event from `AnalysisTable`
- Do NOT prevent Vuetify's default hover (AC #7 requires hover)

If a future drill-down ships, the row will become interactive and the `cursor: pointer` + click handler + route navigation will be added at that point. Until then, row click is passive.

### `max-width: 1440px` — reuse the Story 3.7 / PM layout container

Story 3.7's PM home poll list uses the same 1440 px container. If Story 3.7 extracted a reusable layout class or component (`.pm-content-container`, `<PmContentFrame>`, etc.), consume it here. If it inlined the max-width, do the same here — do NOT introduce a one-off abstraction. The two surfaces must frame identically so Paola's screenshot workflow produces consistent artifacts.

If Story 3.7 placed the max-width on `PmLayout` itself (Story 1.6), even better — this story just doesn't have to handle it.

### Error handling — use Story 1.6 / 3.4's typed error classes

`useApi()` throws `NotFoundError`, `ServerError`, `NetworkError` (and subclasses per Story 3.4's error taxonomy). The error surface branches on those:

```ts
if (err instanceof NotFoundError) { /* render 404 card */ }
else if (err instanceof NetworkError || err instanceof ServerError) { /* render retry alert */ }
else { /* unexpected — render generic error */ }
```

Do NOT inspect `.status` numeric codes in the page component. Keep the switch at the typed-error level; the numeric code lives inside `useApi`.

### v-data-table density — "comfortable", not "compact"

Vuetify 4's `v-data-table` offers densities `compact` / `comfortable` / `default`. `comfortable` is the closest match to the UX spec's 14 px body + 1.4–1.5 line height (line 531, 542). `compact` squeezes too tight for Paola's scan-style reading. Explicit `density="comfortable"` — don't rely on the default.

### Performance — lazy-loaded primitives

`<KanoStackedBar>` and `<KanoStackedBarTable>` are custom components in `src/components/`. Vue will bundle them into the analysis route's chunk (not the app shell) because Vite code-splits per route and this route is lazy-imported. No additional `defineAsyncComponent` needed.

The analysis page does NOT need to stay under the 150 KB respondent budget (that's `/poll/*` routes only). The PM bundle is permissive; just don't pull in the whole `charts.js` library — we're using inline SVG per architecture line 406.

### Not in scope

- Per-category cross-index panels below the table — Story 5.6
- First-use tooltips on category badges + confidence-beat — Story 5.7
- E2E performance gate on 20×500 — Story 5.8
- Analysis page accessibility close-out (VoiceOver manual) — Story 5.8
- Drill-down navigation from a row — post-MVP
- Side-by-side multi-epoch comparison — post-MVP (UX spec line 636 "one version on screen at a time")
- Export to CSV / PDF — post-MVP (Paola's workflow is screenshot)

### Project Structure Notes

Files:
- `kano-frontend/src/routes/app/Analysis.vue` (new — page component)
- `kano-frontend/src/components/AnalysisTable.vue` (new)
- `kano-frontend/src/components/AnalysisEmptyState.vue` (new)
- `kano-frontend/src/components/AnalysisErrorSurface.vue` (new — or inlined into `Analysis.vue`)
- `kano-frontend/src/router.ts` (extend — register `/analysis` route)
- `kano-frontend/src/copy/en.ts` (extend — table columns, tie percent, empty state, error copy)
- `kano-frontend/src/api/types.ts` (extend — `PollAnalysis`, `FeatureAnalysis` TS types mirroring Story 5.1's Pydantic shape)
- `kano-frontend/e2e/pm/analysis-page.spec.ts` (new — E2E populated + empty + 404 + axe)
- `kano-frontend/docs/copy-deck.md` (update)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR31–FR37] — analysis page, tie handling, empty state
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1] — 3s p95 (full gate is Story 5.8; this story delivers the page)
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — route `/app/projects/:projectId/polls/:pollId/analysis` (line 388)
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] — v-skeleton-loader on analysis-page initial fetch (line 732)
- [Source: _bmad-output/planning-artifacts/architecture.md#State management] — Pinia store access pattern (line 715–720)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision] — Direction 2 Table-Row rationale (lines 600–625)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow 3] — analysis scan user journey (lines 706–729)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Implementation Strategy] — composition over inheritance (line 931)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5] — original AC
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-with-tixeo-vuetify-theme-two-layouts-and-useapi-composable.md] — `useApi` error taxonomy, skeleton loader
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — `useCopy` + interpolation
- [Source: _bmad-output/implementation-artifacts/2-12-epochselector-for-past-epoch-navigation.md] — `<EpochSelector>` component contract
- [Source: _bmad-output/implementation-artifacts/3-7-pm-polls-list-view-as-the-pm-home-screen.md] — PM content container max-width pattern
- [Source: _bmad-output/implementation-artifacts/5-1-services-analysis-build-analysis-with-single-group-by-query.md] — `PollAnalysis` / `FeatureAnalysis` shape; rounding contract
- [Source: _bmad-output/implementation-artifacts/5-2-public-poll-analysis-endpoint.md] — `GET /api/v1/polls/:pollId/analysis` contract
- [Source: _bmad-output/implementation-artifacts/5-3-catbadge-component-for-kano-category-rendering.md] — `<CatBadge>` consumption
- [Source: _bmad-output/implementation-artifacts/5-4-kanostackedbar-svg-with-kanostackedbartable-accessible-fallback.md] — `<KanoStackedBar>` + `<KanoStackedBarTable>` pairing + `aria-labelledby` wiring

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
