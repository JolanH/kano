---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/prd.md
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/architecture.md
  - /home/tixeo/Projects/perso/kano/_bmad-output/planning-artifacts/ux-design-specification.md
---

# kano - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for kano, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Project Management**

- **FR1:** A PM can create a project with a name and a version.
- **FR2:** A PM can view a list of all projects in the system.
- **FR3:** A PM can view a project's details including name, version, current epoch, and active feature list.
- **FR4:** A PM can edit a project's name and version; these edits do not trigger an epoch bump.
- **FR5:** A PM can add a feature (name + description) to a project.
- **FR6:** A PM can edit an existing feature's name and/or description.
- **FR7:** A PM can delete a feature from a project's active feature list.

**Project Versioning & Epoch Integrity**

- **FR8:** The system automatically increments a project's epoch when any change is made to the project's list of features (addition, edit, or deletion).
- **FR9:** The system preserves the feature set of every prior epoch unchanged when a new epoch is created.
- **FR10:** The system retains soft-deleted features in their original epoch so prior polls can still reference them; soft-deleted features do not appear in subsequent epochs.
- **FR11:** Before applying a feature change that will trigger an epoch bump, the system displays a confirmation dialog stating that existing polls will remain pinned to the prior epoch, and requires explicit PM acknowledgement before proceeding.
- **FR12:** A PM can view the feature list of any past epoch of a project.

**Poll Generation & Lifecycle**

- **FR13:** A PM can generate a poll for a project; the poll is pinned to the project's current epoch at the moment of creation.
- **FR14:** The system issues a unique, publicly reachable URL for each poll.
- **FR15:** A poll URL automatically expires 7 days after the poll is created.
- **FR16:** The system rejects poll submissions made against an expired URL.
- **FR17:** A PM can generate two or more polls for the same project, each pinned independently to an epoch.
- **FR18:** A PM can view the list of polls associated with a project, including the epoch each poll is pinned to.

**Poll Participation (Respondent)**

- **FR19:** A respondent with a poll URL can access the poll landing page without authentication.
- **FR20:** A respondent can see the list of features for the poll, each with its name and description rendered in plain language (no methodology jargon).
- **FR21:** A respondent can answer, for each feature, two questions: a functional question ("how do you feel if this feature is available") and a dysfunctional question ("how do you feel if this feature is not available").
- **FR22:** A respondent answers each question using a 5-point Likert scale with plain-language labels.
- **FR23:** A respondent sees a progress indicator while answering the poll.
- **FR24:** A respondent can submit a completed poll; the system accepts a submission only if all questions for all features have been answered.
- **FR25:** The system discards any partially-completed submission — incomplete submissions are not persisted.
- **FR26:** A respondent receives a confirmation page after a successful submission.
- **FR27:** A respondent visiting an expired poll URL sees an expired-poll page indicating the poll is closed and a contact off-ramp link to the product team.

**Response Categorization**

- **FR28:** For each answered feature in a submitted poll, the system computes a Kano category (Mandatory, Linear, Exciter, Indifferent, Contradictory, or Doubtful) from the functional and dysfunctional answers using the specified categorization matrix.
- **FR29:** The system persists each response with three fields per feature: `FQ_ANSWER` (1–5), `DQ_ANSWER` (1–5), and `CATEGORY` (M/L/E/I/C/D).
- **FR30:** Each stored response is linked to exactly one poll instance.

**Analysis & Visualization**

- **FR31:** A PM can view the analysis page for any specific poll instance.
- **FR32:** The analysis page is publicly accessible to anyone who has the poll URL (no authentication).
- **FR33:** The analysis page displays, for each feature of the poll's pinned epoch, a horizontal stacked bar representing the distribution of Kano categories across the poll's responses for that feature.
- **FR34:** Alongside each feature's stacked bar, the analysis page displays the dominant category and its percentage.
- **FR35:** When two or more categories are tied for dominance on a feature, the analysis page displays all tied dominant categories together with their shared percentage.
- **FR36:** The analysis page displays a per-category panel listing the features for which that category is dominant, with each feature annotated by its dominant-category percentage.
- **FR37:** The analysis page displays a dedicated empty-state message when the poll has zero responses; empty stacked bars and zero-percent dominant categories are not rendered.

**Guidance & Onboarding**

- **FR38:** The PM-facing analysis page displays category labels using full human-readable names (e.g., "Must-have", "Delighter") alongside any short letter codes.
- **FR39:** The PM-facing analysis page provides on-demand explanatory content (tooltips or help) describing each Kano category and the meaning of a dominant-category tie, available on first use without dependency on human pairing.

### NonFunctional Requirements

**Performance**

- **NFR1:** The analysis page loads and renders within 3 seconds (p95) for projects with up to 20 features and 500 accumulated poll responses, as measured by Playwright navigation timing in CI on a seeded 20-feature × 500-response dataset.
- **NFR2:** A typical respondent (8-feature poll) completes submission in under 3 minutes (measured post-first-study; no hard pre-launch target).
- **NFR3:** The analysis endpoint executes its aggregation in a single SQL round-trip regardless of feature or response count — no per-feature iteration in the application layer.

**Security**

- **NFR4:** The system enforces CSRF protection on all state-changing requests from the PM-facing SPA.
- **NFR5:** Session cookies are configured with `SameSite=Lax` (or stricter) and `Secure` attributes in production.
- **NFR6:** The backend applies a CORS origin allowlist; wildcard origins (`*`) are forbidden.
- **NFR7:** All user inputs are validated server-side and rendered safely — no XSS, no SQL injection.
- **NFR8:** No personally identifiable information (PII) is collected from poll respondents; persisted responses contain only numeric Likert answers and the derived category.

**Accessibility**

- **NFR9:** Both the PM-facing and respondent-facing UIs conform to WCAG 2.1 Level AA.
- **NFR10:** The per-feature stacked-bar visualization is paired with an accessible data-table fallback that is programmatically hidden from sighted users but available to screen readers.
- **NFR11:** `axe-core` automated accessibility checks run on every CI build; new violations block merge.

**Reliability & Data Durability**

- **NFR12:** Daily automated `pg_dump` backups are written to a separate volume from the primary PostgreSQL data directory.
- **NFR13:** The restore process is validated (restore-test executed at least once) before the first PM study is launched.
- **NFR14:** All timestamp values are stored in UTC using PostgreSQL `TIMESTAMPTZ`; no local-time columns anywhere.

**Observability**

- **NFR15:** The backend emits structured request logs including, at minimum: timestamp, request ID, method, path, status code, duration.
- **NFR16:** The PostgreSQL slow-query log is enabled in production with a threshold of 500 ms.

**Portability & Deployment**

- **NFR17:** The full stack (Flask API, Vue SPA, PostgreSQL) boots from a single `docker compose up` command on a clean checkout for local development.
- **NFR18:** Alembic manages all database schema migrations from commit #1; no hand-edited schema is permitted.

### Additional Requirements

**Starter templates (Architecture — first implementation story):**

- **AR1:** Scaffold frontend via `npm create vuetify@latest kano-frontend` with TypeScript, Vue Router, Pinia, Vitest, ESLint, Prettier.
- **AR2:** Scaffold backend via `poetry new kano-backend --src` + manual Flask app-factory wiring (Flask 3.1, SQLAlchemy 2, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, Flask-WTF, psycopg2-binary; dev: pytest, pytest-cov, pytest-flask, factory-boy, alembic).

**Locked stack (PRD + Architecture):**

- **AR3:** Frontend: Vue 3.5+, Vuetify 4.x, TypeScript, Vite 6+.
- **AR4:** Backend: Python 3.12, Flask 3.1.x, SQLAlchemy 2.x, Pydantic 2 for request/response validation.
- **AR5:** Database: PostgreSQL 17.x single-node via `postgres:17` Docker image.

**Schema & data model (D4 — most irreversible artifact):**

- **AR6:** Lock the 5-table domain schema (`projects`, `features`, `polls`, `submissions`, `responses`) in Alembic migration `0001_initial_schema.py` — per-epoch feature rows with stable `feature_key`, poll→(project_id, epoch) FK, atomic submission→responses PK, CHECK constraints on `fq_answer`, `dq_answer`, `category`.
- **AR7:** Mandatory indexes from commit #1: `feature(project_id, epoch)`, `poll(project_id, epoch)`, `poll(expires_at)` partial, `submission(poll_id)`, `response(submission_id, feature_id)` PK.
- **AR8:** Application-generated UUIDv4 IDs (never DB `gen_random_uuid()`); SQLAlchemy declarative models named `Project`, `Feature`, `Poll`, `Submission`, `Response`.

**Epoch service contract:**

- **AR9:** Single centralized `services/epoch_service.bump_epoch_on_feature_change()` — every feature mutation endpoint routed through it; PR checklist enforces.

**Kano categorization:**

- **AR10:** `services/kano_matrix.compute_category(fq, dq) -> Category` as pure-function module; 25-cell parametrized matrix test freezes the spec.

**Analysis query (NFR3 enforcement):**

- **AR11:** `services/analysis.build_analysis(poll_id)` executes one `GROUP BY feature_id, category` round-trip; integration test asserts query count == 1.

**API & communication:**

- **AR12:** REST `/api/v1/*` with JSON snake_case wire format; OpenAPI spec hand-maintained at `kano-backend/openapi.yaml`, served at `/api/docs` via static Swagger UI.
- **AR13:** RFC 7807 Problem Details error envelope (`application/problem+json`) with `type`, `title`, `status`, `detail`, `instance`, `request_id`; mapped per domain exception in `api/errors.py`.
- **AR14:** Request-ID middleware generates UUIDv4 per request, binds to structlog, returns `X-Request-ID` header, included in every Problem Details payload.

**Security middleware:**

- **AR15:** Flask-WTF `CSRFProtect` enabled on `/app/*` state-changing endpoints; respondent `POST /api/v1/polls/<uuid>/submit` and analysis reads CSRF-exempt.
- **AR16:** `GET /api/v1/csrf-token` endpoint returns the token for SPA bootstrap; PM cookie issued `HttpOnly`, `Secure` (prod), `SameSite=Lax`.
- **AR17:** Flask-CORS configured with explicit production origin allowlist (no wildcards); 24h preflight cache; `X-CSRF-Token` and `Content-Type` in allowed headers.

**Poll URL opacity:**

- **AR18:** Public poll URL is `/poll/<uuid>` with UUIDv4 (~122 bits entropy); served by Flask route `<uuid:poll_id>` converter.

**Health endpoint (Architecture G1):**

- **AR19:** `GET /api/v1/health` returns `{"status": "ok", "version": "<git-sha>", "db": "connected"}`; no auth, no CSRF; returns 503 if DB `SELECT 1` fails.

**Observability:**

- **AR20:** structlog JSON to stdout; one `INFO` request-completion line per request with keys `timestamp`, `level`, `request_id`, `event`, `method`, `path`, `status`, `duration_ms`; no PII; `console.log` forbidden in frontend (ESLint `no-console: error`).

**Infrastructure & deployment:**

- **AR21:** Single Hetzner Cloud VPS (EU data residency); docker-compose services: `web` (Caddy + Vue dist), `api` (Flask + gunicorn), `db` (postgres:17), `backup` (cron).
- **AR22:** Caddy terminates TLS via automatic Let's Encrypt ACME; HTTP→HTTPS redirect; HSTS (1-year max-age, prod only).
- **AR23:** GitHub Actions CI: on PR run lint (ESLint, Prettier, Ruff, Black), typecheck (vue-tsc, mypy), pytest, Vitest, Playwright + axe-core, Alembic forward+rollback smoke, `docker compose up -d --wait` smoke, `size-limit` bundle-size gate.
- **AR24:** GitHub Actions CD: on merge to main build+push to `ghcr.io`, SSH deploy to Hetzner, `docker compose pull && up -d && exec api alembic upgrade head`.
- **AR25:** `.env.example` checked in with placeholders; `.env` gitignored; prod secrets via host environment variables.

**Backups & restore drill:**

- **AR26:** Nightly `pg_dump -Fc` cron in `backup` service to a separate Hetzner Volume mounted at `/backups`; 14-day rolling retention.
- **AR27:** Restore-drill procedure documented at `ops/restore-drill.md`; executed once before first PM study and before any major migration.

**Route-level code split (respondent-lean bundle):**

- **AR28:** Vite route-level code splitting — `/app/*` (PM) vs `/poll/*` (respondent) chunks; respondent initial bundle <150 KB gzipped enforced via `size-limit` CI gate (`kano-frontend/.size-limit.json`).

**PM CSRF token distribution (Architecture G2):**

- **AR29:** SPA `useCsrf()` composable fetches token from `/api/v1/csrf-token` on first `/app/*` navigation; `useApi()` injects `X-CSRF-Token` on non-GETs.

**QR-code client rendering:**

- **AR30:** QR generation via the `qrcode` npm library, lazy-loaded inside `<poll-share-panel>` only (respondent bundle must not import it).

**Development experience:**

- **AR31:** `docker compose up` single-command boot on clean checkout (NFR17); Vite HMR on frontend; Flask debug mode on backend via dev flag; `alembic upgrade head` runs automatically on backend container start in dev.
- **AR32:** Pre-commit hooks: ESLint + Prettier (frontend), Ruff + Black (backend), accessibility-lint plugin, vue-tsc, mypy.
- **AR33:** Monorepo layout — `kano-frontend/`, `kano-backend/`, `ops/`, `docs/`, `.github/` with `PULL_REQUEST_TEMPLATE.md` checklist (epoch-service routing, migration forward/rollback, copy-deck usage, bundle-size).

### UX Design Requirements

**Foundation — Tixeo Vuetify theme (day-zero artifact):**

- **UX-DR1:** Establish Tixeo Vuetify theme as a day-zero foundational artifact — single `createVuetify()` instance, tokens for colors (`primary` Tixeo orange `#E36A2F`, `surface`, `surface-variant` dark sidebar `#1C1F26`, semantic `success`/`warning`/`error`/`info`), typography (Tixeo sans-serif with Inter fallback, rem-based scale at 14px PM / 16px respondent body), spacing (4px base unit), elevation (minimal shadows, borders for separation), density (`comfortable` PM / `default` respondent).
- **UX-DR2:** Define and lock the 6-category Kano palette (Must-have indigo-800, Performance teal-600, Delighter violet-600, Indifferent gray-500, Reverse amber-700, Questionable stone-500); validate against protanopia/deuteranopia/tritanopia simulators and WCAG AA contrast against `#FFFFFF` and adjacent-category edges before lock; reserve Tixeo orange exclusively for primary-action and progress UI.
- **UX-DR3:** Override Vuetify Material-3 defaults that conflict with Tixeo register — button variants (flat solid orange primary, outlined secondary), input style (labels-above-field, not floating), card elevation (0 shadow, 1px outline border), icon set (mdi).

