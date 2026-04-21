---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
vision:
  statement: 'Internal tool for Tixeo PMs to run Kano surveys with customers — turning customer voice into structured, KPI-first prioritization signal for the roadmap.'
  audiences:
    tool_users: 'Tixeo PMs (internal) — create projects, generate polls, read analysis'
    poll_respondents: 'Tixeo customers (external) — receive plain URL, answer survey'
  wow_moment: 'PM sends link to customer → customer answers → PM sees feature-by-feature dominant category with % ready to drop into a roadmap conversation.'
  core_insight: 'Kano methodology is valuable but tooling friction kills adoption. Removing that friction enables systematic customer-informed roadmap decisions.'
  design_principles:
    - 'Respondent-side clarity is paramount — plain-language framing, no methodology jargon (rename functional/dysfunctional + category labels M/L/E/I/C/D to human-readable equivalents).'
    - 'PM-side analysis should be factual, KPI-first, and directly actionable for roadmap conversations.'
  deferred_for_v1:
    - 'Signal integrity guardrails (ballot stuffing prevention, response deduplication) — v1 ships with frictionless public URLs; guardrails added later if needed.'
inputDocuments:
  - /home/tixeo/Projects/perso/kano/initial-specification.md
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: greenfield
clarifications:
  - 'Auth model: fully public — anyone can create projects, polls are public, a single user may answer multiple times'
  - 'Poll link: plain URL (no UUID token for now), 7-day expiration, shared by user externally (mail, chat, etc.)'
  - 'Tie-breaking: in case of dominant-category tie, display BOTH dominant categories'
  - 'Data integrity: projects versioned by epoch; breaking feature changes bump epoch; deleted features are soft-deleted (absent from new epoch but retained for prior polls)'
  - 'Partial poll responses: discarded (not saved)'
  - 'Spec fix: response fields are FQ_ANSWER, DQ_ANSWER, CATEGORY (original spec typo QD_ANSWER corrected)'
  - 'Analysis access: public — anyone with the link can view the analysis'
---

# Product Requirements Document - kano

**Author:** Kanaud
**Date:** 2026-04-21

## Executive Summary

Tixeo Product Managers currently lack a low-friction way to collect structured, methodology-grounded customer signal on feature value. Ad-hoc surveys yield free-text opinions that resist aggregation; no tool in place supports Kano-style prioritization studies with customers. The kano app closes that gap: PMs define projects and features, generate a shareable poll URL, send it to customers, and read per-feature categorized results ready for roadmap conversations.

**Target users:** Tixeo PMs (internal tool users creating projects and reading analyses) and Tixeo customers (external poll respondents who receive a plain URL and answer the survey).

**Outcome:** Systematic, customer-informed feature prioritization replaces gut-feel or anecdote-driven roadmap debates.

### What Makes This Special

- **Factual, KPI-first output.** Each feature gets a dominant category with a % value — drop-in-ready for a roadmap discussion, not a pile of free-text to triage.
- **Auto-categorization via the Kano decision matrix.** Response pairs (functional + dysfunctional questions) map deterministically into Mandatory, Linear, Exciter, Indifferent, Contradictory, or Doubtful; ties surface both dominant categories rather than hiding ambiguity.
- **Epoch-versioned projects.** Any change to the project's feature list (addition, edit, or deletion) bumps the project epoch; prior polls stay pinned to the epoch they were created under. Roadmap tools that survive real iteration, not demo-only.
- **Respondent clarity is a first-class design principle.** Customer-facing copy uses plain language — not "functional/dysfunctional" methodology jargon, not raw category letter codes. Designed for non-trained respondents to answer honestly and quickly.
- **Zero-friction sharing.** Plain URLs with 7-day TTL, shared via the PM's existing channels (email, chat). No login, no signup, no tokens to manage.

## Project Classification

- **Project Type:** web_app (Vue 3 composition API frontend, Python Flask + Poetry backend, single-node PostgreSQL; docker-compose for local boot). *Note: storage choice updated from MongoDB (original specification) to PostgreSQL — rationale captured in the Scoping section below.*
- **Domain:** general (internal product management tooling)
- **Complexity:** medium — straightforward CRUD surface, but the Kano decision matrix, epoch-versioning semantics, category-tie handling, and poll URL TTL collectively require deliberate test coverage
- **Project Context:** greenfield

