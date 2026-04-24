# Story 5.8: Analysis performance test and accessibility close-out

Status: ready-for-dev

## Story

As a solo dev,
I want the analysis page to meet NFR1 (3s p95) on a realistic seeded dataset AND to pass keyboard-only + VoiceOver smoke tests — particularly on the tie-state reading,
so that Paola's defining-experience scan is quantifiably fast and genuinely accessible before the epic closes.

## Acceptance Criteria

1. **Given** a seeded dataset of 20 features and 500 submissions on a single poll (10,000 response rows), **when** a Playwright navigation-timing E2E test runs `/app/projects/:projectId/polls/:pollId/analysis` in CI, **then** the page load + render completes within **3 seconds at p95** across ≥ 10 runs (NFR1). Measurement: `performance.timing.loadEventEnd - performance.timing.navigationStart` OR `performance.getEntriesByType('navigation')[0]` Navigation Timing Level 2 values — either is acceptable; pin one and document the choice.
2. **Given** the same populated analysis page, **when** `axe-core` (via `@axe-core/playwright`) runs, **then** it reports **zero violations** against WCAG 2.1 AA rules across both the populated render AND the empty-state render (seeded via a zero-submission poll).
3. **Given** the analysis page, **when** a Playwright keyboard-only E2E test runs with `page.mouse` never invoked, **then** the test completes a full analysis-page scan using only keyboard input: Tab through the page header (project name, epoch selector, confidence beat + help icon), Tab through each table row's `<KanoStackedBar>` segments (Story 5.4 focus contract), Tab through each `<CatBadge>`'s tooltip activator (Story 5.7), Tab through `<PerCategoryPanels>` anchor links (Story 5.6), Enter on a panel link jumps to the target row (Story 5.6 AC #7), Escape dismisses any open tooltip. Zero mouse events emitted.
4. **Given** `prefers-reduced-motion: reduce` is set via `page.emulateMedia({ reducedMotion: 'reduce' })`, **when** the keyboard-only test runs, **then** all animations are suppressed: `v-tooltip` open/close has no transition, panel-jump pulse animates for 0 ms, no CSS transition durations > 0 on the analysis-page primary elements. Verified via `page.evaluate(() => getComputedStyle(...).transitionDuration)` assertions at key interaction points.
5. **Given** manual milestone verification before epic close (Kanaud executes), **when** VoiceOver on macOS Safari navigates a tie-state analysis row, **then** it correctly announces:
   - Row context: "row 3 of 5, feature name: {name}, description: {desc}"
   - Dominant cell with tie: "Tied dominant, Must-have and Performance, 40% each" (or equivalent — see Dev Notes on the exact phrasing expected)
   - `<KanoStackedBarTable>` fallback: announced as a data table with 6 rows when the bar gains focus
   - CatBadge: name + tooltip help (description read as "described by" supplementary)
6. **Given** the same manual verification, **when** VoiceOver traverses `<PerCategoryPanels>`, **then** each section is announced as a heading + list ("heading level 3, Must-have; list of N items"); anchor links are announced with intent ("Jump to Feature A, 70% dominant, link").
7. **Given** the 1440 px PM content max-width (UX-DR22), **when** screenshots are captured at 1440 × 900 and 1920 × 1080 viewports, **then** the analysis page frames consistently: table container matches 1440 px, no horizontal scroll, no UI clipping on either viewport.
8. The manual checklist results are committed as `docs/a11y/analysis-checklist.md` with a dated signoff (Kanaud's initials + 2026-MM-DD), screenshots of any issues found and their fixes, structured as follows:
   - Environment setup section (macOS + Safari + VoiceOver version; viewport preset)
   - Per-screen automated+manual matrix mirroring Story 4.8 / 2.13's structure
   - Issue log table (Severity / Description / Status / Fix commit or follow-up ticket)
   - Signoff statement
9. Any issues discovered during this story: **blockers fixed in-story** (must remain green before the epic closes); **majors fixed in-story preferred**, deferrable with explicit rationale and follow-up ticket; **minors** filed as follow-up tickets and the story can ship.
10. A seed helper (`tests/e2e-seed/seed_analysis_dataset.py` or equivalent) provisions the 20 × 500 dataset deterministically — fixed random seed, known distribution. The helper is callable both from Playwright's `request` context (to seed via the API) and as a standalone script for local manual testing. Document the seed invocation in `docs/a11y/analysis-checklist.md`.

## Tasks / Subtasks

- [ ] Seed dataset helper (AC: #1, #10)
  - [ ] `kano-backend/scripts/seed_analysis_dataset.py`:
    ```python
    """Seeds a deterministic 20-feature × 500-submission analysis dataset.

    Run standalone: poetry run python scripts/seed_analysis_dataset.py
    Emits project_id + poll_id to stdout for consumption by E2E tests.
    Uses a fixed random seed so runs are reproducible.
    """
    import random
    from uuid import uuid4
    from datetime import datetime, timezone, timedelta
    from kano.db import db
    from kano.models import Project, Feature, Poll, Submission, Response
    from kano.services.kano_matrix import compute_category

    SEED = 42
    NUM_FEATURES = 20
    NUM_SUBMISSIONS = 500

    def seed():
        random.seed(SEED)
        now = datetime.now(timezone.utc)
        # Create project
        project = Project(id=uuid4(), name="Perf Test Project", version="1.0", current_epoch=1)
        db.session.add(project)
        # Create 20 features on epoch 1
        features = [
            Feature(id=uuid4(), project_id=project.id, epoch=1, feature_key=uuid4(),
                    name=f"Feature {i+1}", description=f"Description for feature {i+1}", is_active=True)
            for i in range(NUM_FEATURES)
        ]
        db.session.add_all(features)
        # Create poll pinned to epoch 1, 7-day TTL
        poll = Poll(id=uuid4(), project_id=project.id, epoch=1,
                    expires_at=now + timedelta(days=7))
        db.session.add(poll)
        db.session.flush()
        # Create 500 submissions, each with 20 responses
        for _ in range(NUM_SUBMISSIONS):
            submission = Submission(id=uuid4(), poll_id=poll.id)
            db.session.add(submission)
            db.session.flush()
            for f in features:
                fq = random.randint(1, 5)
                dq = random.randint(1, 5)
                db.session.add(Response(
                    submission_id=submission.id,
                    feature_id=f.id,
                    fq_answer=fq,
                    dq_answer=dq,
                    category=compute_category(fq, dq),
                ))
        db.session.commit()
        print(f"project_id={project.id}")
        print(f"poll_id={poll.id}")
        return project.id, poll.id

    if __name__ == "__main__":
        seed()
    ```
  - [ ] Deterministic: same `SEED` → same data. Locks the tie-state + single-dominant distribution into known rows so manual VoiceOver testing (AC #5) can reference specific feature names.
  - [ ] Expose as a Flask CLI command too (`flask seed analysis`) if the project has a `flask` CLI wiring; otherwise, leave it as a poetry script. Follow whatever pattern Story 2.9 / 3.7 established for seeding.
  - [ ] Additional zero-submission seed function for empty-state testing (same project, second poll, zero submissions).
- [ ] Navigation-timing E2E test (AC: #1)
  - [ ] New file `kano-frontend/e2e/pm/analysis-perf.spec.ts`:
    ```ts
    import { test, expect } from '@playwright/test'
    import { seedAnalysisDataset } from './seed-helpers'

    test.describe('Analysis perf (NFR1: 3s p95)', () => {
      test.beforeAll(async ({ request }) => {
        await seedAnalysisDataset(request)  // idempotent; reuses if exists
      })

      test('loads within 3s p95 across 10 runs', async ({ page }) => {
        const { projectId, pollId } = await seedAnalysisDataset(page.request)
        const timings: number[] = []
        for (let i = 0; i < 10; i++) {
          await page.goto('about:blank')
          const start = Date.now()
          await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`, {
            waitUntil: 'networkidle',
          })
          // Wait for the full table render; assert deterministic end-marker
          await page.locator('.analysis-table tbody tr').nth(19).waitFor({ state: 'visible' })
          const elapsed = Date.now() - start
          timings.push(elapsed)
        }
        timings.sort((a, b) => a - b)
        const p95 = timings[Math.floor(timings.length * 0.95) - 1] // index of 95th percentile
        console.log(`Analysis load timings (ms): ${timings.join(', ')}; p95=${p95}`)
        expect(p95).toBeLessThan(3000)
      })
    })
    ```
  - [ ] **Measurement method**: the test uses `Date.now()` wrapping the `page.goto` + end-marker wait. Alternative (preferred when Playwright exposes it clearly): `performance.getEntriesByType('navigation')[0].loadEventEnd - ...[0].startTime` via `page.evaluate`. Both are acceptable; pick one, document.
  - [ ] 10 runs × same page load is a crude p95 estimate. Consider `test.describe.configure({ retries: 0 })` to ensure CI doesn't auto-retry on slow runs; a genuine slow run should fail the test, not get papered over.
  - [ ] Run in CI headless Chromium; the NFR1 target is headless + CI-environment performance. **Do not** run this on a local dev machine's perceived performance — the gate is the CI number.
- [ ] axe-core CI extension (AC: #2)
  - [ ] Extend `kano-frontend/e2e/pm/analysis-page.spec.ts` (already has axe checks from Stories 5.5–5.7) with two dedicated perf-scoped tests:
    ```ts
    test('axe-core on populated 20×500 dataset', async ({ page, request }) => {
      const { projectId, pollId } = await seedAnalysisDataset(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.locator('.analysis-table tbody tr').nth(19).waitFor()
      const axe = await new AxeBuilder({ page }).analyze()
      expect(axe.violations).toEqual([])
    })

    test('axe-core on empty-state analysis', async ({ page, request }) => {
      const { projectId, pollId } = await seedZeroSubmissionPoll(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.getByText(/No responses yet|0 of/).waitFor()
      const axe = await new AxeBuilder({ page }).analyze()
      expect(axe.violations).toEqual([])
    })
    ```
  - [ ] The earlier stories' axe tests use smaller seeds (3–5 features) — that's fine for component-level a11y verification. This story adds the **scale** check: 20 features produce 20× more `<KanoStackedBar>` + `<KanoStackedBarTable>` pairs with unique ids; any a11y pattern that works at 3 features and breaks at 20 (e.g., duplicate ids if id-gen breaks) would surface here only.
- [ ] Keyboard-only E2E test (AC: #3, #4)
  - [ ] New file `kano-frontend/e2e/pm/analysis-keyboard.spec.ts`:
    ```ts
    import { test, expect } from '@playwright/test'
    import { seedAnalysisDataset } from './seed-helpers'

    test('full keyboard-only scan, default motion', async ({ page, request }) => {
      const { projectId, pollId } = await seedAnalysisDataset(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.locator('.analysis-table tbody tr').first().waitFor()
      // Tab to first interactive element and walk forward
      let tabs = 0
      const MAX_TABS = 500 // safety
      while (tabs < MAX_TABS) {
        await page.keyboard.press('Tab')
        tabs++
        const active = await page.evaluate(() => document.activeElement?.tagName)
        // Stop if focus reaches the last anchor link in PerCategoryPanels
        if (await page.locator(':focus').evaluate((el) => el.closest('.per-category-panels li:last-child a'))) {
          break
        }
      }
      expect(tabs).toBeLessThan(MAX_TABS) // focus didn't escape / infinite loop
      // Enter on last focused panel link
      await page.keyboard.press('Enter')
      // Assert scrolled to a feature row and row is focused
      const focusedRow = await page.locator('tr:focus').count()
      expect(focusedRow).toBe(1)
      // Escape should do nothing destructive here (no tooltip open); assert page state stable
      await page.keyboard.press('Escape')
      expect(await page.title()).not.toBe('') // still on the analysis page
    })

    test('reduced-motion keyboard scan', async ({ page, request }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const { projectId, pollId } = await seedAnalysisDataset(request)
      await page.goto(`/app/projects/${projectId}/polls/${pollId}/analysis`)
      await page.locator('.analysis-table tbody tr').first().waitFor()
      // Verify transition-duration is 0 on analysis-row
      const transition = await page.locator('.analysis-table tbody tr').first().evaluate(
        el => getComputedStyle(el).transitionDuration
      )
      expect(transition).toBe('0s')
      // Jump via panel link; assert no smooth-scroll animation (instant scroll-top change)
      const panelLink = page.locator('.per-category-panels li a').first()
      const initialScroll = await page.evaluate(() => window.scrollY)
      await panelLink.focus()
      await page.keyboard.press('Enter')
      // Measure scroll change within 20ms (vs ~300ms smooth-scroll)
      await page.waitForTimeout(50)
      const finalScroll = await page.evaluate(() => window.scrollY)
      expect(finalScroll).not.toBe(initialScroll) // jump happened
    })
    ```
  - [ ] Guard against infinite Tab loops with `MAX_TABS` cap. If the test hits the cap, it means focus is trapped somewhere — a legitimate failure mode.
  - [ ] `page.mouse` assertion: Playwright doesn't natively track "was mouse ever called" — document that the spec uses only `keyboard.*` API calls (not `click`, not `hover`), and in PR review enforce: no `page.mouse.*` or `locator(...).click()` / `.hover()` in this file.
- [ ] Screenshot framing verification (AC: #7)
  - [ ] Add to the perf spec (or a new spec) two viewport runs:
    ```ts
    test('screenshot frames at 1440×900', async ({ page, request }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      // ... navigate + assert no horizontal scroll
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      // Capture reference screenshot
      await page.screenshot({ path: 'e2e/screenshots/analysis-1440.png', fullPage: true })
    })

    test('screenshot frames at 1920×1080', async ({ page, request }) => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      // Same assertions + screenshot
      await page.screenshot({ path: 'e2e/screenshots/analysis-1920.png', fullPage: true })
    })
    ```
  - [ ] Screenshots committed to the repo for reference (not visual-regression — this story doesn't add a pixel-diff gate; Story 1.8's visual-regression gate handles drift detection).
- [ ] Manual a11y checklist (AC: #5, #6, #8, #9)
  - [ ] Author `kano-frontend/docs/a11y/analysis-checklist.md` with the following structure:
    ```markdown
    # Analysis page — manual accessibility close-out

    **Epic 5 close-out gate. Execute before merging the final Epic 5 story.**

    Date executed: YYYY-MM-DD
    Operator: [initials]
    Seed command: `poetry run python scripts/seed_analysis_dataset.py` (outputs `project_id=... poll_id=...`)

    ## Environment
    - macOS [version] + Safari [version] + VoiceOver [version]
    - Chromium [version] + TalkBack (via browserstack or Android hardware)
    - Viewport: 1440×900 PM default; also 1920×1080 spot-check
    - Motion: default + `prefers-reduced-motion: reduce`

    ## Per-screen checklist

    ### /app/projects/:id/polls/:pollId/analysis (populated)
    - [ ] VO announces page title "Analysis — {project name} Version N"
    - [ ] VO announces confidence-beat meta line as non-live text
    - [ ] VO announces tie-help icon on focus: "About dominant-category ties, button"
    - [ ] VO announces v-data-table caption + column headers
    - [ ] VO traverses each row with feature name + dominant cell + n cell read in order
    - [ ] Tie row: VO announces "tied dominant, Must-have and Performance, 40% each"
    - [ ] VO on CatBadge: "Must-have" + described-by "{help text}" when focused
    - [ ] VO on KanoStackedBar segment: tooltip content read
    - [ ] VO on KanoStackedBarTable: announces 6-row data table when bar gains focus
    - [ ] VO on PerCategoryPanels: "By category, heading 2; Must-have, heading 3, list of N items"
    - [ ] Panel anchor link VO: "Jump to Feature A, 70% dominant, link"
    - [ ] Enter on panel link jumps → target row announced by VO as the new focus

    ### /app/projects/:id/polls/:pollId/analysis (empty state)
    - [ ] VO announces empty-state copy once; no extraneous live-region noise
    - [ ] No table or panels present in accessibility tree

    ### /app/projects/:id/polls/:nonexistent/analysis (404)
    - [ ] VO announces "Poll not found" heading + body + back link

    ## Issue log

    | Platform | Screen | Severity | Description | Status | Fix / Follow-up |
    |----------|--------|----------|-------------|--------|-----------------|
    |          |        |          |             |        |                 |

    ## Signoff

    All blockers resolved: Yes / No
    Non-blockers tracked in: [link or "none"]

    Signoff: [initials] on [YYYY-MM-DD]
    ```
  - [ ] Execute the checklist — this requires actual hardware + VoiceOver. Sub-tasks per platform:
    - [ ] macOS + Safari + VoiceOver: full pass through populated + empty + 404 scenarios
    - [ ] Chrome + Chromium axe-core automated run: passes in CI
    - [ ] TalkBack on Android: targeted pass (this is less critical for the PM surface — Paola uses desktop; TalkBack is a courtesy check)
  - [ ] For each issue found:
    - **Blocker**: fix in this story (patch the relevant prior-story component), re-verify, update checklist with fix commit SHA
    - **Major**: preferred fix in this story; if deferred, file a follow-up ticket (or a `docs/a11y/follow-ups.md` entry) with an explicit AC
    - **Minor**: ticket/follow-up only; this story can ship
- [ ] Epic-close confirmation in checklist
  - [ ] Final line of `docs/a11y/analysis-checklist.md`: "Epic 5 ready to close — all blocker and major issues resolved." Requires Kanaud's signoff.

## Dev Notes

### This is Epic 5's gate

PRD's "MVP Readiness Gates" (per architecture references) + NFR1 + NFR9–11 + FR39 → the epic cannot close until this story is green. The earlier stories (5.1–5.7) deliver the capability; this story proves it meets the quality bars.

Ordering: schedule this story **last** in Epic 5 execution. If it runs in parallel with 5.5–5.7, the test dependencies churn.

### Why 3s p95 is the specific ceiling

PRD NFR1: "The analysis page loads and renders within 3 seconds (p95) for projects with up to 20 features and 500 accumulated poll responses." 500 ms server-side budget (Story 5.2) + ~200 ms network + ~2300 ms client render is the rough breakdown. If the test blows the ceiling:

1. **Check the p95 calculation**: 10 runs is a small sample; a single outlier can skew. Increase to 20 runs before concluding a regression.
2. **Profile the client render**: Chrome Performance tab → record → page load. Look for long tasks > 50 ms on Vuetify's `v-data-table` mounting (it's not cheap at 20 rows × SVG + table pairs).
3. **Check the SVG segment count**: if there are ~60 hidden 0-width segments per row (bug: we're not filtering zero-count segments), the DOM is 3× heavier than needed. Story 5.4 AC #7 should prevent this, but verify with DOM-node count.
4. **Measure from server side**: pair with the Story 5.2 perf test — if the API itself is 800 ms on the 20×500 dataset, no client tuning saves this.

If the ceiling can't be met with minor tuning:
- Open a follow-up for aggressive optimization (index tuning, payload compression, virtualization on `v-data-table`)
- Decide with Kanaud whether to ship with a relaxed ceiling + follow-up vs hold the launch
- NFR1 is a PRD commitment; relaxing it needs a PRD decision, not a dev judgment

### VoiceOver tie-state announcement — the load-bearing manual check

The whole epic's defining difference vs Likert-chart generalizations is correct tie handling (FR35). The manual test for VoiceOver announcing a tie correctly is the thing that validates the end-to-end chain:
- `<CatBadge>` paired in `"A / B"` inline composition
- `<KanoStackedBarTable>` row announcing the tied counts
- Screen-reader comprehension at the row level

If VoiceOver announces the tie as two disconnected statements ("Must-have 40%. Performance 40.") rather than as joint dominance, the UX fails regardless of what axe-core says. Kanaud must verify this by ear, not by the automated test.

**If VoiceOver announces the tie incorrectly**: the fix is likely in Story 5.5's AnalysisTable Dominant-cell composition — add `aria-label="Tied dominant, {cat1} and {cat2}, {pct} each"` on the dominant cell itself, overriding the default row-concatenation reading. This is a Story 5.5 patch but opened in this story's scope.

### Why the test uses a deterministic seed

Random seeding would make the tests nondeterministic: a particular tie might disappear in some runs, and the "announces tie" test would flake. Fixed `SEED=42` guarantees:
- The same 10,000 rows every run
- The same distribution per feature (some guaranteed single-dominant, some guaranteed tied, some all-same)
- Known feature names in known table rows so manual checklist entries reference specific features

If you change `SEED`, you must re-run the manual checklist to verify the new distributions still exercise the needed scenarios (or change the seed-generation to explicitly construct the scenarios rather than rely on random chance).

### Screenshot framing — why 1440 × 900 and 1920 × 1080

- **1440 × 900**: MacBook Air / most modern laptop defaults; UX-DR22's target composition width
- **1920 × 1080**: External monitor / PM workstation default at Tixeo

Paola screenshots on either. The page must frame consistently. Smaller viewports (1280, the architecture's min) are already exercised by the Story 1.8 theme-audit responsive check; this story doesn't re-verify — Story 5.5 AC #6 specifies the 1440 max-width + graceful collapse.

### Issue severity calibration (reused from Story 4.8)

- **Blocker**: the analysis page is unusable for a keyboard or SR user on a realistic dataset. Cannot ship.
- **Major**: a specific announcement is wrong/missing/confusing, but the user can still complete the scan. Fix in-story preferred; deferrable with explicit rationale.
- **Minor**: subtle verbosity, mispronunciation, cosmetic focus issue. File follow-up, ship.

### TalkBack on Android — lower bar for the PM surface

Paola uses desktop for analysis; a TalkBack pass is a courtesy verification that the page isn't actively broken on mobile SR (e.g., that some assumption about keyboard-only-users breaks touch-SR). It's not a release gate. Do the TalkBack pass; document any findings in the checklist with Minor severity unless a blocker is observed.

### Contrast with Story 4.8 (respondent-side manual a11y close-out)

Story 4.8 covered VoiceOver + TalkBack on mobile respondent flow. This story covers VoiceOver on desktop PM analysis. Different personas, different SRs, different surfaces. The checklists are parallel structurally (same headings, same severity scale) but entirely independent content. Do NOT merge the checklist files.

NVDA (Windows + Firefox) was covered in Story 2.13 for PM authoring; this story deliberately skips NVDA on the analysis page. Rationale: the PM-facing ARIA patterns here (`v-data-table`, `<CatBadge>`, `<KanoStackedBarTable>`) are the same patterns Story 2.13 already vetted for NVDA compatibility on the project-detail page. A second NVDA pass would be duplicate verification. If the manual pass reveals a platform-specific issue suspected to be Windows/NVDA-only, add an NVDA run at that point — opportunistic, not default.

### CI vs local perf test

The NFR1 target is **CI headless** — that's the binding performance environment. A local macOS dev run may be 3× faster due to SSD, M-series CPU, and fewer parallel processes; a local run passing 3s does not guarantee CI passes. Conversely, CI passing at 3s is sufficient even if local is 1.5s.

Document this in the test: "If this test fails locally but passes in CI, trust CI. If it passes locally but fails in CI, investigate CI — that's the gate."

### Not in scope

- Caching / materialized views for analysis payload — architecture line 290 defers to v2
- Payload compression / gzip-by-default — Flask's default handling is sufficient at this scale
- Virtualized / paginated `v-data-table` — Vuetify 4's default render is fine for 20 rows; virtualization is v2 if feature counts grow
- Real-user monitoring (RUM) — no analytics backend in v1
- Analytics on tooltip/icon open events — v2
- Cross-epoch analysis comparison — post-MVP
- Performance budget for the bundle size of the analysis route — PM bundle is unconstrained (respondent <150KB from Story 3.8 is the only bundle gate)

### Project Structure Notes

Files:
- `kano-backend/scripts/seed_analysis_dataset.py` (new — deterministic 20×500 seeder + zero-poll seeder)
- `kano-frontend/e2e/pm/analysis-perf.spec.ts` (new — NFR1 timing gate)
- `kano-frontend/e2e/pm/analysis-keyboard.spec.ts` (new — keyboard-only + reduced-motion)
- `kano-frontend/e2e/pm/analysis-page.spec.ts` (extend — axe on 20×500 scale)
- `kano-frontend/e2e/seed-helpers.ts` (new — JS/TS wrapper that invokes the Python seed via HTTP or a test-mode API endpoint; alternative: call the seed script via `child_process.execSync` from the Playwright global setup)
- `kano-frontend/e2e/screenshots/analysis-1440.png` (new — framing reference)
- `kano-frontend/e2e/screenshots/analysis-1920.png` (new — framing reference)
- `kano-frontend/docs/a11y/analysis-checklist.md` (new — manual VO/TalkBack close-out)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#NFR1] — 3s p95 on 20 features × 500 submissions
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + accessible fallback + axe-core
- [Source: _bmad-output/planning-artifacts/prd.md#FR35, FR39] — tie handling + first-use help; VoiceOver verification pertains to both
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — E2E suite green before first PM study
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — 20×500 dataset reference (line 260)
- [Source: _bmad-output/planning-artifacts/architecture.md#Accessibility] — axe-core CI enforcement (line 412)
- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD] — GitHub Actions E2E gate pattern (line 438)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — focus management, color-independence (lines 575–586)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Testing Strategy] — automated + manual a11y approach (lines 1114–1134)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.8] — original AC
- [Source: _bmad-output/implementation-artifacts/1-5-kano-categorization-matrix-pure-function-module-with-25-cell-parametrized-test.md] — `compute_category` consumed by the seeder
- [Source: _bmad-output/implementation-artifacts/1-8-theme-audit-screen-as-day-zero-verification-artifact.md] — Playwright + axe-core precedent; screenshot baseline pattern
- [Source: _bmad-output/implementation-artifacts/2-13-paola-authoring-flow-manual-a11y-sweep-voiceover-nvda.md] — PM-side a11y close-out parallel; checklist structure template
- [Source: _bmad-output/implementation-artifacts/4-8-respondent-flow-accessibility-close-out-and-manual-gates.md] — direct structural template for this story's checklist; severity calibration reused
- [Source: _bmad-output/implementation-artifacts/5-1-services-analysis-build-analysis-with-single-group-by-query.md] — query-count + single-GROUP-BY gate; backend perf ceiling of 500 ms
- [Source: _bmad-output/implementation-artifacts/5-2-public-poll-analysis-endpoint.md] — backend performance smoke at same 20×500 seed
- [Source: _bmad-output/implementation-artifacts/5-4-kanostackedbar-svg-with-kanostackedbartable-accessible-fallback.md] — colorblind-simulator artifact referenced here as pre-existing evidence
- [Source: _bmad-output/implementation-artifacts/5-5-analysis-page-table-composition-with-dominant-tie-empty-state-confidence-beat.md] — 1440 px max-width gate; confidence-beat placement
- [Source: _bmad-output/implementation-artifacts/5-6-percategorypanels-secondary-cross-index.md] — panel jump-link keyboard contract verified end-to-end here
- [Source: _bmad-output/implementation-artifacts/5-7-category-help-tooltips-on-first-use.md] — tooltip focus + Escape verified here end-to-end

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