**Copy deck (single source of truth for all user-facing strings):**

- **UX-DR4:** Build an in-repo copy deck (`kano-frontend/src/copy/en.ts` + `docs/copy-deck.md` canonical reference) holding every user-facing string as a keyed entry — respondent questions, human-language Likert labels ("I'd love it" / "nice-to-have" / "neutral" / "can live without it" / "would dislike it"), PM-facing category names (Must-have / Performance / Delighter / Indifferent / Reverse / Questionable), "Version" (never "Epoch") for PM surface, dialog/error/empty-state copy, halfway-milestone microcopy, confidence-beat line.
- **UX-DR5:** `useCopy()` composable exposes keyed lookup; ESLint rule or code-review checklist forbids inline user-facing string literals in Vue templates.

**PM layout & navigation:**

- **UX-DR6:** Implement `PmLayout` — dark sidebar (`--surface-variant`) on left with primary routes; top bar with breadcrumbs + page-specific actions (e.g., epoch selector on analysis); content container max-width 1440px centered; applied via route-meta, not conditional component logic.
- **UX-DR7:** Implement "unsupported viewport" helper screen for PM surface when viewport <1280px (not a crash, not responsive layout — acknowledged unsupported range with single centered message).

**Respondent layout:**

- **UX-DR8:** Implement `RespondentLayout` — chromeless (no sidebar, no top bar); content container max-width 480px centered; 16px lateral mobile gutter; mobile-first responsive from 360px up.

**Custom components (10 — per UX spec §11):**

- **UX-DR9:** `<KanoLikert>` — respondent 5-point Likert picker wrapping `v-radio-group`; stacked-vertical full-width option cards (≥56px tall, ≥44px touch target); keyboard `1`-`5` picks options; auto-advance on selection (150ms confirm → emit event); FQ/DQ variants; error state post-submit; `prefers-reduced-motion` collapses auto-advance to instant.
- **UX-DR10:** `<KanoStackedBar>` — SVG-based 6-segment horizontal bar (fixed order: Must-have → Performance → Delighter → Indifferent → Reverse → Questionable); `default` 12px / `large` 16px / `mini` 4px variants; `role="img"` + `aria-labelledby` pointing at companion table; segment hover/focus reveals `v-tooltip` with per-category counts; non-clickable in v1.
- **UX-DR11:** `<KanoStackedBarTable>` — accessible data-table fallback (NFR10) rendered from the same grouped result; hidden from sighted users via SR-only CSS; toggleable to visible via "Show data table" link for sighted users; is the accessibility contract for the stacked bar.
- **UX-DR12:** `<CatBadge>` — inline-flex 10×10px color swatch (rounded 2px) + 14px weight-600 category name; 6 variants (must/perf/del/ind/rev/que); swatch `aria-hidden`, text carries meaning; category name from copy deck (never letter codes).
- **UX-DR13:** `<PollSharePanel>` — read-only monospace URL field + Copy button with leading icon + inline ~120×120px QR code (lazy-loads `qrcode` lib) + helper text; one-click copy with "Copied" flash (~1s revert); snackbar `aria-live="polite"`; QR `aria-hidden` (URL text is SR source of truth).
- **UX-DR14:** `<EpochSelector>` — `v-menu`-based dropdown in top-bar ("Version 2 ▾"); lists prior versions with creation date + response count; arrow-key nav, Enter selects, Esc dismisses; `aria-haspopup="listbox"`; static label (no dropdown) when only one epoch exists; uses "Version" (copy deck).
- **UX-DR15:** `<EpochBumpDialog>` — firm-register `v-dialog` for FR11 populated-epoch case; title ("Create Version N+1?"), explicit consequence listing (responses pinned to Version N, new polls use N+1), Cancel / Create buttons (orange primary vs neutral); focus trap; Esc cancels; focus returns to edit source on dismiss.
- **UX-DR16:** `<EpochBumpBanner>` — soft-register inline `v-alert` (info variant) for empty-epoch case; body "Version N updated in place — no responses to preserve"; `role="status"`; auto-dismiss after ~4s or manual; non-blocking.
- **UX-DR17:** `<PerCategoryPanels>` (FR36) — one section per Kano category with at least one dominant feature; section header `<CatBadge>` + category name; `<ul>` of feature items (name + dominant-category percentage + anchor link to table row); absent-category sections omitted entirely; semantic `<h3>` + `<ul>`/`<li>`.
- **UX-DR18:** `<FeatureListEditor>` — inline-first feature authoring (no modals); row = name field + description field; always-present empty row; keyboard: Tab between fields, Enter commits + advances to next row, Esc cancels, ⌫ on empty row deletes; copy-paste multi-line text parses line-by-line into multiple features; ARIA `grid` role with row/cell semantics; trash icon on hover to delete.

**Analysis page composition (Direction 2 — Table-Row):**

- **UX-DR19:** Analysis page uses `v-data-table` with columns Feature / Dominant / Distribution / n; per-feature data is one table row; dominant column renders 20px tabular-number percentage + `<CatBadge>` under; ties render as "X% each" with dual badges joined by `/` and equal-width stacked-bar segments.
- **UX-DR20:** Empty-state composition (FR37) replaces the table with "0 of N expected responses — analysis will populate as responses arrive"; never render empty bars or zero-percent dominants.
- **UX-DR21:** Confidence-beat meta line ("12 of 12 responses", "3 of 12 so far") rendered at secondary-text weight in the analysis-page header; no blocking banner.
- **UX-DR22:** Analysis table container fixed max-width matching 1440px PM content width; no horizontal-scroll at standard desktop resolutions; screenshot-friendly composition.

**Respondent flow mechanics:**

- **UX-DR23:** One-question-per-screen flow for the 16-question sequence (8 features × FQ+DQ); tap an option → auto-advance to next question; `v-progress-linear` at top showing true fraction (`N of 16`) — never faked progress; halfway-milestone microcopy acknowledgement; tap/swipe-back to previous question (keyboard: Esc or ← Backspace).
- **UX-DR24:** Respondent landing page — "Tixeo · 2–3 min · shapes our roadmap" trust line + Begin CTA (thumb-friendly 48px large button); value exchange stated once, honestly, before first question.
- **UX-DR25:** Respondent thank-you page — "Thanks — your input is on the record" + "Paola will see this within 24h" (or equivalent per copy deck); brief, warm, closes as a relationship artifact.
- **UX-DR26:** Respondent expired-link page (FR27) — "This survey closed before you could respond" + substantial (not footnoted) product-team contact off-ramp link.
- **UX-DR27:** Inline submit-error — if the terminal Submit action lacks answers, show inline error locating the specific missing feature/question (not a top-level banner).

**PM home / poll list (Challenge 6):**

- **UX-DR28:** PM home screen — dense row-based `v-data-table` of polls across projects; columns include project, version, response count, expiry countdown, creation date; default sort by created-date desc; hover highlights row; click row opens analysis; single "New project" CTA for empty state; no search/filter in v1.

**Share flow (Critical Success Moment 2):**

- **UX-DR29:** Share panel renders immediately after poll URL generation — URL is the largest element; one-click copy with visible confirmation flash; QR code adjacent (same card) for mobile preview without device switch; 7-day expiry helper text.

**Feedback patterns (single canonical per type):**

- **UX-DR30:** Feedback pattern set — `v-snackbar` bottom-center (3s auto-dismiss) for transient success; inline "Copied" flash (~1s revert) for contextual success; red text below field for field-level errors; `v-alert` banner at content-top for page-level errors; `<EpochBumpDialog>` firm modal for consequential warnings; `<EpochBumpBanner>` inline alert for non-interrupting info; `v-progress-linear` for honest progress; `v-skeleton-loader` only for analysis-page initial fetch (no blocking spinner).

**Button hierarchy:**

- **UX-DR31:** Four button registers — Primary (Tixeo orange solid + white text + leading mdi icon), Secondary (white bg + thin outline + on-surface text), Tertiary (no border/bg, text-only), Destructive (not used in v1); default 40px, dense 32px inline, large 48px for respondent Begin/Submit; one Primary button per visible section.

**Form patterns:**

- **UX-DR32:** Form conventions — labels above fields (not floating); inline validation on blur (not keystroke); required by default (no optional markers); placeholders supplementary never the sole label; error copy specific and actionable from copy deck; inline-first (no modals for add/edit); keyboard-first commits (Tab/Enter/Esc).

**Accessibility commitments (operationalized):**

- **UX-DR33:** Focus management — 2px `primary`-orange outline at 3:1+ contrast on every interactive element (never `outline: none`); route transition focuses page's main `<h1>`; modal-open moves focus in (first focusable) and restores to trigger on close; skip-link "Skip to main content" as first focusable element on every page.
- **UX-DR34:** `prefers-reduced-motion` — auto-advance collapses to instant state change; progress bar updates without fill animation; copy-flash confirms without fade.
- **UX-DR35:** Semantic HTML — `<section>`, `<nav>`, `<main>`, `<h1>`–`<h3>` hierarchy throughout; `<div>`-only blocks fail review; every `<input>` has programmatically associated `<label>`; icon-only buttons carry `aria-label`; inline errors use `aria-live="polite"` + `aria-describedby`.
- **UX-DR36:** `axe-core` via `@axe-core/playwright` runs on every rendered route in CI (PM home, project detail, share panel, analysis page with/without responses, respondent landing, respondent question, respondent thank-you, expired link); violations block merge.
- **UX-DR37:** Touch-target minimum ≥44×44px enforced on respondent surface; PM interactive elements ≥32×32px; rem-based sizing throughout so 200% zoom reflows cleanly; color is never the sole information carrier (Kano categories always show color + label together).
- **UX-DR38:** Manual accessibility smoke gates at milestones — keyboard-only critical-path sanity pass per PR (PM authoring + respondent completion), VoiceOver smoke on analysis/respondent flows at MVP-ready gate, real-device test (iOS Safari + Android Chrome) + 3G network throttling before first PM study.

**Navigation & keyboard shortcuts:**

- **UX-DR39:** Keyboard shortcuts documented but not surfaced in UI — PM global (Esc cancels inline edit or dismisses menu, ↑/↓ navigate tables/dropdowns, Enter opens focused row / commits field), feature editor (Tab/Shift+Tab field nav, Enter commit+next row, ⌫ on empty row deletes), respondent flow (`1`-`5` pick Likert option, Esc/← Backspace previous question); deep-linkable PM routes.

### FR Coverage Map

Every FR maps to exactly one epic. NFRs, ARs, and UX-DRs may span multiple epics (listed at the most-active epic).

| FR  | Epic | Summary |
|---|---|---|
| FR1 | E2 | PM creates project (name + version) |
| FR2 | E2 | PM views project list |
| FR3 | E2 | PM views project detail (name, version, epoch, features) |
| FR4 | E2 | PM edits name/version (no epoch bump) |
| FR5 | E2 | PM adds feature to project |
| FR6 | E2 | PM edits feature name/description |
| FR7 | E2 | PM deletes feature (soft-delete) |
| FR8 | E2 | Auto epoch bump on feature-set change |
| FR9 | E2 | Prior epoch feature set preserved unchanged |
| FR10 | E2 | Soft-deleted features retained in original epoch |
| FR11 | E2 | Confirmation dialog before epoch bump |
| FR12 | E2 | PM views past-epoch feature list |
| FR13 | E3 | PM generates poll pinned to current epoch |
| FR14 | E3 | Unique publicly reachable poll URL issued |
| FR15 | E3 | Poll URL expires 7 days after creation |
| FR16 | E4 | System rejects submissions on expired URL |
| FR17 | E3 | PM generates multiple polls per project |
| FR18 | E3 | PM views poll list with pinned epoch |
| FR19 | E4 | Respondent accesses landing without auth |
| FR20 | E4 | Respondent sees plain-language feature list |
| FR21 | E4 | Respondent answers FQ + DQ per feature |
| FR22 | E4 | Respondent uses 5-point plain-language Likert |
| FR23 | E4 | Respondent sees progress indicator |
| FR24 | E4 | Respondent submits only if all questions answered |
| FR25 | E4 | Partial submissions discarded |
| FR26 | E4 | Respondent receives confirmation page |
| FR27 | E3 | Respondent sees expired-poll page + off-ramp (ships with E3 respondent-landing stub) |
| FR28 | E1 + E4 | Kano matrix pure function in E1; consumed at submit in E4 |
| FR29 | E4 | System persists FQ_ANSWER, DQ_ANSWER, CATEGORY |
| FR30 | E4 | Each response linked to exactly one poll instance |
| FR31 | E5 | PM views analysis page per poll instance |
| FR32 | E5 | Analysis page publicly accessible via URL |
| FR33 | E5 | Per-feature horizontal stacked bar rendered |
| FR34 | E5 | Dominant category + % displayed per feature |
| FR35 | E5 | Ties surface all dominant categories + shared % |
| FR36 | E5 | Per-category panels list features where dominant |
| FR37 | E5 | Empty-state shown when 0 responses |
| FR38 | E5 | Human-readable category labels |
| FR39 | E5 | On-demand explanatory tooltips/help |

## Epic List

### Epic 1: Foundation & Bootable Stack

**Goal.** A clone-and-run monorepo producing one coherent artifact: `docker compose up` brings up a themed Vue SPA + Flask API + PostgreSQL with the locked 5-table domain schema applied via Alembic migration #1, base middleware (CSRF/CORS/request-ID/structured-logging/RFC 7807 Problem Details), health endpoint, Tixeo Vuetify theme, copy-deck scaffold with `useCopy()` composable, PM + Respondent layout wrappers, the pure-function Kano categorization matrix (25-cell parametrized test green), a theme-audit screen exercising every Vuetify primitive the two surfaces will ever use, pre-commit hooks, and a green CI baseline (lint/typecheck/pytest/Vitest/Alembic forward+rollback/compose smoke/size-limit).

**User value (solo dev).** Kanaud can clone, run one command, and land in a stack where the next PR is business logic — with the product's single most load-bearing correctness invariant (Kano categorization, FR28) already frozen and tested. The theme-audit screen is a concrete DoD artifact, not a hope.

**Definition of Done.** `docker compose up` green on clean checkout; `GET /api/v1/health` returns 200; every CI gate green; `pytest tests/unit/test_kano_matrix.py` passes all 25 parametrized cells; theme-audit screen renders every Vuetify primitive with Tixeo-themed tokens (no visible Material-3 defaults).