## Success Criteria

### User Success

**PM (tool user):**
- From empty state to a shareable poll URL in under 5 minutes, without consulting documentation
- Analysis page interpretable on first view — plain-language labels, no methodology glossary required
- Analysis output usable directly in a roadmap conversation, no re-formatting or re-calculation

**Customer (poll respondent):**
- Poll for ~8 features completable in under 3 minutes
- No confusion signals — respondents do not need to ask the PM to clarify questions
- Completion rate: measured and reviewed after the first real study; no hard pre-launch target

### Business Success

- **Adoption indicator:** at least 3 polls sent to customers in the first period post-launch. If reached, the tool is earning its place at Tixeo.

### Technical Success

- **Test coverage:** every story acceptance criterion has ≥1 integration test; coverage gate ≥85% line coverage, 100% branch coverage on epoch-versioning and categorization modules
- **Epoch integrity:** parametrized pytest fixtures across the epoch-bump matrix asserting epoch-N feature rows remain byte-identical after a bump; migration replay test on seeded fixtures
- **Required test suites:** poll URL expiry (7-day boundary), URL collision, database schema/index assertions, `docker compose up` CI smoke test
- Error logging is clear and explanatory
- Clean single-command local boot via `docker compose up`

*Note on spec coverage:* "100% of spec'd behaviors" is aspirational at this stage — the spec's prose will be decomposed into testable acceptance criteria when stories are written. Coverage is measured against ACs, not raw spec prose.

### Measurable Outcomes

- PM time-to-first-poll: < 5 min (tracked informally during PM onboarding)
- Respondent time-to-complete (8-feature poll): < 3 min (observed post-first-study)
- Poll count sent to customers in first period post-launch: ≥ 3
- Story AC coverage: 100% (every AC backed by ≥1 integration test)
- Critical-module coverage: ≥85% line / 100% branch on epoch + categorization code paths
- Critical bugs (epoch integrity, categorization matrix, data loss): 0

## Product Scope

### MVP — Minimum Viable Product

Full scope of the initial specification plus the 7 clarifications:
- Project CRUD (name, version) with list of features (name, description)
- Epoch-based project versioning: any feature list change (add/edit/delete) bumps the epoch; deletions are soft (absent from new epoch, retained for prior polls)
- Poll generation with plain URL and 7-day TTL; sharing is user-driven (external)
- Poll submission: 2 Kano-style questions per feature (functional + dysfunctional, 1–5 Likert), deterministic categorization into M/L/E/I/C/D stored with each response (fields: `FQ_ANSWER`, `DQ_ANSWER`, `CATEGORY`)
- Partial responses discarded (not persisted)
- Multiple polls per project supported; responses linked only to their specific poll instance
- Analysis view: per-feature horizontal stacked bar (category distribution) with dominant category + %; dominant-category ties display both; per-category panels listing features where that category is dominant
- Fully public access: anyone can create projects, any link-holder can answer or view analysis
- Respondent-facing copy uses plain language — no methodology jargon
- Backend integration test coverage per the Technical Success criteria
- Explanatory error logging
- Docker-compose bootable stack for local use

### Growth Features (Post-MVP)

- Signal integrity guardrails (e.g., one-response-per-browser, token-based URLs, duplicate-submission detection)
- Authentication / access control
- Custom question sets (beyond the standard Kano pair)
- Poll lifecycle management UI (close poll manually, extend TTL)
- Study-level response thresholds (e.g., warn PMs when analysis is based on too few responses)

### Vision (Future)

- Additional data visualization features for deeper analysis — specific visualizations to be defined after MVP usage reveals analytical gaps

## User Journeys

### Persona 1 — Paola, Product Manager at Tixeo

**Situation:** Three weeks into release planning. Eight candidate features in her backlog, engineering capacity for roughly half. The current prioritization process is tribal — loudest stakeholder wins.
**Goal:** Decide which features to prioritize, backed by actual customer signal instead of gut feel.
**Obstacle:** She knows Kano methodology, but Google Forms + manual spreadsheet categorization feels like a 2-day detour.

#### Journey 1A — Paola's success path

**Opening.** Monday morning. Paola opens kano, creates a project *"Q3 Feature Prioritization"* (v1.0), enters 8 features (name + one-line description each). Under 5 minutes.