**FRs covered:** FR28 (matrix module only — not yet consumed).
**NFRs covered:** NFR4, NFR5, NFR6, NFR7 (scaffold), NFR14, NFR15, NFR17, NFR18.
**ARs covered:** AR1, AR2, AR3, AR4, AR5, AR6, AR7, AR8, AR10, AR12 (scaffold), AR13, AR14, AR15, AR16, AR17, AR19, AR20, AR23 (baseline), AR25, AR29, AR31, AR32, AR33.
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR7, UX-DR8, UX-DR30 (scaffold), UX-DR31 (theme tokens), UX-DR33 (layout focus/skip-links), UX-DR36 (axe-core hook).

---

### Epic 2: Project & Feature Authoring with Epoch Integrity

**Goal.** Paola creates and iterates on projects and feature lists with epoch-bump semantics wired end-to-end. Centralized `epoch_service.bump_epoch_on_feature_change()` contract plus `get_current_epoch()` accessor; two-register confirmation pattern (soft `<EpochBumpBanner>` for empty-epoch, firm `<EpochBumpDialog>` for populated-epoch); `<EpochSelector>` for navigating prior epochs; `<FeatureListEditor>` inline authoring (Tab/Enter/Esc, multi-line paste parsing, no modals).

**User value.** Paola goes from empty state to a project with 8 features, edits safely, and understands the versioning implications before her edits bump an epoch. Epoch is framed as "the version of the question set I'm editing right now" — never as a poll-time decision.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12.
**ARs covered:** AR9, AR12 (projects/features endpoints).
**UX-DRs covered:** UX-DR14, UX-DR15, UX-DR16, UX-DR18, UX-DR32, UX-DR39 (PM keyboard shortcuts).

---

### Epic 3: Poll Generation & Sharing (with respondent landing stub)

**Goal.** Paola generates a poll pinned to the current epoch, receives a UUIDv4 plain URL with 7-day TTL, hands off via `<PollSharePanel>` (URL + adjacent QR preview + one-click copy + 7-day helper copy). Polls across projects appear in the PM home poll list with pinned-epoch badges. The public `/poll/<uuid>` route is wired to a themed respondent-landing stub that resolves the UUID, fetches the poll, and renders either "this poll is ready — coming soon" in the Tixeo mobile shell or the expired-poll page if TTL is blown.

**User value.** Paola turns a ready feature list into a shareable URL she trusts enough to send to a paying customer — preview on her own phone works end-to-end from the moment this epic merges. Critical Success Moment 2 ("can I send this to a paying customer?") is demoable at E3 merge, not deferred to E4.

**Scope note.** The respondent-landing stub is a deliberate per-domain increment: it exercises the UUID-resolution + TTL-check backend endpoint shared with E4, establishes the route-level code-split boundary for the respondent bundle, and guarantees no broken routes ship to main. E4 replaces the stub body with the real Likert flow.

**FRs covered:** FR13, FR14, FR15, FR17, FR18.
**ARs covered:** AR18, AR28 (split boundary established), AR30.
**UX-DRs covered:** UX-DR13, UX-DR28, UX-DR29.

---

### Epic 4: Respondent Poll Experience & Submission

**Goal.** A respondent opens the URL on mobile, reads a plain-language landing, answers 8 features × 2 Likert questions with auto-advance and honest progress, submits a complete response that gets persisted atomically (submission row + N response rows in one transaction) with Kano categorization computed from the E1 matrix. Expired URLs land on a respectful expired-poll page with product-team off-ramp. Partial submissions are silently discarded (transaction rollback). Respondent initial bundle <150 KB gzipped.

**User value.** Marcus completes the poll in under 3 minutes on his phone and feels respected, not interrogated. The system captures clean, categorized data with zero PII.

**Definition of Done.** Manual a11y close-out on the respondent flow — VoiceOver (iOS) + TalkBack (Android) smoke test + 3G throttling + touch-target audit on device — executed before merge; issues fixed or explicitly deferred with a follow-up ticket.

**FRs covered:** FR16, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 (first consumer), FR29, FR30.
**NFRs covered:** NFR2, NFR8.
**ARs covered:** AR10 (consumed here), AR28 (verification).
**UX-DRs covered:** UX-DR9, UX-DR23, UX-DR24, UX-DR25, UX-DR26, UX-DR27, UX-DR34, UX-DR37, UX-DR38 (respondent manual gate).

---

### Epic 5: Analysis & Insight

**Goal.** Paola opens the analysis page and reads a roadmap-ready artifact: per-feature table row with dominant category + % + tie handling + 6-segment stacked bar + accessible data-table fallback, per-category cross-index panels, empty state, confidence-beat meta line, on-demand category tooltips. The backend serves it all in a single SQL round-trip, measured under 3s p95 on a seeded 20×500 dataset.

**User value.** Paola walks into her roadmap review with a quotable, screen-shareable artifact — "SSO → Must-have, 71%" — and answers "what does our customer think?" at a glance.

**Definition of Done.** Manual a11y close-out on the analysis page — keyboard-only scan + VoiceOver on the stacked bar (tie state must be readable) + screen-reader parity with the data-table fallback — executed before merge.

**FRs covered:** FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39.
**NFRs covered:** NFR1, NFR3, NFR10.
**ARs covered:** AR11.
**UX-DRs covered:** UX-DR10, UX-DR11, UX-DR12, UX-DR17, UX-DR19, UX-DR20, UX-DR21, UX-DR22, UX-DR38 (analysis manual gate).

---

### Epic 6: Data Durability & Operational Readiness

**Goal.** Prove data durability before it's needed — against local Postgres, not in production. Nightly `pg_dump -Fc` running inside a dedicated `backup` docker-compose service to a separately-mounted volume, with 14-day rolling retention. Documented restore-drill procedure (`ops/restore-drill.md`) executed end-to-end: dump taken, fresh Postgres container provisioned, dump restored, application boots cleanly against restored state. Restore-drill execution log committed to the repo. PostgreSQL slow-query log configuration scaffolded.

**User value.** Kanaud can invest real authoring effort into dogfood projects across E3–E5 without fear of data loss, and arrives at production cutover with a restore procedure that's already been exercised. NFR13's "validated before first PM study" gate is satisfied against local infra, not against an untested prod VPS under schedule pressure.

**Scheduling note.** This epic can run after E2 lands (once the schema holds real data worth protecting) and must complete before E7 Deploy & Launch.

**FRs covered:** none directly (operational readiness).
**NFRs covered:** NFR12, NFR13, NFR16 (config scaffolded).
**ARs covered:** AR26, AR27.

---

### Epic 7: Deploy & Launch

**Goal.** kano is publicly reachable at its production domain: Hetzner VPS provisioned (EU data residency), Caddy terminating TLS via automatic Let's Encrypt with HSTS, `docker-compose.prod.yml` composing web + api + db + backup services, GitHub Actions CD pipeline (build → push to ghcr.io → SSH deploy → `alembic upgrade head` → sanity check). Size-limit + axe-core merge gates fully wired. Final axe-core sweep across every production route. First real PM study as the ultimate acceptance test.

**User value.** Paola runs her first real customer study against a production kano that's publicly reachable, TLS-secured, observable, and backed up — with the restore procedure already verified in E6.

**FRs covered:** none directly (launch readiness).
**NFRs covered:** NFR11 (final gate), NFR16 (prod runtime config).
**ARs covered:** AR21, AR22, AR24, AR28 (gate enforcement).
**UX-DRs covered:** UX-DR36 (final).

---

### Dependency Summary

- E1 → all subsequent epics (foundation)
- E2 → E3 (epoch service consumer), E5 (epoch navigation on analysis), E6 (schema must exist before durability drill)
- E3 → E4 (replaces respondent stub)
- E4 → E5 (real submission data feeds analysis, but seedable for E5 development)
- E6 → E7 (durability drill must complete before production launch)
- E5 + E6 → E7 (launch requires all product epics + durability)

---

## Epic 1: Foundation & Bootable Stack

A clone-and-run monorepo producing one coherent artifact: `docker compose up` brings up a themed Vue SPA + Flask API + PostgreSQL with the locked 5-table domain schema applied via Alembic migration #1, base middleware (CSRF/CORS/request-ID/structured-logging/RFC 7807 Problem Details), health endpoint, Tixeo Vuetify theme, copy-deck scaffold with `useCopy()` composable, PM + Respondent layout wrappers, the pure-function Kano categorization matrix, a theme-audit screen exercising every Vuetify primitive the two surfaces will ever use, pre-commit hooks, and a green CI baseline.

### Story 1.1: Monorepo scaffold with backend and frontend project initialization

As a solo dev (Kanaud),
I want the monorepo structure scaffolded with a Poetry-managed Flask backend and a Vuetify-scaffolded Vue frontend,
So that every subsequent story has a canonical place to land code without revisiting project-wiring decisions.

**Acceptance Criteria:**

**Given** a fresh checkout of the repo
**When** I run `poetry install` inside `kano-backend/` and `npm install` inside `kano-frontend/`
**Then** both dependency installs complete without errors
**And** `kano-backend/pyproject.toml` declares Python 3.12, Flask 3.1.x, SQLAlchemy 2.x, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, Flask-WTF, psycopg2-binary, Pydantic 2, structlog; dev group includes pytest, pytest-cov, pytest-flask, factory-boy, alembic, ruff, black, mypy
**And** `kano-frontend/package.json` declares Vue 3.5+, Vuetify 4.x, TypeScript 5+, Vite 6+, vue-router, pinia, vitest, playwright, eslint, prettier, @axe-core/playwright, size-limit, qrcode
**And** the monorepo root contains `.gitignore`, `.env.example`, `.editorconfig`, `README.md`, `.github/PULL_REQUEST_TEMPLATE.md` with epoch-service / migration / copy-deck / bundle-size checklist items

### Story 1.2: Alembic migration #1 locks the five-table domain schema

As a solo dev,
I want the full domain schema (`projects`, `features`, `polls`, `submissions`, `responses`) expressed as Alembic migration `0001_initial_schema.py` with all FKs, CHECK constraints, indexes, and `TIMESTAMPTZ` columns,
So that the most irreversible artifact in the project is locked in one reviewable artifact and all future schema changes ship as migrations.

**Acceptance Criteria:**

**Given** `kano-backend/alembic.ini` and `kano-backend/migrations/env.py` are bootstrapped (env.py wires SQLAlchemy metadata, target URL from config, `TIMESTAMPTZ` default naming convention)
**And** a clean PostgreSQL 17 database
**When** I run `alembic upgrade head`
**Then** all 5 tables are created with application-generated UUID primary keys (no `DEFAULT gen_random_uuid()`)
**And** `features` has unique constraint on `(project_id, epoch, feature_key)`, `is_active` boolean, TIMESTAMPTZ `created_at`
**And** `polls` foreign-keys `(project_id, epoch)` to pin to an immutable feature set snapshot; includes TIMESTAMPTZ `expires_at` and a partial index on non-expired polls
**And** `responses` has CHECK constraints `fq_answer BETWEEN 1 AND 5`, `dq_answer BETWEEN 1 AND 5`, `category IN ('M','L','E','I','C','D')`, composite PK `(submission_id, feature_id)`
**And** all required indexes exist: `feature(project_id, epoch)`, `poll(project_id, epoch)`, `poll(expires_at)` partial, `submission(poll_id)`
**And** running `alembic downgrade -1 && alembic upgrade head` completes without error
**And** `tests/integration/test_timestamptz.py` asserts every timestamp column is `TIMESTAMPTZ`, not `TIMESTAMP`

### Story 1.3: Flask app factory with CSRF, CORS, request-ID, structured logging, and Problem Details middleware

As a solo dev,
I want the Flask `create_app()` factory wired with request-ID middleware, structlog JSON output, CSRF (Flask-WTF), CORS (Flask-CORS) allowlist, RFC 7807 Problem Details error envelope registry, and session cookie configuration,
So that every blueprint mounted afterwards inherits correct cross-cutting behavior without per-endpoint boilerplate.

**Acceptance Criteria:**

**Given** the Flask app factory is invoked via `create_app()`
**When** the app handles any request
**Then** a UUIDv4 request ID is generated (or read from incoming `X-Request-ID`), bound to structlog, and returned on the response `X-Request-ID` header
**And** structlog emits one `INFO` JSON line per request at completion with keys `timestamp`, `level`, `request_id`, `event`, `method`, `path`, `status`, `duration_ms`
**And** CSRF is enabled on state-changing `/api/v1/*` endpoints and exempt for `POST /api/v1/polls/<uuid>/submit` (exemption pre-configured by route pattern)
**And** CORS responses include the configured production origin allowlist (no wildcard), allow `Content-Type` and `X-CSRF-Token` headers, with 24h preflight cache
**And** session cookies set in production carry `HttpOnly`, `Secure`, `SameSite=Lax` attributes; `Secure` is disabled automatically when `FLASK_ENV=development`
**And** any unhandled domain exception routed via `@app.errorhandler` emits an RFC 7807 `application/problem+json` response with `type`, `title`, `status`, `detail`, `instance`, `request_id`

### Story 1.4: Health and CSRF-token endpoints

As a CI pipeline or SPA bootstrapper,
I want `GET /api/v1/health` for liveness checking and `GET /api/v1/csrf-token` for SPA CSRF-token bootstrap,
So that the CI smoke test has a stable assertion target and the PM SPA has a clean way to obtain its token before any non-GET call.

**Acceptance Criteria:**

**Given** the Flask app is running
**When** I `GET /api/v1/health`
**Then** the response is 200 with body `{"status": "ok", "version": "<git-sha>", "db": "connected"}` (version read from `KANO_VERSION` env var)
**And** when the database is unreachable, the response is 503 with `{"status": "degraded", "db": "unreachable"}`
**Given** a PM SPA client with no session cookie
**When** I `GET /api/v1/csrf-token`
**Then** the response is 200 with body `{"csrf_token": "..."}`
**And** a session cookie is set with the configured attributes from Story 1.3
**And** the returned token is subsequently accepted as `X-CSRF-Token` on state-changing requests

### Story 1.5: Kano categorization matrix pure-function module with 25-cell parametrized test

As a solo dev,
I want `services/kano_matrix.py` exposing `compute_category(fq, dq) -> Category` with the full 25-cell Kano decision matrix frozen against the spec,
So that the single most load-bearing correctness invariant in the product (FR28) is tested and immutable from commit #1.

**Acceptance Criteria:**

**Given** `services/kano_matrix.compute_category(fq, dq)` is invoked
**When** `fq` and `dq` are integers in 1..5
**Then** the returned value is exactly one of `Category.MANDATORY`, `LINEAR`, `EXCITER`, `INDIFFERENT`, `CONTRADICTORY`, `DOUBTFUL` per the Kano decision matrix in the initial specification
**And** `tests/unit/test_kano_matrix.py` uses `pytest.mark.parametrize` to cover all 25 `(fq, dq)` combinations with expected category assertions
**And** invoking `compute_category` with any argument outside 1..5 raises `ValueError`
**And** the module has zero imports from `models/`, `api/`, or any Flask/SQLAlchemy symbol — it is a pure function dependent only on the `Category` enum

### Story 1.6: Vue SPA scaffold with Tixeo Vuetify theme, two layouts, and useApi composable

As a solo dev,
I want the Vue SPA wired with `createVuetify()` carrying Tixeo theme tokens, both layout wrappers (`PmLayout`, `RespondentLayout`), the unsupported-viewport helper, route-meta-driven layout selection, and a `useApi()` composable,
So that every feature story inherits a themed, responsive shell and makes backend calls through a single CSRF-aware and Problem-Details-aware client.

**Acceptance Criteria:**

**Given** the Vue SPA boots
**When** any page renders
**Then** a single `createVuetify()` instance is applied with Tixeo theme tokens: `primary` orange `#E36A2F`, `surface`, `surface-variant` `#1C1F26`, semantic success/warning/error/info, the 6 Kano-category colors (Must-have indigo-800, Performance teal-600, Delighter violet-600, Indifferent gray-500, Reverse amber-700, Questionable stone-500)
**And** typography uses the Tixeo sans-serif family with Inter fallback, rem-based scale (14px PM body, 16px respondent body), tabular numerals enabled in statistics contexts
**And** spacing uses the 4px base unit scale; elevation shadows are overridden to minimal (0 on cards, borders for separation)
**And** navigating to `/app/*` renders inside `PmLayout` (dark sidebar + top bar, content container 1440px centered); navigating to `/poll/*` renders inside `RespondentLayout` (chromeless, 480px container centered, 16px mobile gutter)
**And** visiting any `/app/*` route from a viewport <1280px renders the unsupported-viewport helper screen with a single centered message sourced from the copy deck
**And** `useApi()` prepends `/api/v1/`, generates an `X-Request-ID` header client-side, fetches the CSRF token lazily on first PM-route entry and injects `X-CSRF-Token` on non-GETs, parses Problem Details responses into typed errors (`ValidationError`, `ConflictError`, `NotFoundError`, `ServerError`)
**And** automated contrast checks pass at 4.5:1 for body text and 3:1 for large text and non-text UI on all defined token pairings
**And** the Kano category palette passes protanopia/deuteranopia/tritanopia simulator checks (manual verification documented in-repo)

### Story 1.7: Copy deck scaffold with useCopy composable and inline-literal lint rule

As a solo dev,
I want `src/copy/en.ts` serving as the string-key registry for all user-facing strings, plus a `useCopy()` composable for keyed lookup, plus a lint rule preventing inline literals,
So that the copy deck is a runtime source of truth from day one and no future PR can accidentally bypass it.

**Acceptance Criteria:**

**Given** a Vue template
**When** it renders any user-facing string
**Then** the string is sourced via `useCopy('some.key')`, never as an inline literal
**And** `src/copy/en.ts` exports a flat string-key registry; missing keys return the key itself as a visible fallback
**And** initial copy deck entries exist for both layouts' chrome (sidebar labels, unsupported-viewport message), common feedback (snackbar success and error, button labels Primary/Secondary/Tertiary), PM category labels (Must-have, Performance, Delighter, Indifferent, Reverse, Questionable), respondent Likert options ("I'd love it", "nice-to-have", "neutral", "can live without it", "would dislike it"), and "Version" terminology (never "Epoch")
**And** an ESLint rule flags inline user-facing string literals in `<template>` blocks under `src/routes/` and `src/components/`
**And** `docs/copy-deck.md` exists as the canonical human-readable reference mirroring `src/copy/en.ts`

### Story 1.8: Theme audit screen as day-zero verification artifact

As a solo dev,
I want a developer-only `/dev/theme-audit` route exercising every Vuetify primitive and Tixeo token the product will use,
So that the Tixeo theme is verifiably audited rather than assembled, and any future theme-drift regression is caught on sight.

**Acceptance Criteria:**

**Given** I visit `/dev/theme-audit` in development mode
**When** the page renders
**Then** it displays each Vuetify primitive the product depends on: buttons (primary/secondary/tertiary at 32/40/48 sizes), text fields, textareas, radio groups, data tables, dialogs, tooltips, snackbars, progress-linear, alerts (info/success/warning/error), cards, lists, tabs, menus, navigation drawer, app bar, skeleton loaders
**And** each of the 6 Kano category swatches is displayed with its hex value and category label
**And** the type scale is rendered (Display / H1 / H2 / H3 / Body PM / Body Respondent / Body-large Respondent / Label / Caption) with the Tixeo sans-serif family
**And** a visual sample of the Tixeo spacing scale (4/8/12/16/24/32/48/64 px) is rendered
**And** no Material-3 default styling is visible (default elevation shadows, default orange, default filled buttons, floating-label inputs) — all are Tixeo-overridden
**And** the route is only registered when `import.meta.env.DEV` is true, so it does not ship in production builds
**And** a Playwright test navigates to `/dev/theme-audit`, asserts zero console errors and zero `axe-core` violations, and captures a baseline screenshot committed to the repo as a visual-regression anchor

### Story 1.9: docker-compose local boot brings the full stack up on one command

As a solo dev,
I want `docker-compose.yml` composing `web` (Vite dev), `api` (Flask dev with automatic alembic upgrade on start), `db` (postgres:17), and `backup` (idle in dev) services with a single `docker compose up` boot on a clean checkout,
So that NFR17 is satisfied from day one and every downstream story inherits the same reproducible local environment.

**Acceptance Criteria:**

**Given** a clean checkout of the repo with a populated `.env` (copied from `.env.example`)
**When** I run `docker compose up` from the repo root
**Then** all four services start cleanly
**And** the `api` container's entrypoint runs `alembic upgrade head` automatically before launching `flask run --debug`
**And** `curl http://localhost:5000/api/v1/health` returns 200 `{"status": "ok", ...}`
**And** `curl http://localhost:5173/` returns 200 with the Vue SPA shell
**And** the Vite dev server proxies `/api/*` to the Flask container
**And** source directories (`kano-backend/src`, `kano-frontend/src`) are volume-mounted for live reload; Vite HMR and Flask debug mode both respond to file changes without container restart
**And** `docker compose down -v` cleans up all volumes and state

### Story 1.10: CI baseline pipeline and pre-commit hooks

As a solo dev,
I want `.github/workflows/ci.yml` running lint, typecheck, pytest, Vitest, Alembic forward+rollback smoke, `docker compose up -d --wait` smoke, and size-limit bundle check on every PR, plus pre-commit hooks mirroring the linters,
So that no regression lands on main and the CI gates are in place for every downstream epic.

**Acceptance Criteria:**

**Given** a PR is opened
**When** the CI workflow triggers
**Then** the pipeline runs ESLint + Prettier on frontend, Ruff + Black on backend, vue-tsc typecheck, mypy typecheck
**And** pytest runs unit + integration tests; Vitest runs frontend specs
**And** an Alembic roundtrip step executes `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` against a throwaway PostgreSQL 17 service container
**And** a compose-smoke step runs `docker compose up -d --wait` followed by an HTTP check on `/api/v1/health`
**And** a size-limit step runs `npx size-limit` against the frontend build output (configuration in `kano-frontend/.size-limit.json` with entries for PM and respondent bundles; respondent initial bundle capped at 150 KB gzipped)
**And** any failing gate blocks the PR from merging
**Given** I set up pre-commit locally via `pre-commit install`
**When** I attempt a commit
**Then** ESLint, Prettier, Ruff, Black, vue-tsc, mypy, and an accessibility-lint plugin run on staged files; failing any blocks the commit

---

## Epic 2: Project & Feature Authoring with Epoch Integrity

Paola creates and iterates on projects and feature lists with epoch-bump semantics wired end-to-end. Centralized `epoch_service.bump_epoch_on_feature_change()` contract plus `get_current_epoch()` accessor; two-register confirmation pattern (soft banner for empty-epoch, firm dialog for populated-epoch); `<EpochSelector>` for navigating prior epochs; `<FeatureListEditor>` inline authoring.

### Story 2.1: Project SQLAlchemy model and Pydantic schemas

As a solo dev,
I want the `Project` SQLAlchemy model and its Pydantic request/response schemas,
So that every project-facing endpoint in this epic shares a single typed contract.

**Acceptance Criteria:**

**Given** the `Project` declarative model in `src/kano/models/project.py`
**When** a project row exists in PostgreSQL
**Then** the model's `Mapped[T]` typed columns match the schema from migration 0001 (id UUID PK, name TEXT, version TEXT, current_epoch INT default 1, created_at/updated_at TIMESTAMPTZ)
**And** `src/kano/schemas/project.py` exposes `ProjectCreate` (inbound name+version), `ProjectUpdate` (optional name and version), `ProjectResponse` (full object including current_epoch), `ProjectSummary` (list-item projection with id, name, version, current_epoch, created_at)
**And** all Pydantic schemas enforce `snake_case` aliasing disabled (keys flow untouched from DB to JSON) and apply `max_length` constraints to `name` and `version`
**And** ID generation uses the app-layer `uuid4()` helper — never DB-generated

### Story 2.2: Create project endpoint

As a PM,
I want to create a project by supplying a name and a version,
So that I can begin authoring features toward a future poll.

**Acceptance Criteria:**

**Given** a PM SPA client with a valid CSRF token
**When** I `POST /api/v1/projects` with `{"name": "Q3 Prioritization", "version": "1.0"}`
**Then** the response is 201 Created with a `Location: /api/v1/projects/:id` header and body matching `ProjectResponse` including `current_epoch: 1`
**And** a row is persisted in `projects` with an app-generated UUIDv4
**And** posting an invalid body (missing name, or name exceeding max length) returns 400 with a Problem Details envelope describing the validation failure
**And** posting without the `X-CSRF-Token` header returns 403 with a Problem Details envelope
**And** the endpoint is documented in `kano-backend/openapi.yaml`

### Story 2.3: List projects endpoint

As a PM,
I want to retrieve the list of every project I have,
So that I can navigate back to any project I've started.

**Acceptance Criteria:**

**Given** any number of projects exist (including zero)
**When** I `GET /api/v1/projects`
**Then** the response is 200 with a bare JSON array (no wrapping envelope) of `ProjectSummary` items
**And** the list is sorted by `created_at` descending
**And** the response is empty `[]` when no projects exist
**And** the endpoint is documented in `openapi.yaml`

### Story 2.4: Get project detail endpoint

As a PM,
I want to retrieve a single project's full detail including its active feature list at the current epoch,
So that I can render the project detail page in one request.

**Acceptance Criteria:**

**Given** a project exists with id `:id` at `current_epoch = N`
**When** I `GET /api/v1/projects/:id`
**Then** the response is 200 with a `ProjectResponse`-shaped body plus an `active_features` array of features where `project_id = :id AND epoch = N AND is_active = TRUE`, ordered by `created_at` ascending
**And** each active-feature entry carries `id`, `feature_key`, `name`, `description`, `created_at`
**And** `GET` against a non-existent UUID returns 404 with a Problem Details envelope
**And** the endpoint is documented in `openapi.yaml`

### Story 2.5: Edit project name and version without epoch bump

As a PM,
I want to edit a project's name or version without triggering an epoch bump,
So that typo fixes and rebranding don't corrupt my epoch lineage.

**Acceptance Criteria:**

**Given** a project exists at `current_epoch = N`
**When** I `PATCH /api/v1/projects/:id` with `{"name": "Q3 Prioritization (revised)"}`
**Then** the response is 200 with the updated `ProjectResponse`
**And** `current_epoch` is unchanged at `N`
**And** `updated_at` is refreshed
**And** neither the `features` rows nor any poll row is mutated
**And** the endpoint is CSRF-protected and documented in `openapi.yaml`

### Story 2.6: Feature model, Category enum, and epoch_service centralized contract

As a solo dev,
I want the `Feature` model, the `Category` enum, and `services/epoch_service.py` exposing `get_current_epoch(project_id)` and `bump_epoch_on_feature_change(project_id, mutation_fn, *, acknowledged)`,
So that every feature mutation endpoint downstream routes through a single contract that guarantees epoch invariants.

**Acceptance Criteria:**

**Given** `services/epoch_service.bump_epoch_on_feature_change()` is invoked
**When** the current epoch has zero polls
**Then** `mutation_fn` is applied directly to the current epoch's feature rows without bumping
**Given** the current epoch has at least one poll
**When** `bump_epoch_on_feature_change` is invoked with `acknowledged=False`
**Then** the function raises `EpochBumpRequired` (mapped to HTTP 409 by `api/errors.py`) without any mutation occurring
**Given** the current epoch has at least one poll
**When** `bump_epoch_on_feature_change` is invoked with `acknowledged=True`
**Then** in a single transaction: all currently-active features from epoch N are cloned into epoch N+1 with the same `feature_key`s and `is_active=TRUE`; `mutation_fn` is applied to the epoch N+1 rows; `projects.current_epoch` is updated to N+1; epoch N's feature rows are left byte-identical
**And** a parametrized pytest fixture tests the full bump matrix: add/edit/delete × (no polls, has polls, acknowledged, not acknowledged) with correct epoch-N invariance assertions
**And** `tests/unit/test_epoch_service.py` asserts that after a bump, epoch-N feature rows match a pre-bump snapshot byte-for-byte
**And** `src/kano/models/feature.py` exposes the SQLAlchemy `Feature` model mapping to the `features` table from migration 0001
**And** `src/kano/models/response.py` defines `Category` as a Python enum with members `MANDATORY`, `LINEAR`, `EXCITER`, `INDIFFERENT`, `CONTRADICTORY`, `DOUBTFUL` whose values match the `CHAR(1)` CHECK constraint from migration 0001

### Story 2.7: Feature mutation API with epoch-bump gating

As a PM,
I want to add, edit, and delete features on a project, with epoch bumping automatically when the current epoch has polls,
So that my feature changes never corrupt the data pinned to already-collected polls.

**Acceptance Criteria:**

**Given** a project at `current_epoch = N` with no polls
**When** I `POST /api/v1/projects/:id/features` with `{"name": "SSO", "description": "single sign-on"}`
**Then** the response is 201 Created with the new feature; the project stays at epoch N
**Given** the same project now has a poll on epoch N
**When** I `POST /api/v1/projects/:id/features` without the `?acknowledged=true` query flag
**Then** the response is 409 Conflict with Problem Details `type=epoch-bump-required`, `detail` explaining that editing will create epoch N+1
**When** I retry the same `POST` with `?acknowledged=true`
**Then** the response is 201 Created; the project advances to epoch N+1; epoch N's feature rows are preserved unchanged; the new feature lives on epoch N+1
**And** `PATCH /api/v1/projects/:id/features/:featureKey` with `{"name": "...", "description": "..."}` follows the same gating: in-place on empty epoch; 409 then N+1 on populated epoch
**And** `DELETE /api/v1/projects/:id/features/:featureKey` follows the same gating but soft-deletes: on empty epoch, the feature's `is_active` flips to FALSE; on populated epoch with acknowledgement, the feature is not cloned into epoch N+1 while remaining `is_active=TRUE` in epoch N
**And** all three endpoints route every mutation through `epoch_service.bump_epoch_on_feature_change()` — integration tests assert the service is invoked exactly once per request, with no direct `features` table writes in the blueprint code
**And** all three endpoints are CSRF-protected and documented in `openapi.yaml`