**Rising action.** One click → shareable poll URL. She drafts an email to 12 handpicked customers: *"Help shape our next release — 3 minutes."* No Kano jargon needed; the tool's respondent-facing copy handles translation.

**Climax.** Wednesday, 7 responses in. Analysis page shows *SSO integration → Mandatory, 71%*. *Dark mode → Indifferent, 60%*. *Live translation → tie between Exciter and Linear, tool displays both*. Signal is hard, specific, quotable.

**Resolution.** Thursday roadmap review. Paola shares her screen. Engineering prioritizes SSO, deprioritizes dark mode, explores a live-translation spike. Decision anchored in evidence, not volume.

#### Journey 1B — Paola's edge case: mid-poll feature correction (epoch bump)

**Opening.** Two days into the poll, Paola realizes *"Granular notification rules"* was misnamed and customers are confused. She opens the project, edits the name.

**Rising action.** System warns: *"This change bumps the project to epoch v2. Existing poll responses remain pinned to v1."* She confirms. Starts a new poll on v2 with the corrected feature, shares with a fresh batch of customers.

**Climax.** Analysis shows both polls cleanly separated — v1 responses scored against v1's feature matrix, v2 against v2's. No cross-contamination.

**Resolution.** Paola avoids the cardinal Kano-study mistake — changing a question mid-flight and corrupting the dataset. The epoch model makes the trade-off explicit and safe.

### Persona 2 — Marcus, IT Director at a Tixeo customer company

**Situation:** Three-year Tixeo customer. Receives ~4 vendor surveys a month. Ignores most.
**Goal:** If he's going to fill it out, it needs to be fast, clear, and feel worth it.
**Obstacle:** Most vendor surveys are long, jargon-heavy, and have no visible end.

#### Journey 2A — Marcus's success path

**Opening.** Tuesday 3pm. Email from Paola: *"Help shape our next release — 3 minutes."* He clicks.

**Rising action.** Landing page: feature list with plain-language descriptions. For each feature, two simple questions framed without methodology terms: *"If this feature is available, how do you feel?"* / *"If this feature is not available, how do you feel?"* Five Likert options, human-worded (*love it / nice-to-have / neutral / can live without it / would dislike it*). Progress indicator visible.

**Climax.** Feature 6 of 8 — a potential live translation feature. He pauses — he actually needs this. He answers honestly. He feels heard.

**Resolution.** 2 min 40 s. Submit. Short thank-you. His input is on the record.

#### Journey 2B — Marcus's edge case: expired link

**Opening.** Friday, two weeks later. Marcus cleans his inbox and clicks Paola's link — past the 7-day TTL.

**Rising action.** Landing page: *"This poll is closed. Responses are no longer being collected."* Clean, no error wall.

**Climax.** Small follow-up link: *"Get in touch with our product team."*

**Resolution.** Even an expired link creates a graceful off-ramp. Tixeo doesn't lose the signal.

### Journey Requirements Summary

These journeys reveal requirements in the following capability areas:

- **Project authoring** (1A): fast, low-friction form UX for project + feature creation (target: < 5 min to shareable URL)
- **Poll generation & sharing** (1A): one-click URL generation with clear copy affordance; no tokens or signup to navigate
- **Respondent experience** (2A): plain-language question rendering, human-worded Likert scale, feature context visible, mobile-friendly, progress indicator, under-3-min completion for ~8 features
- **Analysis rendering** (1A resolution): per-feature horizontal stacked bar + dominant category + %, tie handling that shows both categories, per-category feature panels
- **Project versioning UX** (1B): epoch-bumping UX with confirmation dialog explaining the implication, clear "this poll is pinned to epoch N" display on analysis, ability to view multiple polls across epochs side-by-side or via tabs
- **Poll lifecycle edge states** (2B): expired-link page with respectful copy and off-ramp to direct contact
- **Other edge states**: no-responses-yet state on analysis, partial-response abandonment (silent discard per spec)

**Out of scope for MVP journeys:** no admin/operations user (no auth, no admin role); no API-consumer journey (REST API consumed only by the bundled Vue frontend; no external integrators in MVP); no support/troubleshooting journey (internal tool, no support org).

## Web Application Specific Requirements

### Project-Type Overview