### Story 2.8: Past-epoch feature-set read endpoint

As a PM,
I want to retrieve the feature list of any historical epoch of a project,
So that I can reconstruct exactly what a prior poll's respondents saw.

**Acceptance Criteria:**

**Given** a project that has advanced through multiple epochs
**When** I `GET /api/v1/projects/:id/epochs/:epoch/features`
**Then** the response is 200 with an array of features where `project_id = :id AND epoch = :epoch`, ordered by `created_at` ascending
**And** the response includes soft-deleted features from that epoch (rows where `is_active=FALSE`)
**And** requesting an epoch number that doesn't exist for this project returns 404 with Problem Details
**And** the endpoint is documented in `openapi.yaml`

### Story 2.9: PM projects list and project detail Vue routes

As a PM,
I want a `/app/projects` listing of my projects and a `/app/projects/:id` detail page showing project info and its active feature list,
So that I can navigate to any project I've created and edit its details.

**Acceptance Criteria:**

**Given** I navigate to `/app/projects`
**When** `PmLayout` renders
**Then** the page renders a dense row-based `v-data-table` of projects with columns `name`, `version`, `current_epoch`, `feature count`, `created_at`, default-sorted by `created_at` desc
**And** clicking a row navigates to `/app/projects/:id`
**And** a "New project" primary button is visible; clicking it opens an inline form at the top of the table (no modal); Esc cancels; Enter commits via `POST /api/v1/projects` and navigates to the new project's detail
**And** the empty state (zero projects) replaces the table with a single "Create your first project" CTA per copy deck
**Given** I navigate to `/app/projects/:id`
**When** the page renders
**Then** the page shows project name, version, current epoch badge, and the active feature list (from `GET /api/v1/projects/:id`)
**And** the project name and version are inline-editable (click to edit, Enter commits via `PATCH`, Esc cancels)
**And** the page provides a placeholder anchor for the feature editor (delivered in Story 2.10)
**And** all user-facing strings are sourced from the copy deck
**And** the `projectsStore` Pinia store mediates state; components never call `useApi()` directly for project data

### Story 2.10: FeatureListEditor inline-first authoring component

As a PM,
I want a `<FeatureListEditor>` that lets me add, edit, and delete features inline without any modal dialogs,
So that drafting the feature list feels like typing into a doc rather than filling a form.

**Acceptance Criteria:**

**Given** `<FeatureListEditor>` is mounted on `/app/projects/:id`
**When** I click an empty row at the bottom and type a feature name
**Then** pressing Tab moves focus to the description field; pressing Enter commits the row via `POST /api/v1/projects/:id/features` and focuses a new empty row; Esc cancels the pending edit
**And** I can edit any existing feature inline (click → edit → Enter commits via `PATCH`)
**And** pressing Backspace on an empty row deletes that row via `DELETE /api/v1/projects/:id/features/:featureKey` and focuses the previous row
**And** hovering a row reveals a trash icon that triggers the same delete action
**And** pasting multi-line text into the empty row parses each non-empty line as a separate feature, posting them in order
**And** the component has ARIA `role="grid"` with per-row/per-cell `role="row"`/`role="gridcell"`
**And** if any API call returns 409 `epoch-bump-required`, the component re-raises a typed error to its parent for handling by the EpochBump dialog/banner pattern (Story 2.11); it does not render its own 409 UI
**And** copy-deck keys source all labels, placeholders, and validation messages

### Story 2.11: EpochBumpDialog and EpochBumpBanner two-register confirmation pattern

As a PM,
I want a firm modal for consequential epoch bumps (when polls exist) and a soft inline banner for non-consequential ones (empty epoch),
So that I'm asked to acknowledge version bumps when it matters, and informed (not interrupted) when it doesn't.

**Acceptance Criteria:**

**Given** Paola triggers a feature mutation via `<FeatureListEditor>` on a project at epoch N with zero polls
**When** the mutation succeeds in place
**Then** `<EpochBumpBanner>` (a `v-alert` info variant with `role="status"`) appears inline above the feature list with copy "Version N updated in place — no responses to preserve", auto-dismissing after ~4 seconds
**Given** Paola triggers a feature mutation on a project at epoch N that has at least one poll
**When** the API returns 409 `epoch-bump-required`
**Then** `<EpochBumpDialog>` (a Vuetify `v-dialog`) opens with title "Create Version N+1?", body listing consequences (responses preserved in Version N, new polls will use Version N+1), Cancel + Create Version N+1 buttons (primary orange)
**When** Paola clicks "Create Version N+1"
**Then** the original mutation request is retried with `?acknowledged=true`; the dialog transitions to a brief processing state; on success the dialog closes, focus returns to the triggering edit site, and a top-bar notice "Now editing Version N+1" is displayed
**When** Paola presses Escape or clicks Cancel
**Then** the dialog closes without mutation; the feature list's pending edit is reverted; focus returns to the edit source
**And** the dialog traps focus while open; copy-deck keys source all strings; no inline literals
**And** the word "Epoch" is never surfaced in any user-facing string from either component — only "Version"

### Story 2.12: EpochSelector for past-epoch navigation

As a PM,
I want an `<EpochSelector>` dropdown in the project detail top-bar that lets me view any prior epoch's feature set,
So that I can reconstruct the context of past polls without leaving the detail page.

**Acceptance Criteria:**

**Given** I'm on `/app/projects/:id` and the project is at `current_epoch = 3`
**When** `<EpochSelector>` renders in the top bar
**Then** it shows a `v-menu` trigger labeled "Version 3 ▾" (never "Epoch")
**And** opening the menu lists Version 3 (current, highlighted), Version 2, Version 1, each with creation date
**And** selecting Version N navigates to `/app/projects/:id?epoch=N`, the feature list is replaced with the features fetched from `GET /api/v1/projects/:id/epochs/N/features`, and the feature list renders as read-only (no `<FeatureListEditor>` on past epochs)
**And** keyboard: Tab focuses the trigger, Enter opens the menu, arrow keys navigate, Enter selects, Escape dismisses
**And** `aria-haspopup="listbox"` is set on the trigger; the current version carries `aria-current`
**And** when `current_epoch = 1`, the trigger renders as a static label ("Version 1") without dropdown affordance
**And** all copy-deck sourced; uses "Version" in every label

### Story 2.13: Paola authoring flow manual a11y sweep (VoiceOver + NVDA)

As a solo dev,
I want manual accessibility validation of Paola's full authoring + epoch flow with VoiceOver (macOS) and NVDA (Windows),
So that keyboard-first does not mean screen-reader-broken — field labels, save-state transitions, epoch-bump dialog focus handling, and inline-edit commits all announce correctly to assistive tech.

**Acceptance Criteria:**

**Given** Stories 2.9, 2.10, 2.11, 2.12 have landed (projects + detail + FeatureListEditor + EpochBump pattern + EpochSelector)
**When** Kanaud executes the documented manual a11y checklist for Paola's authoring surface
**Then** VoiceOver on macOS Safari correctly announces: project name/version fields on focus, each FeatureListEditor cell label and current value on Tab, inline-edit commit (Enter) as a state change, EpochBumpDialog title and consequence list when it opens, and focus-return to the triggering edit site when the dialog dismisses
**And** NVDA on Windows Firefox announces the same events consistently (noting any cross-platform differences documented as known issues)
**And** focus management is correct end-to-end: no focus traps, no focus-loss on route transition, modal open/close restores focus to trigger, `<EpochSelector>` dropdown arrow-key navigation is audible
**And** `axe-core` CI check on `/app/projects`, `/app/projects/:id`, and `/app/projects/:id?epoch=N` reports zero violations across populated and empty states
**And** the manual checklist results are committed as `docs/a11y/paola-authoring-checklist.md` with a dated signoff and screenshots of any issues found/fixed
**And** any issues discovered are either fixed in this story or filed as follow-up tickets with explicit acceptance criteria

---

## Epic 3: Poll Generation & Sharing (with respondent landing stub)

Paola generates a UUIDv4 poll URL with 7-day TTL, sees a QR preview, hands it off via one-click copy. Polls across projects appear in the PM home poll list. The public `/poll/<uuid>` route resolves to a themed respondent-landing stub ("poll coming soon" for live polls) or the full expired-page experience for expired polls — so Critical Success Moment 2 is demoable at E3 merge. The respondent route-level code split boundary is established here.

**Note:** FR27 (expired-poll page UX) ships in this epic alongside the respondent-landing stub. FR16 (reject expired submissions) stays in Epic 4 where the submit endpoint lives.

### Story 3.1: Poll SQLAlchemy model and Pydantic schemas

As a solo dev,
I want the `Poll` SQLAlchemy model and its Pydantic schemas,
So that poll creation, listing, and respondent-side reading share a single typed contract.

**Acceptance Criteria:**

**Given** the `Poll` declarative model in `src/kano/models/poll.py`
**When** a poll row exists
**Then** the model's `Mapped[T]` columns match migration 0001 (id UUID PK, project_id UUID, epoch INT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ), with composite FK `(project_id, epoch)` pinning to an immutable feature-set snapshot
**And** `src/kano/schemas/poll.py` exposes `PollSummary` (list-item projection: id, project_id, epoch, created_at, expires_at, response_count, is_expired) and `PollPublic` (respondent-facing: id, expires_at, features array with feature_key, name, description)
**And** ID generation uses `uuid4()` at the application layer

### Story 3.2: Create poll endpoint pinned to current epoch with 7-day TTL

As a PM,
I want to generate a new poll for a project that pins to the current epoch and expires in 7 days,
So that I receive a shareable URL I can send to customers.

**Acceptance Criteria:**

**Given** a project at `current_epoch = N` with at least one active feature on epoch N
**When** I `POST /api/v1/projects/:id/polls` (empty body; CSRF-protected)
**Then** the response is 201 Created with a `PollSummary` body including the newly generated UUIDv4 `id`, `epoch: N`, `expires_at = now() + interval '7 days'` (UTC TIMESTAMPTZ), `response_count: 0`
**And** the response `Location` header points at `/api/v1/polls/:id`
**And** a row is persisted in `polls` with `(project_id, epoch)` referencing the snapshot from Story 2.6's epoch-frozen feature rows
**Given** a project with zero active features on the current epoch
**When** I `POST /api/v1/projects/:id/polls`
**Then** the response is 422 Unprocessable Entity with Problem Details `type=poll-requires-features`, `detail` explaining the feature list is empty
**And** the endpoint is documented in `openapi.yaml`
**And** an integration test asserts that bumping the epoch after poll creation leaves the poll pinned to its original epoch (no silent drift)

### Story 3.3: Poll list endpoints — per-project and cross-project

As a PM,
I want to retrieve the polls for a given project AND the global list of polls across all my projects,
So that I can render both the per-project poll section and the PM home poll-list screen.

**Acceptance Criteria:**

**Given** a project with several polls
**When** I `GET /api/v1/projects/:id/polls`
**Then** the response is 200 with a bare JSON array of `PollSummary` items for that project, sorted by `created_at` descending, each carrying a computed `response_count`
**Given** any number of polls across projects
**When** I `GET /api/v1/polls`
**Then** the response is 200 with a bare JSON array of `PollSummary` items across all projects, each enriched with `project_id`, `project_name`, and `project_version` for the PM home display; sorted by `created_at` descending
**And** expired polls are included in both lists but each response includes a derived `is_expired` boolean
**And** both endpoints are documented in `openapi.yaml` and CSRF-protected for consistency with other `/app/*`-consumed endpoints

### Story 3.4: Public poll-by-UUID read endpoint (CSRF-exempt)

As a respondent with a poll URL,
I want to fetch the poll's feature list and expiry status,
So that the respondent landing can render the correct state (live, expired, not-found).

**Acceptance Criteria:**

**Given** a valid poll UUID that is not yet expired
**When** I `GET /api/v1/polls/:uuid` from any origin (no CSRF token required)
**Then** the response is 200 with a `PollPublic` body: `id`, `expires_at`, `features` array (feature_key, name, description) from the poll's pinned `(project_id, epoch)` snapshot, ordered by feature `created_at`
**And** the response body contains no PM-facing fields (no project id, no project name, no epoch number)
**Given** a poll UUID whose `expires_at < now()`
**When** I `GET /api/v1/polls/:uuid`
**Then** the response is 410 Gone with Problem Details `type=poll-expired`, `title=Poll is closed`, `status=410`, and no feature list
**Given** a UUID that doesn't match any poll
**When** I `GET /api/v1/polls/:uuid`
**Then** the response is 404 with Problem Details
**And** the endpoint is explicitly marked CSRF-exempt in `middleware/security.py`
**And** the endpoint is documented in `openapi.yaml`

### Story 3.5: PollSharePanel component with URL, QR preview, and one-click copy

As a PM,
I want a `<PollSharePanel>` component that presents the generated URL, an adjacent QR code, and a one-click copy button with clear confirmation,
So that I can confidently hand off the URL to customers with a preview I've verified on my own phone.

**Acceptance Criteria:**

**Given** `<PollSharePanel :poll="poll" />` is rendered with a freshly generated poll
**When** the component mounts
**Then** a read-only monospace URL field displays the full `https://<host>/poll/<uuid>` URL as the largest element on the card
**And** a primary Copy button with a leading mdi clipboard icon sits adjacent to the URL
**And** a QR code (~120×120 px) renders the same URL; the `qrcode` npm library is loaded lazily via dynamic `import('qrcode')` only on first mount of this component (verified via a Vite chunk assertion in CI)
**And** helper text below reads "Share via email or chat — link expires in 7 days" (from copy deck)
**When** I click the Copy button
**Then** the URL is copied to the clipboard via the Clipboard API
**And** the button transitions to "Copied ✓" for ~1 second then reverts
**And** an `aria-live="polite"` snackbar announces "Copied to clipboard" to assistive tech
**And** the QR code has `aria-hidden="true"` (decorative); the URL text is the accessible source of truth
**And** all strings sourced from the copy deck

### Story 3.6: Generate poll UI flow from project detail

As a PM,
I want a "Generate poll URL" primary action on `/app/projects/:id` that calls the create-poll endpoint and then navigates me to the share panel,
So that my authoring flow ends at a shareable URL with zero friction.

**Acceptance Criteria:**

**Given** I'm on `/app/projects/:id` with at least one active feature
**When** I click the "Generate poll URL" primary button
**Then** the SPA calls `POST /api/v1/projects/:id/polls`
**And** on success, the SPA navigates to `/app/projects/:id/polls/:pollId/share` which renders `<PollSharePanel>` with the newly created poll
**And** on 422 `poll-requires-features`, the SPA displays an inline `v-alert` with copy-deck sourced "Add at least one feature before generating a poll"
**Given** I'm on `/app/projects/:id` with zero active features
**When** the page renders
**Then** the "Generate poll URL" button is disabled with a tooltip "Add at least one feature first" (from copy deck)
**And** an integration Playwright test covers the happy path: empty project → add feature → generate poll → land on share panel with URL and QR visible

### Story 3.7: PM polls list view as the PM home screen

As a PM,
I want a `/app/polls` page (default PM route) listing every poll across projects with response counts and expiry,
So that the home screen tells me what's alive and what needs attention at a glance.

**Acceptance Criteria:**

**Given** I navigate to `/` or `/app/` or `/app/polls`
**When** `PmLayout` renders
**Then** the default redirect lands on `/app/polls`
**And** the page shows a dense row-based `v-data-table` of polls with columns: Project (clickable link to `/app/projects/:id`), Version (pinned epoch badge, labeled "Version N"), Response count, Expires in (human countdown like "3 days"), Created; default-sorted by Created descending
**And** clicking a poll row navigates to the share panel for non-expired polls (or to an analysis placeholder route — full analysis ships in E5)
**And** expired polls render with muted row styling and "Expired" instead of a countdown
**And** the empty state (zero polls ever) replaces the table with a primary "Create your first project" CTA routing to `/app/projects` (from Story 2.9)
**And** no search/filter chrome in v1
**And** the `pollsStore` Pinia store mediates state; response counts are computed server-side (from Story 3.3)
**And** all strings sourced from the copy deck

### Story 3.8: Respondent landing stub with expired-page handling

As Paola previewing her own URL on her phone (or a respondent early-clicking an E3-era link),
I want the `/poll/:uuid` route to resolve to a themed respondent shell — either "poll coming soon" for a live poll or the full expired-page experience for expired ones,
So that the QR-preview workflow works at E3 merge, and respondents hitting expired links get a respectful closure with an off-ramp.

**Acceptance Criteria:**

**Given** the respondent route bundle is configured under `/poll/*` in `src/routes/poll/`
**When** the Vite build runs
**Then** the respondent chunk is a separate initial bundle that does not statically import any symbol from `src/routes/app/**` or PM-only Vuetify components
**And** a build-time assertion in the Vite config (or a post-build script) fails the build if the respondent initial bundle exceeds 150 KB gzipped — the gate runs on every `npm run build`, not just in production CI, so regressions fail at commit time rather than in E7
**And** the `size-limit` CI gate (from Story 1.10) mirrors the same assertion for merge-blocking
**Given** I navigate to `/poll/<valid-non-expired-uuid>` on a phone
**When** `RespondentLayout` renders the landing stub
**Then** the page calls `GET /api/v1/polls/:uuid` (from Story 3.4)
**And** on 200 (live poll), the page renders a themed "This poll is ready" placeholder card with copy-deck sourced text "A short survey is being prepared. Please check back shortly." and a Tixeo branding anchor
**And** the stub's root element carries `data-stub="true"` to mark this layout as a placeholder that Story 4.4 will delete (not edit) — the real landing page (Story 4.4) is a fresh composition, not an evolution of this stub
**And** on 410 (expired), the page renders the expired-poll experience per FR27: card with copy-deck sourced "This survey closed before you could respond" + a substantial product-team contact off-ramp link (mailto: or route, configurable)
**And** on 404 (unknown UUID), the page renders a themed "We couldn't find that poll" message with a link back to the product team
**And** the rendered page passes `axe-core` a11y checks (no violations)
**And** the page renders cleanly at 360 px viewport width on mobile
**And** all strings sourced from the copy deck
**And** an E2E Playwright test covers the happy preview flow: generate a poll in the PM SPA, open the URL in a mobile viewport, see the "coming soon" placeholder, encounter no broken or 404 state

---

## Epic 4: Respondent Poll Experience & Submission

Marcus opens the URL on mobile, reads a plain-language landing, answers 8 features × 2 Likert questions with auto-advance and honest progress, submits atomically with Kano categorization computed from the E1 matrix. Partial submissions are silently discarded via transaction rollback. Manual a11y close-out (VoiceOver + TalkBack + 3G throttle + touch audit) gates this epic's merge.

### Story 4.1: Submission and Response models with Pydantic schemas

As a solo dev,
I want the `Submission` and `Response` SQLAlchemy models and the inbound `PollSubmission` Pydantic schema,
So that the respondent submission endpoint has a typed contract that mirrors the schema locked in migration 0001.

**Acceptance Criteria:**

**Given** `src/kano/models/submission.py` and `src/kano/models/response.py`
**When** submission and response rows exist
**Then** the `Submission` model maps (id UUID PK, poll_id UUID FK, submitted_at TIMESTAMPTZ) and the `Response` model maps (submission_id UUID FK, feature_id UUID FK, fq_answer SMALLINT, dq_answer SMALLINT, category CHAR(1)) with composite PK `(submission_id, feature_id)` — all matching migration 0001
**And** `src/kano/schemas/submission.py` exposes `PollSubmission` (inbound body: `answers` list of `{feature_key: UUID, fq_answer: int 1-5, dq_answer: int 1-5}`)
**And** Pydantic validates each answer's `fq_answer` and `dq_answer` are within 1–5; violations raise validation errors at the schema layer
**And** the `Response.category` column reuses the `Category` enum from Story 2.6

### Story 4.2: poll_service.record_full_submission atomic transaction

As a solo dev,
I want `services/poll_service.record_full_submission(poll_id, submission_body)` that either persists one complete submission + its N responses atomically, or nothing,
So that FR25's silent-discard-of-partials rule is enforceable by construction (transaction rollback on any failure).

**Acceptance Criteria:**

**Given** a valid non-expired poll with N active features pinned to `(project_id, epoch)`
**When** `record_full_submission(poll_id, body)` is invoked with answers covering all N features
**Then** the function opens a single SQLAlchemy transaction, creates one `submission` row, computes `Category` via `kano_matrix.compute_category(fq, dq)` for each answer, creates N `response` rows with the computed category, and commits
**And** if any single `response` insert fails (DB constraint, programming error), the transaction rolls back and the function raises `SubmissionFailed`; no `submission` or `response` rows persist
**Given** the submission body is missing an answer for any feature in the poll
**When** `record_full_submission` is invoked
**Then** the function raises `PartialSubmission` before any write; the caller maps this to HTTP 422
**Given** the submission body references a `feature_key` not belonging to the poll's pinned epoch
**When** `record_full_submission` is invoked
**Then** the function raises `InvalidFeatureReference`; the caller maps this to HTTP 422
**Given** the poll's `expires_at < now()`
**When** `record_full_submission` is invoked
**Then** the function raises `PollExpired`; the caller maps this to HTTP 410
**And** `tests/integration/test_submissions_api.py` parametrizes across these four cases and asserts zero leftover rows after each failure path

### Story 4.3: Public poll submission endpoint (CSRF-exempt)

As a respondent,
I want to submit my complete set of Likert answers for a poll via a public POST endpoint,
So that my input is persisted with Kano categorization computed server-side.

**Acceptance Criteria:**

**Given** a valid non-expired poll and a complete submission body
**When** I `POST /api/v1/polls/:uuid/submit` with the `PollSubmission` body (no CSRF token required)
**Then** the response is 204 No Content
**And** a single `submission` row plus N `response` rows are persisted atomically (via Story 4.2)
**Given** a submission body missing at least one answer (partial)
**When** I `POST /api/v1/polls/:uuid/submit`
**Then** the response is 422 with Problem Details `type=partial-submission` per FR24 and FR25
**And** no rows are persisted (verified by integration test counting rows pre/post)
**Given** a poll that has expired
**When** I `POST /api/v1/polls/:uuid/submit`
**Then** the response is 410 with Problem Details `type=poll-expired` per FR16
**Given** a POST to an unknown poll UUID
**When** I `POST /api/v1/polls/:uuid/submit`
**Then** the response is 404 with Problem Details
**And** the endpoint is explicitly CSRF-exempt in `middleware/security.py`
**And** the endpoint stores no PII — only the 16 Likert values + derived `Category` + UTC submission timestamp per NFR8
**And** the endpoint is documented in `openapi.yaml`

### Story 4.4: Respondent landing page replacing the E3 stub

As Marcus,
I want a plain-language landing page that honestly states the time commitment and value exchange before I invest in answering,
So that I can decide to proceed with informed consent rather than wariness.

**Acceptance Criteria:**

**Given** I navigate to `/poll/<valid-non-expired-uuid>`
**When** `RespondentLayout` renders the replaced landing (no longer the E3 stub)
**Then** the E3 stub component (the `data-stub="true"` layout from Story 3.8) is deleted from the codebase, not modified — this story ships a fresh composition per the UX spec, not an evolution of the stub
**And** the page displays a Tixeo branding anchor at the top
**And** a trust line below reads "Tixeo · 2–3 minutes · shapes our roadmap" (exact wording from copy deck)
**And** a single primary "Begin" CTA (48 px tall, thumb-friendly) navigates to `/poll/:uuid/q/0` on tap or click
**And** no cookie banner, no tracking pixel, no "help us improve" opt-in, no email capture — nothing beyond the value exchange copy and the Begin button
**And** the page renders cleanly at 360 px viewport width
**And** on 410 (expired), the page renders the FR27 expired experience from Story 3.8 (shared copy-deck source, same off-ramp)
**And** all strings sourced from the copy deck

### Story 4.5: KanoLikert component with auto-advance and keyboard 1–5

As Marcus,
I want a single Likert picker that shows me 5 plain-language options stacked vertically, auto-advances when I tap one, and respects my reduced-motion preference,
So that I don't feel interrogated by Next buttons or thrashed by animation.

**Acceptance Criteria:**

**Given** `<KanoLikert :question="'functional'|'dysfunctional'" :feature="f" v-model="answer" />` is rendered on a mobile viewport
**When** the component mounts
**Then** the question text is rendered above at respondent body-large (18 px, weight 500), ≤2 lines, from the copy deck
**And** 5 full-width option cards render stacked vertically, each ≥56 px tall, ≥44 px touch target, with copy-deck sourced labels ("I'd love it", "nice-to-have", "neutral", "can live without it", "would dislike it")
**And** the component wraps Vuetify's `v-radio-group` primitive under the hood
**When** I tap one option
**Then** the option shows ~150 ms visual confirmation (color fill + scale transition) and then the component emits an `auto-advance` event
**When** `prefers-reduced-motion: reduce` is set
**Then** the 150 ms confirmation collapses to an instant state change and the `auto-advance` event fires immediately
**And** keyboard `1`–`5` picks options 1–5 respectively; Tab focuses the first option; arrow keys navigate between options; Enter/Space selects the focused option
**And** the component carries `aria-label` on the radio group referencing the feature being evaluated (e.g. "How do you feel if SSO is available?") sourced from the copy deck
**And** in the `error` variant (post-submit validation when unanswered), a red border + inline error message is rendered; copy-deck sourced
**And** a Vitest unit test covers keyboard `1`–`5` picking, auto-advance emission, reduced-motion behavior, and error-state rendering

### Story 4.6: One-question-per-screen respondent flow with honest progress

As Marcus,
I want to answer one question per screen with a progress bar, tap-back navigation, and a halfway acknowledgement that feels honest and sparing,
So that the 16-question sequence feels like one continuous experience rather than a bureaucratic form.

**Acceptance Criteria:**

**Given** a poll with N features (so 2N questions) and I've tapped Begin
**When** the `/poll/:uuid/q/:index` route renders
**Then** exactly one `<KanoLikert>` instance is visible at a time, showing either the functional or dysfunctional question for the feature at index ⌊:index/2⌋ per FR21
**And** a `v-progress-linear` bar at the top shows true fraction (e.g., "Question 9 of 16" with bar filled proportionally) per FR23 and honest-progress rule
**And** answering via tap or keyboard auto-advances to `/poll/:uuid/q/:index+1` without a full-page reload (client-side routing)
**And** tap-back gesture (browser back) or Esc / ← Backspace navigates to the previous question; the previously-selected answer remains selected for editing per FR24 reversible-before-commit
**And** at the question index representing the halfway point (index = N, half of 2N), a one-line microcopy acknowledgement is shown above the progress bar (copy-deck sourced: "Halfway there — this is genuinely helpful"), visible for one question then dismissed
**And** the answer draft is held in an in-memory `useResponseDraft()` composable; closing the tab discards it silently per FR25 (no localStorage, no sessionStorage)
**And** mid-flow network failure on an auto-advance route transition shows an inline "Something went wrong — please retry" alert with a Retry button; no data is lost client-side
**And** the `pollPublicStore` Pinia store caches the poll's feature list + expires_at from the single `GET /api/v1/polls/:uuid` call made on the landing

### Story 4.7: Terminal Submit with inline missing-answer error and thank-you page

As Marcus,
I want a final Submit action after the last question that either sends my complete response or tells me exactly which answer I missed, and a thank-you page that names what happens next,
So that I close the interaction with small satisfaction rather than a transaction.

**Acceptance Criteria:**

**Given** I've answered all 2N questions
**When** I land on `/poll/:uuid/q/:lastIndex` (the last question) and select my answer
**Then** auto-advance routes to `/poll/:uuid/submit-confirm` with a "Review & submit" card and a single primary Submit button (48 px, thumb-friendly)
**When** I tap Submit
**Then** the SPA POSTs `/api/v1/polls/:uuid/submit` with the full `PollSubmission` body from the in-memory draft
**And** on 204, the SPA navigates to `/poll/:uuid/thanks`
**Given** my draft somehow lacks an answer (defensive guard)
**When** I attempt to Submit
**Then** the SPA checks completeness client-side first and, if missing, navigates back to the specific missing question's `/poll/:uuid/q/:index` with an inline `<KanoLikert>` error state highlighting that one question per FR24 and UX-DR27 (inline error at the source, not a top-level banner)
**When** the server rejects the submission with 422 `partial-submission` or `invalid-feature-reference`
**Then** the same inline-at-source error pattern applies — the SPA parses the Problem Details, identifies the offending question, and routes back with the error state
**Given** I arrive on `/poll/:uuid/thanks`
**When** the thank-you page renders
**Then** the page shows "Thanks — your input is on the record" and a closing line acknowledging the PM will see the input within a short horizon (exact copy-deck sourced strings per UX-DR25)
**And** no next-action CTA, no social-share, no "answer another survey" — just the closing
**And** all copy sourced from the copy deck