Single-page application (SPA) with separate REST API backend. Two distinct client surfaces share the same frontend codebase but have different device and audience targets. No SEO, no real-time, no native/CLI integration.

### Technical Architecture Considerations

- **Application style:** Single-Page Application (Vue 3, composition API)
- **Rendering:** Client-side only; no SSR required
- **API boundary:** Separate REST API (Flask) consumed exclusively by the bundled frontend
- **State synchronization:** Request/response only; no real-time push (analysis updates on navigation/refresh, not on poll submission)

### Browser Matrix

- Modern evergreen browsers only, latest two stable versions:
  - Chrome / Chromium (latest 2)
  - Firefox (latest 2)
  - Edge (latest 2)
  - Safari (latest 2)
- **Not supported:** Internet Explorer, legacy Edge, browsers below these thresholds. No polyfills or transpilation for legacy targets.

### Responsive Design

Two client surfaces, two device targets:

- **PM-facing UI (project authoring, poll management, analysis):** desktop-only. No mobile or tablet layout obligations. Designed for ≥ 1280px viewport.
- **Respondent-facing UI (poll landing page, poll submission, expired-poll page):** fully mobile-responsive. Must render cleanly on small-screen phones (≥ 360px width) since customers typically open the link from email on mobile. Touch-friendly inputs for the 1–5 Likert scale.

This split is load-bearing: respondent completion rate depends on frictionless mobile answering; PM workflows happen at a desk.

### Performance Targets

- **Analysis page (PM-facing, desktop):** soft target — page loads and renders within **3 seconds** for projects with up to 20 features and 500 accumulated poll responses
- **Respondent poll page (respondent-facing, mobile):** snappy first paint; no hard numeric target in v1 but avoid large JS payloads, lazy-load non-critical components
- **Backend:** no hard latency SLA; internal tool with low concurrent load expected

### SEO Strategy

Not applicable. The application is an internal Tixeo tool; no pages are intended to be indexed by search engines. Poll URLs are shared directly via email/chat and are not meant for public discovery. No sitemap, no meta-tag strategy, no structured data.

### Accessibility Level

- **Target:** WCAG 2.1 Level AA across both PM-facing and respondent-facing UIs
- **Applies to:** keyboard navigation, focus states, color contrast, ARIA labels on the stacked-bar visualizations, screen-reader-friendly Likert inputs, and form validation messages
- **Not in scope:** Level AAA, non-WCAG accessibility frameworks

### Implementation Considerations

- Component framework: Vue 3 composition API (per spec)
- A11y: adopt an accessible Vue component library (or author components with explicit ARIA + keyboard support) to hit WCAG 2.1 AA without custom-building every primitive
- Visualization: the horizontal stacked bars need accessible equivalents — consider a hidden data table fallback or ARIA-labeled series for screen-reader users
- Responsive split: consider route-level separation (PM routes under `/app/*`, respondent routes under `/poll/*`) so the responsive breakpoint logic doesn't leak across surfaces
- Bundle strategy: respondent-facing bundle should be lean (mobile, likely over cellular) — PM bundle can be larger (desktop, office network)
- **Analysis endpoint query pattern:** the analysis endpoint MUST use a single SQL aggregation query (`GROUP BY feature_id, category`) returning all per-feature category distributions in one round-trip. Iterating over features in Python and issuing a query per feature is forbidden by design. The schema should make the single-query pattern natural; if the schema makes it awkward, the schema is wrong.

## Scope Strategy & Readiness Gates

### MVP Strategy & Philosophy

**MVP Approach: Problem-solving MVP.** The minimum that makes the Kano methodology usable by Tixeo PMs with real customers. The question being validated is *"will PMs run Kano studies when the tooling tax is gone?"* — not platform, not revenue, not experience showcase.

**Fastest path to validated learning:** ship the full specified feature set → one PM runs one real study with real customers → observe (a) customer completion rate, (b) PM analysis workflow fit, (c) whether the output changed a roadmap decision.

**Resource Profile:**
- **Team:** solo developer (Kanaud) on personal time; no dedicated team allocation
- **Timeline:** ASAP; no fixed deadline — quality bar takes priority over speed
- **Skills required:** Python/Flask, Vue 3 composition API, PostgreSQL schema design, Docker/docker-compose, WCAG 2.1 AA execution
- **External dependencies:** none; full stack runs on docker-compose locally
- **Deployment model:** docker-compose for local dev; production hosting is publicly reachable over the internet (not intranet/VPN-only). Specifics (hosting provider, TLS termination, DNS) deferred to the architecture phase.

**Storage decision (retroactive to original specification):** Switched from MongoDB to **single-node PostgreSQL**. Rationale: the domain model is relational (projects → features → polls → responses with foreign-key-enforced epoch isolation); the core analysis query is a GROUP BY aggregation; epoch-integrity properties are trivially verifiable in SQL. Zero user-facing impact.

### MVP Readiness Gates (before first PM study)

Automated gates that must pass before any PM touches the tool. PM study is *validation* of product-market fit; these gates validate *engineering readiness*.

- Test coverage ≥ 85% on `epoch_service`, `kano_matrix`, and `poll_expiry` modules
- Full end-to-end Playwright suite green: *create project → add features → generate poll URL → respond as customer → PM views analysis*
- Seeded fixture reproducing the spec's categorization matrix byte-for-byte (parity test)
- `docker compose up` CI smoke test green on a fresh checkout
- Alembic migration forward + rollback (`alembic downgrade -1`) smoke test green for every migration

### MVP Feature Set (Phase 1)

*Defined in the Product Scope section above.* MVP = full initial specification + the 7 clarifications, with PostgreSQL as the storage backend instead of MongoDB.

**Core user journeys supported in MVP:** Journey 1A (Paola success), 1B (Paola epoch-bump), 2A (Marcus success), 2B (Marcus expired-link).

### Post-MVP Features

*Defined in the Product Scope section above (Growth + Vision sections).* Note: background cleanup of expired polls moves to Phase 2 (see poll-URL-expiry risk in the Risk Mitigation Strategy section below).

## Risk Mitigation Strategy

### Technical Risks — Data & Storage

| Risk | Mitigation |
|------|-----------|
| **Data model lock-in** — once PMs create real projects, schema changes require migrations against real data; the project/feature/poll/response schema is the single most irreversible decision in the project | Spend disproportionate design time on the schema and the epoch-isolation FK topology *before* shipping; document the rationale for each FK; pair-review the migration before merge |
| **Epoch isolation implementation drift** — code bugs could mutate epoch-N feature rows instead of cloning into N+1 | Integration test: create poll on epoch N, trigger bump, verify epoch-N feature rows remain byte-identical; FK constraint pins polls to `(project_id, epoch)`; parametrized pytest fixtures across the epoch-bump matrix |
| **Epoch-bump predicate enforcement** — rule is "any feature list change bumps the epoch" but all feature mutation paths must enforce this uniformly | Single centralized `bump_epoch_on_feature_change()` service; every feature mutation routed through it; test every mutation endpoint against a "new epoch created" assertion |
| **Migration drift** — Alembic migrations that can't be rolled back cleanly | Alembic from commit #1; `alembic downgrade -1` smoke test in CI for every migration |
| **Backup / restore untested** — single-node Postgres: one corrupted volume = total data loss | Nightly `pg_dump` to a separate volume; restore-test once before first PM study to verify backups actually work |

### Technical Risks — Correctness

| Risk | Mitigation |
|------|-----------|
| **Kano categorization matrix correctness** (25 answer-pair combinations → 6 categories) | Table-driven unit tests, one per cell; freeze matrix as a typed fixture; seeded parity test against the spec |
| **Timezone inconsistency** — `expires_at` behavior is timezone-sensitive | UTC storage throughout; `TIMESTAMPTZ` schema assertion in a dedicated test |
| **Poll URL expiry semantics** (7-day TTL) | Explicit `expires_at` column; read-path filter `WHERE expires_at > NOW()`; boundary tests at the 7-day threshold. **No background cleanup job in v1** — expired polls remain in the database but are filtered out of reads. Storage growth is negligible at the expected cadence; scheduled cleanup moves to Phase 2 if it becomes needed |

### Technical Risks — Security & Observability

| Risk | Mitigation |
|------|-----------|
| **Web security hygiene** — Flask-SPA split has its own pitfalls | CSRF protection enabled; `SESSION_COOKIE_SAMESITE` set; explicit CORS origin allowlist; no wildcard origins |
| **Observability gap** — when something breaks, no way to diagnose | Structured request logs + PostgreSQL slow-query log enabled from day one; minimal but present |