### Story 4.8: Respondent flow accessibility close-out and manual gates

As a solo dev,
I want the full respondent flow to pass automated a11y gates plus documented manual smoke tests on real devices,
So that Marcus's experience works for assistive tech users, over cellular, on the device he actually uses.

**Acceptance Criteria:**

**Given** the respondent flow is complete end-to-end (landing → question × 2N → submit-confirm → thanks, plus expired page)
**When** the `axe-core` CI check runs on each respondent route
**Then** zero violations are reported across all states (landing, question, submit-confirm, thanks, expired)
**And** a Playwright E2E test completes the full keyboard-only flow using `1`–`5` keys for each Likert question plus Enter/Tab navigation — no mouse or touch events
**And** respondent touch-target audit (automated check in the E2E) asserts every interactive element renders ≥44 × 44 px on a 360 px viewport
**And** `useResponseDraft()` respects `prefers-reduced-motion`: auto-advance transition is instant, progress bar updates without fill animation, halfway-microcopy renders without fade
**Given** manual milestone verification before the epic closes
**When** Kanaud executes the documented manual a11y checklist
**Then** VoiceOver on iOS Safari (14+) correctly announces every Likert option, the question being answered, and the progress state
**And** TalkBack on Android Chrome correctly announces the same
**And** DevTools 3G throttle test confirms landing → first question renders within acceptable latency (no stuck states, no race conditions between route change and draft initialization)
**And** a real iOS device and a real Android device each successfully complete an 8-feature poll to the thanks page without intervention
**And** the manual checklist results are committed as `docs/a11y/respondent-checklist.md` with screenshots or a dated signoff

---

## Epic 5: Analysis & Insight

Paola opens the analysis page and reads a roadmap-ready artifact: per-feature table row with dominant category + % + tie handling + 6-segment stacked bar + accessible data-table fallback, per-category cross-index panels, empty state, confidence-beat meta line, on-demand category tooltips. Backend serves in a single SQL round-trip under 3s p95 on seeded 20×500 dataset. Manual a11y close-out on the tie-state screen-reader experience gates merge.

### Story 5.1: services/analysis.build_analysis with single GROUP BY query

As a solo dev,
I want `services/analysis.build_analysis(poll_id) -> PollAnalysis` executing a single `GROUP BY feature_id, category` SQL round-trip and shaping the result in Python,
So that NFR3 is enforced by construction — no per-feature iteration in the application layer.

**Acceptance Criteria:**

**Given** a poll with feature list pinned to `(project_id, epoch)` and M submissions covering those features
**When** `build_analysis(poll_id)` is invoked
**Then** the function executes exactly one SQL query of the shape `SELECT f.id, f.feature_key, f.name, f.description, r.category, COUNT(*) AS cnt FROM feature f LEFT JOIN submission s ON s.poll_id = :poll_id LEFT JOIN response r ON r.submission_id = s.id AND r.feature_id = f.id WHERE f.project_id = :project_id AND f.epoch = :epoch GROUP BY f.id, f.feature_key, f.name, f.description, r.category ORDER BY f.id, r.category`
**And** the result is shaped in pure Python into a `PollAnalysis` structure: `total_submissions` count, per-feature list of `{feature_key, name, description, distribution: {category: count}, dominant_categories: [Category], dominant_percentage: float}`
**And** `dominant_categories` is a list of 1+ categories — a single winner when uniquely dominant, or all tied winners (per FR35); `dominant_percentage` is the shared percentage
**And** `tests/integration/test_analysis_api.py` uses SQLAlchemy event listeners to assert exactly one SQL query executes per `build_analysis()` call (query count = 1 assertion)
**And** a parametrized integration test covers: zero submissions (empty distribution), single dominant category, tied dominants (2-way and 3-way), all-same-category
**And** the module's query uses the indexes on `(project_id, epoch)` from migration 0001 (verified via `EXPLAIN` inspection in a test)

### Story 5.2: Public poll analysis endpoint

As a PM or anyone with the poll URL,
I want `GET /api/v1/polls/:uuid/analysis` returning the fully computed analysis payload,
So that the analysis page renders from a single request with no client-side aggregation.

**Acceptance Criteria:**

**Given** a valid poll UUID
**When** I `GET /api/v1/polls/:uuid/analysis` (no CSRF token required — publicly accessible per FR32)
**Then** the response is 200 with a `PollAnalysis`-shaped JSON body: `{poll_id, epoch, total_submissions, features: [{feature_key, name, description, distribution: {M, L, E, I, C, D}, dominant_categories: [Category], dominant_percentage}]}`
**And** distribution keys always include all 6 categories (M, L, E, I, C, D) even when count is 0, so the stacked bar always has 6 segments to render
**Given** a poll with zero submissions
**When** I `GET /api/v1/polls/:uuid/analysis`
**Then** the response is 200 with `total_submissions: 0`, `features` containing each feature with empty distribution and `dominant_categories: []`, `dominant_percentage: 0` — the frontend uses this to render the empty state per FR37
**Given** a poll UUID that doesn't exist
**When** I `GET /api/v1/polls/:uuid/analysis`
**Then** the response is 404 with Problem Details
**Given** an expired poll that has accumulated submissions
**When** I `GET /api/v1/polls/:uuid/analysis`
**Then** the response is 200 with the full analysis — analysis remains readable after expiry (FR32 is public regardless of TTL)
**And** the endpoint is CSRF-exempt per the pattern in `middleware/security.py`
**And** the endpoint is documented in `openapi.yaml`

### Story 5.3: CatBadge component for Kano category rendering

As a PM reading the analysis page,
I want a `<CatBadge>` component that renders the human-readable category name with a color swatch wherever a category is referenced,
So that category identity is instantly recognizable and I never have to decode letter codes.

**Acceptance Criteria:**

**Given** `<CatBadge :category="Category.MANDATORY" />` is rendered
**When** the component mounts
**Then** it renders an inline-flex element with a 10×10px color swatch (rounded 2px corners) and the human-readable category name in 14px weight-600 (copy-deck sourced: "Must-have", "Performance", "Delighter", "Indifferent", "Reverse", "Questionable")
**And** the swatch color is sourced from the Tixeo Kano palette tokens (Must-have indigo-800, Performance teal-600, Delighter violet-600, Indifferent gray-500, Reverse amber-700, Questionable stone-500) per UX-DR2
**And** the swatch carries `aria-hidden="true"` (decorative); the category name text carries all semantic meaning — color is never the sole information channel
**And** all 6 variants are rendered in the theme-audit screen (Story 1.8) as a regression artifact
**And** a Vitest unit test covers all 6 category variants asserting correct label and color token application
**And** FR38 is satisfied: category labels use full human-readable names from the copy deck, never bare letter codes

### Story 5.4: KanoStackedBar SVG with KanoStackedBarTable accessible fallback

As a PM reading the analysis,
I want a `<KanoStackedBar>` SVG showing the per-feature category distribution plus an accompanying `<KanoStackedBarTable>` hidden from sighted users but fully available to screen readers,
So that I can see the distribution at a glance AND users of assistive tech get the same information via a tabular reading.

**Acceptance Criteria:**

**Given** `<KanoStackedBar :distribution="d" :total="n" variant="default" />` is rendered with a non-empty distribution
**When** the component mounts
**Then** an inline SVG renders 6 proportional horizontal segments in fixed order (Must-have → Performance → Delighter → Indifferent → Reverse → Questionable) using Kano palette tokens; `default` variant is 12 px tall
**And** the outer `<svg>` carries `role="img"` and `aria-labelledby` pointing at the `id` of the companion `<KanoStackedBarTable>`
**And** each segment has `tabindex="0"` for keyboard focus parity with hover
**When** I hover or keyboard-focus a segment
**Then** a `v-tooltip` appears showing `<Category name>: N responses (X%)` from the copy deck
**Given** `<KanoStackedBarTable :distribution="d" :total="n" />` is rendered alongside
**When** the component mounts
**Then** a `<table>` with columns Category, Count, Percentage renders 6 rows (one per category) populated from the same distribution
**And** the table is hidden from sighted users via the SR-only CSS pattern (`clip: rect(0 0 0 0)`, `width: 1px`, `position: absolute`) — but remains in the accessibility tree
**And** the table carries a stable `id` referenced by the sibling `<KanoStackedBar>`'s `aria-labelledby`
**And** an optional `<ToggleDataTable>` affordance lets sighted users reveal the table alongside the bar
**And** the Kano palette passes protanopia/deuteranopia/tritanopia simulator checks (evidence committed at `docs/a11y/kano-palette-simulator.png` or equivalent)
**And** `variant="large"` (16 px) and `variant="mini"` (4 px) alternatives are defined even if only `default` is used in v1 analysis
**And** NFR10 is satisfied

### Story 5.5: Analysis page table composition with dominant, tie, empty state, confidence beat

As Paola,
I want the analysis page rendered as a table-row composition with feature | dominant category + % | distribution bar | n count, plus an empty state for zero responses and a quiet confidence-beat meta line,
So that I can scan the dominant column top-to-bottom to read claims and share the screen with stakeholders without reformatting.

**Acceptance Criteria:**

**Given** I navigate to `/app/projects/:id/polls/:pollId/analysis`
**When** the page renders and `total_submissions > 0`
**Then** the page shows a header with project name + "Version N" badge + confidence-beat meta line ("N of N responses" — secondary text weight, not a blocking banner) per UX-DR21
**And** a `v-data-table` below shows one row per feature with columns: Feature (name bold 14px + description 12px muted), Dominant (20px tabular-number percentage + `<CatBadge>`s below), Distribution (`<KanoStackedBar>` + hidden `<KanoStackedBarTable>`), n (response count, tabular numerals, right-aligned)
**And** when a feature has a single dominant category, the Dominant cell shows "71%" + a single `<CatBadge>`
**And** when 2+ categories are tied (FR35), the Dominant cell shows "40% each" + two or more `<CatBadge>`s joined by `/`; the stacked bar renders tied segments at equal width (no extra ornamentation — equal width IS the visual signal)
**Given** `total_submissions == 0`
**When** the page renders
**Then** the data table is replaced entirely by a single empty-state block with copy-deck sourced "0 of N expected responses — analysis will populate as responses arrive" per FR37
**And** empty bars or zero-percent dominant categories are never rendered (not even with 0% labels)
**And** the table container has a fixed max-width matching the 1440px PM content width so screenshots frame consistently per UX-DR22
**And** hover on a row highlights it (`surface-bright` background)
**And** click on a row is reserved for post-MVP drill-down (no navigation in v1)
**And** all strings sourced from the copy deck

### Story 5.6: PerCategoryPanels secondary cross-index

As Paola,
I want a secondary cross-index below the analysis table listing features grouped under the category for which they are dominant,
So that I can answer "which features are Must-have?" with a vertical scan instead of a grid search.

**Acceptance Criteria:**

**Given** the analysis page renders with `total_submissions > 0`
**When** `<PerCategoryPanels>` mounts below the table
**Then** one panel (section) renders per Kano category that has at least one feature where it is dominant (FR36)
**And** each panel has a section header composed of `<CatBadge>` + category name in `<h3>`
**And** each panel body is a `<ul>` of `<li>` feature entries; each entry shows feature name + dominant-category percentage; each entry is an anchor link jumping to the corresponding row in the analysis table above (smooth scroll, focus moves to the target row)
**And** panels for categories with zero dominant features are omitted entirely (not rendered as empty)
**And** when a feature is tied-dominant across multiple categories, it appears in each tied category's panel (not deduplicated) per FR35 treatment
**And** all strings sourced from the copy deck
**And** the component is keyboard-navigable: Tab through anchor links, Enter activates, focus management on jump

### Story 5.7: Category help tooltips on first use

As Paola on her first analysis-page visit,
I want an on-demand help affordance that explains each Kano category and the meaning of dominant-category ties,
So that I can onboard myself without documentation or a guided walkthrough.

**Acceptance Criteria:**

**Given** I'm on the analysis page
**When** I hover or keyboard-focus any `<CatBadge>` instance on the page
**Then** after ~300 ms a `v-tooltip` appears with a short (≤2 lines) explanation of that Kano category from the copy deck (e.g., "Must-have: users expect this feature; its absence causes frustration")
**And** a small (i) icon appears adjacent to the confidence-beat line; clicking/focusing it opens a `v-tooltip` or popover explaining the meaning of a dominant-category tie ("When two categories share the top position, customer opinion is genuinely split — both categories are equally dominant")
**And** tooltips are keyboard-accessible (focus-triggered + escape-dismissible)
**And** tooltip copy is sourced from the copy deck; no inline literals
**And** tooltip content is never load-bearing — every category is always also labeled visibly (via `<CatBadge>`); the help is purely for first-use curiosity per FR39
**And** FR39 is satisfied: on-demand explanatory content is available on first use without dependency on human pairing

### Story 5.8: Analysis performance test and accessibility close-out

As a solo dev,
I want the analysis page to meet NFR1 (3s p95) on a realistic seeded dataset AND to pass keyboard-only + VoiceOver smoke tests — particularly on the tie-state reading,
So that Paola's defining-experience scan is quantifiably fast and genuinely accessible before the epic closes.

**Acceptance Criteria:**

**Given** a seeded dataset with 20 features and 500 submissions on a single poll
**When** the Playwright navigation-timing E2E test runs in CI
**Then** the analysis page load + render completes within 3 seconds at p95 across multiple runs (NFR1)
**And** the `axe-core` CI check on `/app/projects/:id/polls/:pollId/analysis` reports zero violations in both the populated and empty-state renderings
**And** a Playwright keyboard-only E2E test completes a full analysis-page scan: Tab through each row's `<CatBadge>` (focus reveals tooltip), Tab through each `<KanoStackedBar>` segment, Tab through PerCategoryPanels anchor links, Enter to jump to a table row, no mouse events
**Given** manual milestone verification before epic close
**When** Kanaud executes the documented manual a11y checklist for analysis
**Then** VoiceOver on macOS Safari correctly announces a tie-state row ("Live translation: tied dominant, Must-have and Performance, 40% each")
**And** VoiceOver announces the `<KanoStackedBarTable>` data-table fallback when the stacked bar is in focus
**And** screenshot framing holds at 1440 px PM content width — no horizontal scroll, no UI clipping
**And** the manual checklist results are committed as `docs/a11y/analysis-checklist.md`

---

## Epic 6: Data Durability & Operational Readiness