### Technical Risks — Accessibility

| Risk | Mitigation |
|------|-----------|
| **Respondent-facing A11y** (stacked-bar viz is the hardest WCAG 2.1 AA target) | Hidden accessible data table as SVG fallback; `axe-core` CI check + snapshot test on the fallback DOM (no manual screen-reader dependency for solo-dev) |

### Market / Adoption Risks

Internal tool — "market" = Tixeo PM adoption.

| Risk | Mitigation |
|------|-----------|
| **PMs don't use it** | Onboard one PM for the first real study; remove all onboarding friction; collect qualitative feedback before scaling across the team |
| **Customers don't complete polls** | Measure completion rate post-first-study; if below acceptable, iterate on respondent UX before adding Phase 2 features |
| **PMs misinterpret analysis** (category letters, tie semantics) | Plain-language labels on the UI; in-app tooltips and help content on first use of the analysis page explaining Kano categories, dominant category, and tie semantics. No dependency on Kanaud being present for PM onboarding |

### Resource Risks

| Risk | Mitigation |
|------|-----------|
| **Solo-dev scope creep** | Strict MVP/Growth split; reject scope additions that aren't v1-blocking bugs |
| **Time pressure cuts testing** | Treat the Technical Success test requirements as non-negotiable — the largest invisible downstream risks (epoch drift, categorization error) are only caught by tests |
| **ASAP without fixed deadline drift** | Publish an MVP-only feature checklist; self-review completion weekly; resist detours into Phase 2 features |

## Functional Requirements

### Project Management

- **FR1:** A PM can create a project with a name and a version.
- **FR2:** A PM can view a list of all projects in the system.
- **FR3:** A PM can view a project's details including name, version, current epoch, and active feature list.
- **FR4:** A PM can edit a project's name and version; these edits do not trigger an epoch bump.
- **FR5:** A PM can add a feature (name + description) to a project.
- **FR6:** A PM can edit an existing feature's name and/or description.
- **FR7:** A PM can delete a feature from a project's active feature list.

### Project Versioning & Epoch Integrity

- **FR8:** The system automatically increments a project's epoch when any change is made to the project's list of features (addition, edit, or deletion).
- **FR9:** The system preserves the feature set of every prior epoch unchanged when a new epoch is created.
- **FR10:** The system retains soft-deleted features in their original epoch so prior polls can still reference them; soft-deleted features do not appear in subsequent epochs.
- **FR11:** Before applying a feature change that will trigger an epoch bump, the system displays a confirmation dialog stating that existing polls will remain pinned to the prior epoch, and requires explicit PM acknowledgement before proceeding.
- **FR12:** A PM can view the feature list of any past epoch of a project.

### Poll Generation & Lifecycle

- **FR13:** A PM can generate a poll for a project; the poll is pinned to the project's current epoch at the moment of creation.
- **FR14:** The system issues a unique, publicly reachable URL for each poll.
- **FR15:** A poll URL automatically expires 7 days after the poll is created.
- **FR16:** The system rejects poll submissions made against an expired URL.
- **FR17:** A PM can generate two or more polls for the same project, each pinned independently to an epoch.
- **FR18:** A PM can view the list of polls associated with a project, including the epoch each poll is pinned to.

### Poll Participation (Respondent)

- **FR19:** A respondent with a poll URL can access the poll landing page without authentication.
- **FR20:** A respondent can see the list of features for the poll, each with its name and description rendered in plain language (no methodology jargon).
- **FR21:** A respondent can answer, for each feature, two questions: a functional question ("how do you feel if this feature is available") and a dysfunctional question ("how do you feel if this feature is not available").
- **FR22:** A respondent answers each question using a 5-point Likert scale with plain-language labels.
- **FR23:** A respondent sees a progress indicator while answering the poll.
- **FR24:** A respondent can submit a completed poll; the system accepts a submission only if all questions for all features have been answered.
- **FR25:** The system discards any partially-completed submission — incomplete submissions are not persisted.
- **FR26:** A respondent receives a confirmation page after a successful submission.
- **FR27:** A respondent visiting an expired poll URL sees an expired-poll page indicating the poll is closed and a contact off-ramp link to the product team.

### Response Categorization

- **FR28:** For each answered feature in a submitted poll, the system computes a Kano category (Mandatory, Linear, Exciter, Indifferent, Contradictory, or Doubtful) from the functional and dysfunctional answers using the specified categorization matrix.
- **FR29:** The system persists each response with three fields per feature: `FQ_ANSWER` (1–5), `DQ_ANSWER` (1–5), and `CATEGORY` (M/L/E/I/C/D).
- **FR30:** Each stored response is linked to exactly one poll instance.

### Analysis & Visualization

- **FR31:** A PM can view the analysis page for any specific poll instance.
- **FR32:** The analysis page is publicly accessible to anyone who has the poll URL (no authentication).
- **FR33:** The analysis page displays, for each feature of the poll's pinned epoch, a horizontal stacked bar representing the distribution of Kano categories across the poll's responses for that feature.
- **FR34:** Alongside each feature's stacked bar, the analysis page displays the dominant category and its percentage.
- **FR35:** When two or more categories are tied for dominance on a feature, the analysis page displays all tied dominant categories together with their shared percentage.
- **FR36:** The analysis page displays a per-category panel listing the features for which that category is dominant, with each feature annotated by its dominant-category percentage.
- **FR37:** The analysis page displays a dedicated empty-state message when the poll has zero responses; empty stacked bars and zero-percent dominant categories are not rendered.

### Guidance & Onboarding

- **FR38:** The PM-facing analysis page displays category labels using full human-readable names (e.g., "Must-have", "Delighter") alongside any short letter codes.
- **FR39:** The PM-facing analysis page provides on-demand explanatory content (tooltips or help) describing each Kano category and the meaning of a dominant-category tie, available on first use without dependency on human pairing.

## Non-Functional Requirements

### Performance

- **NFR1:** The analysis page loads and renders within **3 seconds** (p95) for projects with up to 20 features and 500 accumulated poll responses, as measured by Playwright navigation timing in the CI end-to-end suite on a seeded 20-feature × 500-response dataset.
- **NFR2:** A typical respondent (8-feature poll) completes submission in under **3 minutes** (measured post-first-study; no hard pre-launch target).
- **NFR3:** The analysis endpoint executes its aggregation in a **single SQL round-trip** regardless of the number of features or responses — no per-feature iteration in the application layer.

### Security

- **NFR4:** The system enforces **CSRF protection** on all state-changing requests from the PM-facing SPA.
- **NFR5:** Session cookies are configured with `SameSite=Lax` (or stricter) and `Secure` attributes in production.
- **NFR6:** The backend applies a **CORS origin allowlist**; wildcard origins (`*`) are forbidden.
- **NFR7:** All user inputs (project names, feature names, feature descriptions, respondent answers) are validated server-side and rendered safely — no XSS, no SQL injection.
- **NFR8:** No personally identifiable information (PII) is collected from poll respondents; persisted responses contain only numeric Likert answers and the derived category.

### Accessibility

- **NFR9:** Both the PM-facing and respondent-facing UIs conform to **WCAG 2.1 Level AA**.
- **NFR10:** The per-feature stacked-bar visualization is paired with an accessible data-table fallback that is programmatically hidden from sighted users but available to screen readers.
- **NFR11:** `axe-core` automated accessibility checks run on every CI build; new violations block merge.

### Reliability & Data Durability

- **NFR12:** Daily automated `pg_dump` backups are written to a **separate volume** from the primary PostgreSQL data directory.
- **NFR13:** The restore process is validated (restore-test executed at least once) before the first PM study is launched.
- **NFR14:** All timestamp values are stored in UTC using PostgreSQL `TIMESTAMPTZ`; no local-time columns anywhere.

### Observability

- **NFR15:** The backend emits **structured request logs** including, at minimum: timestamp, request ID, method, path, status code, duration.
- **NFR16:** The PostgreSQL **slow-query log** is enabled in production with a threshold of 500 ms.

### Portability & Deployment

- **NFR17:** The full stack (Flask API, Vue SPA, PostgreSQL) boots from a **single `docker compose up`** command on a clean checkout for local development.
- **NFR18:** **Alembic** manages all database schema migrations from commit #1; no hand-edited schema is permitted.