Prove data durability against local Postgres, not in production. Nightly `pg_dump -Fc` to a separately-mounted volume with 14-day rolling retention. Restore-drill procedure documented and executed end-to-end (dump → fresh Postgres container → restore → app boots cleanly against restored state). Slow-query log config scaffolded for production handoff. This epic can start after Epic 2 (schema + meaningful data) and must complete before Epic 7 (launch).

### Story 6.1: Backup service with nightly pg_dump to separate volume and 14-day retention

As a solo dev,
I want a dedicated `backup` container in `docker-compose.yml` running nightly `pg_dump -Fc` to a separately-mounted volume with 14-day rolling retention,
So that authoring effort invested in local dogfood projects is protected from the moment data is worth protecting, and the production backup mechanism is battle-tested against a local stack before cutover.

**Acceptance Criteria:**

**Given** `docker-compose.yml` from Story 1.9
**When** the stack is up
**Then** a `backup` service is defined (Dockerfile at `ops/backup/Dockerfile`) running a lightweight cron base with `postgresql-client-17` installed
**And** a separate named volume (`backups_volume`) is mounted at `/backups` inside the `backup` container — this volume is distinct from the primary Postgres data volume per NFR12
**And** `ops/backup/pg_dump.sh` runs daily (via cron or restart-policy equivalent) executing `pg_dump -Fc -h db -U ${POSTGRES_USER} ${POSTGRES_DB} > /backups/kano-$(date -u +%Y%m%dT%H%M%SZ).dump`
**And** a companion retention script deletes `/backups/kano-*.dump` files older than 14 days on each run, keeping the rolling window
**And** the script logs successes and failures to stdout (captured by `docker logs` per the structured-logging pattern in Story 1.3); a non-zero exit on `pg_dump` failure surfaces as a visible container log
**And** in dev/compose, the cron schedule can be overridden to "run immediately on container start once" via an env flag to make iteration tractable
**And** an integration test (manual or scripted via `docker compose exec backup /ops/backup/pg_dump.sh`) produces a valid `.dump` file, verified by running `pg_restore --list` against it

### Story 6.2: Restore-drill runbook with executed dry-run

As a solo dev,
I want `ops/restore-drill.md` documenting the full restore procedure from dump to booted application, plus evidence of at least one successful execution committed to the repo,
So that NFR13's "restore-test executed at least once" gate is satisfied against local infrastructure before launch.

**Acceptance Criteria:**

**Given** a dump file produced by Story 6.1
**When** I follow the step-by-step procedure in `ops/restore-drill.md`
**Then** the runbook walks through: taking a fresh dump from the running `db` container, stopping the stack, spinning up a clean Postgres container with an empty data volume, restoring the dump via `pg_restore`, running `alembic upgrade head` to confirm schema compatibility, restarting the `api` and `web` services pointed at the restored DB, hitting `GET /api/v1/health` and confirming 200, and spot-checking that at least one seeded project + poll + submissions survives the round trip
**And** the runbook names expected failure modes and remediation (dump file corrupt, Postgres major version mismatch, Alembic out-of-sync)
**And** at least one successful drill execution is evidenced in `ops/restore-drill-logs/<dated>.md` or equivalent: a dated log file capturing command output of the full procedure, committed to the repo
**And** the runbook is cross-linked from the monorepo `README.md` under an "Operations" section
**And** NFR13 is satisfied against local infra (will be re-executed against the production VPS in E7 before the first real study)

### Story 6.3: PostgreSQL slow-query log configuration

As a solo dev,
I want the Postgres container configured to log queries exceeding 500ms,
So that observability is scaffolded in-repo and production handoff in E7 is a config-file rename, not a fresh investigation.

**Acceptance Criteria:**

**Given** the `db` service in `docker-compose.yml`
**When** the container starts
**Then** the Postgres container is launched with `command: postgres -c log_min_duration_statement=500` (or equivalent via a mounted `postgresql.conf` fragment)
**And** in development, the config is active by default so local-dev slow queries surface during development
**And** `docker logs <db-container>` shows slow-query log lines when a query exceeds 500 ms
**And** a smoke test (a deliberate `SELECT pg_sleep(0.6)` query) confirms the log fires
**And** the configuration is documented in `ops/runbook.md` (scaffolded as a stub — full runbook ships in E7) so production deployment inherits the setting
**And** NFR16 is partially satisfied (config scaffolded; production cutover confirms it remains active in E7)

### Story 6.4: Internal dogfood study on local stack

As Kanaud (solo dev + proxy-PM for the first internal study),
I want to run ONE real Kano-methodology study on the local stack against 3–5 Tixeo colleagues (not paying customers) before any production deploy,
So that the MVP's full user journey is validated by a real human before the first real customer sees the URL — catching UX friction, copy issues, and category-interpretation problems while the design context is still fresh.

**Acceptance Criteria:**

**Given** Epics 1–5 are complete (full product journey works end-to-end on local) and Stories 6.1–6.3 are complete (durability scaffolded)
**When** Kanaud authors a real project about a real internal question (e.g., "what should the next Tixeo all-hands focus on?") and generates a poll
**Then** the poll URL is shared externally with 3–5 Tixeo colleagues via Kanaud's normal email/chat channels — not via a demo walkthrough
**And** at least 3 colleagues complete the poll on their phones without asking Kanaud a clarifying question (if any do ask, the question is logged as UX friction in the retrospective)
**And** Kanaud reads the resulting analysis page and gut-checks it: do the dominant categories match what Kanaud would expect from these specific colleagues on this specific question? If not, treat as a signal that E5 has a correctness bug worth investigating
**And** the exercise covers the timed Critical Success Moment 1 promise: Kanaud measures empty-state → shareable-URL time and asserts it is under 5 minutes (per the PRD Success Criteria)
**And** a written retrospective is committed as `docs/dogfood-retrospective.md` capturing: what worked, what broke, what needed a second look, time-to-shareable-URL measurement, completion rate, any blocking UX issues surfaced
**And** any ship-blocking issue found is patched inline before E7 starts; non-blocking issues are filed as follow-up tickets
**And** this story gates the start of Epic 7 (no deploy until dogfood is green and the retro is committed)

---

## Epic 7: Deploy & Launch

kano is publicly reachable at its production domain: Hetzner VPS provisioned, Caddy terminating TLS via automatic Let's Encrypt with HSTS, `docker-compose.prod.yml` composing web + api + db + backup services, GitHub Actions CD pipeline, size-limit + axe-core merge gates wired across every production route, restore-drill re-executed against production, first real PM study as the ultimate acceptance test.

### Story 7.1: Hetzner VPS provisioning and production compose overlay

As a solo dev,
I want a provisioned Hetzner Cloud VPS (EU data residency) with Docker installed, `/opt/kano/` checkout layout, `docker-compose.prod.yml` overlay, and host-injected production secrets,
So that the deploy pipeline has a fixed target and the production compose stack is reproducible.

**Acceptance Criteria:**

**Given** a freshly provisioned Hetzner Cloud VPS (CX22 or equivalent, EU region)
**When** I follow `ops/provisioning.md` bootstrap steps
**Then** the VPS has: Docker + docker-compose plugin installed, non-root deploy user with minimal sudo scoped to docker commands, SSH key-based auth only (password auth disabled), UFW firewall permitting only 22/80/443, a separate Hetzner Volume attached and mounted at `/opt/kano/volumes/backups/` per NFR12
**And** `/opt/kano/` is checked out or symlinked from the repo with `docker-compose.yml` + `docker-compose.prod.yml`
**And** `docker-compose.prod.yml` overrides: removes dev volume mounts for source code, replaces Vite dev server with a Caddy-served static build of the Vue SPA, switches Flask to gunicorn (2 workers × 2 threads), points the `backup` service at the Hetzner Volume mount, and injects `KANO_ENV=production`
**And** production secrets (DB credentials, `KANO_VERSION`, CORS origin allowlist, CSRF secret) are injected via host environment variables at `/etc/environment` or a systemd EnvironmentFile — never committed to the repo
**And** `ops/provisioning.md` documents the bootstrap procedure; `ops/runbook.md` documents deploy/rollback/diagnose playbooks

### Story 7.2: Caddy reverse proxy with automatic TLS and HSTS

As a user browsing to the kano production domain,
I want HTTPS served automatically with zero-config certificate management and HTTP→HTTPS redirect,
So that all production traffic is TLS-protected and the browser address bar shows the padlock with no surprises.

**Acceptance Criteria:**

**Given** a production domain with DNS pointing at the Hetzner VPS
**When** Caddy starts via the `web` service container
**Then** a `Caddyfile` at the repo root configures Caddy to serve the built Vue SPA (`/dist`) from `/`, reverse-proxy `/api/*` to the Flask `api:8000` socket, issue an automatic Let's Encrypt certificate via ACME for the configured domain, and force redirect HTTP → HTTPS
**And** in production only, an HSTS header with `max-age=31536000; includeSubDomains` is emitted on all responses
**And** in local dev, HSTS is disabled (environment-gated) so localhost development is unaffected
**And** Caddy's automatic certificate renewal is verified to run without intervention (tested by artificially forcing a renew in a staging run)
**And** `curl -I https://<domain>/api/v1/health` returns 200 with TLS negotiated cleanly
**And** an `ssllabs.com` (or equivalent) scan of the domain returns at minimum a B grade

### Story 7.3: GitHub Actions CD pipeline with build, push, and SSH deploy

As a solo dev,
I want a GitHub Actions workflow that, on merge to main, builds both Docker images, pushes them to GitHub Container Registry, SSHes to the Hetzner VPS, and deploys with a rolling restart plus alembic upgrade,
So that every merged change reaches production within minutes and deploys are boring.

**Acceptance Criteria:**

**Given** a PR merges to `main` with a green CI (from Story 1.10)
**When** the `.github/workflows/deploy.yml` deploy workflow triggers
**Then** the workflow builds `ghcr.io/<org>/kano-api:<git-sha>` and `ghcr.io/<org>/kano-web:<git-sha>` via each service's multi-stage Dockerfile, pushes to GitHub Container Registry, SSHes to `deploy@<hetzner-host>:/opt/kano/`, runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull`, runs `docker compose ... up -d --no-deps api web` for a rolling restart, runs `docker compose exec api alembic upgrade head`, and sanity-hits `GET /api/v1/health` asserting 200
**And** GHCR deploy key and SSH key secrets are stored in GitHub Actions secrets, never committed
**And** the workflow tags each build with both `<git-sha>` and `latest`; rollback is documented as `docker compose -f ... up -d --no-deps api=ghcr.io/<org>/kano-api:<previous-sha>` in `ops/runbook.md`
**And** deploy step failures (build fail, SSH fail, migration fail, health check fail) mark the workflow run red with a visible notification to Kanaud (GitHub's default PR/workflow notifications)
**And** `KANO_VERSION` env var on the running container is set to the deployed git-sha so the `/api/v1/health` endpoint's `version` field reflects what's live

### Story 7.4: First production deploy with production restore-drill

As a solo dev,
I want the production stack stood up end-to-end and the restore-drill re-executed against the live Hetzner VPS before any real study,
So that production durability is verified (not just local durability from E6) and the system is provably recoverable on the target infrastructure.

**Acceptance Criteria:**

**Given** Stories 7.1, 7.2, 7.3 are complete
**When** the first CD run executes a production deploy
**Then** `docker compose ps` on the VPS shows all 4 services (`web`, `api`, `db`, `backup`) running
**And** `curl https://<prod-domain>/api/v1/health` returns 200 with `status: ok`, `db: connected`, `version: <git-sha>`
**And** the first nightly `pg_dump` executes successfully and writes to the Hetzner Volume mount; the `.dump` file is visible via `docker compose exec backup ls /backups/`
**Given** a production dump has been taken
**When** Kanaud executes the `ops/restore-drill.md` procedure from Story 6.2 against the production VPS (on a staging Postgres container, not overwriting prod data)
**Then** the full restore succeeds: dump → fresh container → `pg_restore` → `alembic upgrade head` → sanity check
**And** the production drill log is committed as `ops/restore-drill-logs/<dated>-prod.md`
**And** NFR13 is fully satisfied against the production environment

### Story 7.5: Final quality gates sweep across production routes

As a solo dev,
I want axe-core, size-limit, and manual a11y gates validated against the production build and the production domain before opening the tool to Paola,
So that no regression slipped in during the deploy-infra work and all NFR11-aligned commitments are verified on the actual artifact users will touch.

**Acceptance Criteria:**

**Given** production is deployed
**When** the CI runs axe-core against every production route accessible via `https://<prod-domain>` (PM home, project list, project detail, share panel, analysis page populated, analysis page empty-state, respondent landing, respondent question, respondent thanks, expired link)
**Then** zero a11y violations are reported
**And** `size-limit` on the production build output confirms the respondent initial bundle is <150 KB gzipped (per Story 1.10 threshold)
**And** `ssllabs.com` (or equivalent TLS scan) on the production domain confirms at minimum a B grade from Story 7.2 still holds
**And** Kanaud executes a final manual smoke across PM + respondent flows using the deployed prod build on a real iOS device, a real Android device, and a desktop Chrome; no regressions versus the E4/E5 a11y close-outs
**And** the `/api/v1/health` endpoint's `version` field matches the latest deployed git-sha
**And** UX-DR36 (final axe-core sweep) and NFR11 (axe-core merge gate active in production-cutover CI) are satisfied

### Story 7.6: First PM study launch

As Paola (with Kanaud facilitating),
I want to run the first real Kano study against real Tixeo customers using the production kano instance,
So that the business-success metric begins to accumulate and the MVP's core assumption — "PMs will run Kano studies when the tooling tax is gone" — is validated or invalidated.

**Acceptance Criteria:**

**Given** production is live (Story 7.4) and quality gates passed (Story 7.5)
**When** Paola opens `https://<prod-domain>/app/`
**Then** she can create a project, add a real feature list (8+ features), generate a poll URL, copy it from the share panel, and send it externally via her own channel (email or chat) — all without Kanaud intervening or reading documentation
**And** she can answer her own poll URL on her phone as a preview (Critical Success Moment 2 from the UX spec) and the experience is indistinguishable from what a real customer will see
**And** she sends the URL to at least 8 real Tixeo customers (scope: exactly one real study)
**And** customer responses accumulate; the analysis page renders with populated data within expected timelines
**And** Paola executes at least one roadmap-review screen-share using the analysis page during a Tixeo internal meeting, with the output legible and not requiring reformatting per Experience Principle 4
**And** the study outcome is documented briefly in `docs/launch-retrospective.md`: what worked, what friction appeared, what needs a v2 ticket
**And** any regression discovered during the study is either patched inline (if ship-blocking) or filed as a follow-up issue (if v2-acceptable)
**And** the business success criterion is met when this epic closes: at least 1 real customer-facing poll completed end-to-end
