# Copy deck — English (canonical reference)

This file mirrors `kano-frontend/src/copy/en.ts`. When you add a key to the
TypeScript file, add the corresponding row here in the same order. Reviewers
use this document to read the surface copy without grepping for keys.

A unit test (`kano-frontend/tests/unit/copy-deck-sync.spec.ts`) asserts the
two files stay in sync — every key in `en.ts` is documented here, and every
key documented here exists in `en.ts`. Adding a key without updating both
fails CI.

## Glossary discipline

- User-facing copy says **"Version"**. The codebase, DB, and API say `epoch`.
  The two never cross — see UX spec §Component Strategy. A regression test
  (`useCopy.spec.ts::user-facing copy never says "Epoch"`) iterates **every**
  entry in `en.ts` and fails on any `epoch`-substring match.
- The six Kano category labels follow the **standard Kano evaluation table**:
  Attractive, Must-be, Performance, Indifferent, Reverse, Questionable —
  matching the backend `Category` enum values `A / M / O / I / R / Q`.

## Common chrome

| Key | English | Context |
|---|---|---|
| `common.unsupportedViewport.title` | Open Kano on a desktop to manage projects | Title shown when a PM route is opened on a viewport <1280px |
| `common.unsupportedViewport.body` | The project-manager workspace is designed for screens 1280 px and wider. Polls themselves work on mobile. | Body for the same screen |
| `common.notFound.title` | Page not found | NotFound.vue page title (catch-all route) |
| `common.notFound.body` | The link you followed doesn't exist (or no longer does). | NotFound.vue body |
| `common.notFound.cta` | Back to projects | NotFound.vue primary CTA |
| `common.snackbar.success` | Done. | Universal success toast |
| `common.snackbar.error` | Something went wrong. Please try again. | Universal failure toast |
| `common.version` | Epoch | The user-facing word for the integer `epoch` counter everywhere |

## PM layout chrome

| Key | English | Context |
|---|---|---|
| `pm.layout.sidebar.aria` | Primary navigation | `aria-label` on the sidebar `<nav>` element — NOT the visible product title |
| `pm.layout.sidebar.projects` | Projects | Sidebar nav item — projects list |
| `pm.layout.sidebar.polls` | Polls | Sidebar nav item — polls list |
| `pm.layout.sidebar.resources` | Resources | Sidebar group label (per the Tixeo screenshot) |
| `pm.layout.appBar.title` | Kano | Top bar product title |

## PM Kano category labels

Token suffix mirrors the backend `Category` enum (`MUSTBE` / `PERFORMANCE` /
`ATTRACTIVE` / `INDIFFERENT` / `REVERSE` / `QUESTIONABLE`) — see
`src/theme/tixeo.ts`.

| Key | English | Context |
|---|---|---|
| `pm.category.must` | Must-be | Maps to `MUSTBE` (code `M`) |
| `pm.category.perf` | Performance | Maps to `PERFORMANCE` (code `O`) |
| `pm.category.attr` | Attractive | Maps to `ATTRACTIVE` — friendlier industry term |
| `pm.category.ind` | Indifferent | Maps to `INDIFFERENT` |
| `pm.category.rev` | Reverse | Maps to `REVERSE` — users prefer the feature absent |
| `pm.category.que` | Questionable | Maps to `QUESTIONABLE` — contradictory / unreliable answer pair |
| `pm.category.help.must` | Users expect this feature. Its absence causes frustration. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |
| `pm.category.help.perf` | Satisfaction scales with quality. More is better. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |
| `pm.category.help.attr` | Aspirational. Users don't expect it, but love it when present. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |
| `pm.category.help.ind` | Users don't care whether this feature exists or not. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |
| `pm.category.help.rev` | Users actively prefer this feature absent. Presence reduces satisfaction. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |
| `pm.category.help.que` | Contradictory answers — usually a misread question. Treat the result with caution. | CatBadge tooltip — `with-help` first-use help text (Story 5-7) |

## PM epoch-bump dialog (Story 2-11)

| Key | English | Context |
|---|---|---|

## Respondent Likert option labels (classic Kano scale)

These five drive `<KanoLikert>` (Story 4-5). They use the classic Kano
evaluation scale, kept verbatim in sync with the PM analysis matrix axes
(`analysis.kanoMatrix.answer.*`) so a respondent's answer reads identically to
the matrix cell that categorizes it. NOTE: this is a deliberate override of the
original FR22 / UX-spec "no Kano jargon on the respondent surface" rule, made
at the user's request for matrix↔poll label consistency.

| Key | English | Likert position |
|---|---|---|
| `respondent.likert.1` | Like it | 1 |
| `respondent.likert.2` | Expect it | 2 |
| `respondent.likert.3` | Neutral | 3 |
| `respondent.likert.4` | Can tolerate it | 4 |
| `respondent.likert.5` | Dislike it | 5 |
| `respondent.likert.question.functional` | How do you feel if {featureName} is available? | Functional-question template (interpolated per feature) |
| `respondent.likert.question.dysfunctional` | How do you feel if {featureName} is not available? | Dysfunctional-question template (interpolated per feature) |
| `respondent.likert.error.unanswered` | Please select an answer before continuing. | Inline error rendered in the `showError` variant |

## Respondent flow chrome

| Key | English | Context |
|---|---|---|
| `respondent.progress` | Question {current} of {total} | Progress label per question (Story 4-6) |
| `respondent.thankYou.title` | Thanks for your input! | (Legacy preregistered key; superseded by `respondent.thanks.*` in Story 4-7 but kept for backward compatibility) |
| `respondent.thankYou.body` | Your responses have been recorded. | (Legacy preregistered key; superseded by `respondent.thanks.body` in Story 4-7) |
| `respondent.submitConfirm.title` | Review & submit | Submit-confirm page heading (Story 4-7) |
| `respondent.submitConfirm.body` | You've answered every question. Send your input when you're ready. | Submit-confirm body copy |
| `respondent.submitConfirm.submitCta` | Submit | Primary CTA on submit-confirm |
| `respondent.submitConfirm.backCta` | Back | Secondary action on submit-confirm |
| `respondent.submitConfirm.missingRedirect` | Some answers are missing — we've taken you back | Brief notice rendered before the 422 redirect-to-missing transition |
| `respondent.submitConfirm.error.generic` | Something went wrong. Please try again. | Inline error for 400/404/500/network on submit |
| `respondent.thanks.title` | Thanks — your input is on the record | Thanks page heading (epics line 1177 exact wording) |
| `respondent.thanks.body` | Your product manager will see this on a short horizon. | Thanks page body (UX-DR25 short-horizon closing line) |
| `respondent.expired.title` | This poll is closed | Expired-link page (Story 3-8 / 4-4) |
| `respondent.expired.body` | The link you used is no longer accepting responses. | Subtitle on the same page |
| `respondent.cta.next` | Next | Likert "next question" CTA (Story 4-5 / 4-6) |
| `respondent.cta.back` | Back | Previous-question CTA (Story 4-6) |
| `respondent.cta.submit` | Submit | Final-submission CTA (Story 4-7) |
| `respondent.error.generic` | We couldn't save your response. Please try again. | Submission failure (Story 4-3 error path) |
| `respondent.common.loading` | Loading… | Generic spinner aria-label across respondent screens |
| `respondent.flow.progressLabel` | Feature {current} of {total} | Honest-progress label — per-feature denominator (Story 4-6 per-feature amendment 2026-05-22) |
| `respondent.flow.progressBarAriaLabel` | Poll progress | `v-progress-linear` aria-label on the Question route |
| `respondent.submitConfirm.placeholder` | Almost done — Story 4-7 will land the submit confirmation here. | Story 4-7 replaces this placeholder |

## Dev-only theme audit page (Story 1.8)

Section labels for `src/pages/dev/ThemeAudit.vue`. The page is gated on
`import.meta.env.DEV` and not part of production bundles; the keys are still
registered so the page goes through the same copy-deck regime as user-facing
pages.

| Key | English | Context |
|---|---|---|
| `dev.themeAudit.title` | Theme audit | Page title |
| `dev.themeAudit.colors` | Colors | Section: theme color tokens |
| `dev.themeAudit.typography` | Typography | Section: type scale |
| `dev.themeAudit.spacing` | Spacing | Section: 4px-base spacing scale |
| `dev.themeAudit.buttons` | Buttons | Section: button variants |
| `dev.themeAudit.inputs` | Inputs | Section: text fields / textareas / selects |
| `dev.themeAudit.dataTable` | Data table | Section: v-data-table |
| `dev.themeAudit.feedback` | Dialogs, menus, tooltips, snackbars | Section: feedback components |
| `dev.themeAudit.progress` | Progress, skeleton, alerts | Section: progress / status components |
| `dev.themeAudit.listsAndTabs` | Lists & tabs | Section: list and tab components |
| `dev.themeAudit.overrides` | Override evidence | Section: explicit theme overrides |

## Scaffold placeholders

Story 1.6 mounted three placeholder pages so the layout-selection mechanism
can be exercised end-to-end before the real Epic 2 / 3 / 4 pages exist.
These keys are deleted as part of the PRs that ship those real pages.

| Key | English | Context |
|---|---|---|
| `placeholder.projects.title` | Projects | ProjectsPlaceholder.vue title (deleted by Epic 2-9) |
| `placeholder.projects.body` | Project list lands in Epic 2 (Story 2-9). | ProjectsPlaceholder.vue body |

## PM Projects list + detail (Story 2-9)

| Key | English | Context |
|---|---|---|
| `pm.projects.title` | Projects | Page heading on `/app/projects` |
| `pm.projects.newProject.cta` | New project | Top-right button on the projects list |
| `pm.projects.newProject.placeholder.name` | Project name | Inline new-project form: name field label |
| `pm.projects.newProject.placeholder.version` | Version label | Inline new-project form: version field label |
| `pm.projects.newProject.commit` | Create | Inline new-project form: submit button |
| `pm.projects.newProject.cancel` | Cancel | Inline new-project form: cancel button |
| `pm.projects.col.name` | Name | Projects table column header |
| `pm.projects.col.version` | Version | Projects table column header |
| `pm.projects.col.epoch` | Current epoch | Projects table column header (user-facing for `current_epoch`) |
| `pm.projects.col.featureCount` | Features | Projects table column header (reserved for later) |
| `pm.projects.col.createdAt` | Created | Projects table column header |
| `pm.projects.empty.title` | No projects yet | Empty-state title when zero projects exist |
| `pm.projects.empty.body` | Projects are where you collect Kano feature feedback. | Empty-state body |
| `pm.projects.empty.cta` | Create your first project | Empty-state primary CTA |
| `pm.projects.loading` | Loading projects… | Data-table loading indicator |
| `pm.projects.error.generic` | We couldn't load your projects. Please try again. | Toast on list-load failure |
| `pm.projectDetail.notFound.title` | Project not found | Detail page 404 title |
| `pm.projectDetail.notFound.body` | This project doesn't exist (or no longer does). | Detail page 404 body |
| `pm.projectDetail.notFound.cta` | Back to projects | Detail page 404 primary CTA |
| `pm.projectDetail.name.aria` | Project name (click to edit) | Aria-label on inline-editable project name |
| `pm.projectDetail.version.label` | Version | Visible prefix label before the inline version value in the header |
| `pm.projectDetail.version.aria` | Project version label (click to edit) | Aria-label on inline-editable version |
| `pm.projectDetail.features.title` | Features | Detail page features panel heading |
| `pm.projectDetail.features.empty` | No features yet — Story 2-10 ships the inline editor. | Placeholder body when feature list is empty |
| `pm.projectDetail.loading` | Loading project… | Detail page loading state |
| `pm.projectDetail.viewAnalysis.button` | View analysis | Detail page button that opens the latest poll's analysis |
| `pm.projectDetail.viewAnalysis.disabledTooltip` | No polls yet — generate one to see analysis. | Tooltip shown when the View analysis button is disabled |

## FeatureListEditor (Story 2-10)

| Key | English | Context |
|---|---|---|
| `pm.features.editor.grid.aria` | Feature list editor | `aria-label` on the WAI-ARIA grid root |
| `pm.features.editor.row.aria` | Feature row | `aria-label` on each grid row |
| `pm.features.editor.col.name` | Feature | Name cell `aria-label` + visible placeholder |
| `pm.features.editor.col.description` | Description (optional) | Description cell `aria-label` + visible placeholder |
| `pm.features.editor.newRow.placeholder.name` | Add a feature… | New-row name field placeholder |
| `pm.features.editor.newRow.placeholder.description` | Description (optional) | New-row description field placeholder |
| `pm.features.editor.delete.aria` | Delete feature | `aria-label` on the trash-icon button |
| `pm.features.editor.submit.aria` | Add feature | `aria-label` on the new-row submit (add) button |
| `pm.features.editor.error.create` | We couldn't create that feature. Please try again. | Error message on create failure |
| `pm.features.editor.error.update` | We couldn't save that change. Please try again. | Error message on update failure |
| `pm.features.editor.error.delete` | We couldn't delete that feature. Please try again. | Error message on delete failure |

## EpochBumpDialog + EpochBumpBanner (Story 2-11)

Internal name retains `Epoch` (matches backend); user-facing values say `Version`. Placeholder names avoid the substring "epoch" so the `useCopy` regression sweep stays strict.

| Key | English | Context |
|---|---|---|
| `pm.versionBump.dialog.title` | Create Epoch {n}? | Dialog title; `{n}` is the next epoch number |
| `pm.versionBump.dialog.body.preserved` | Existing responses on Epoch {current} will be preserved. | First body paragraph |
| `pm.versionBump.dialog.body.newPolls` | New polls will use Epoch {next}. | Second body paragraph |
| `pm.versionBump.dialog.confirm` | Create Epoch {n} | Primary CTA |
| `pm.versionBump.dialog.cancel` | Cancel | Secondary CTA |
| `pm.versionBump.dialog.error` | We couldn't bump the epoch. Please try again. | Error alert inside the dialog on confirm failure |
| `pm.versionBump.dialog.processing` | Creating new epoch… | Loading text while confirm is in-flight |
| `pm.versionBump.banner.inPlace` | Epoch {n} updated in place — no responses to preserve. | Soft banner after a Branch-A mutation |
| `pm.versionBump.banner.close` | Dismiss | `aria-label` on the banner close button |
| `pm.versionBump.nowEditing` | Now editing Epoch {n} | Snackbar message after a successful epoch bump |

## EpochSelector + past-epoch view (Story 2-12)

Component file is `EpochSelector.vue` (internal name keeps "Epoch" parity with the backend); user-facing copy below says "Epoch" — these strings all denote the integer epoch counter.

| Key | English | Context |
|---|---|---|
| `pm.versionSelector.trigger.aria` | Switch epoch | `aria-label` on the dropdown trigger |
| `pm.versionSelector.item.aria` | View Epoch {n} | `aria-label` for an epoch list-item |
| `pm.versionSelector.item.current` | Current | Suffix tag next to the active epoch in the dropdown |
| `pm.viewingPast.banner` | Viewing Epoch {n} (read-only). Return to Epoch {current} to edit. | Banner on `/app/projects/:id?epoch=N` when viewing a past epoch |
| `pm.viewingPast.returnCta` | Return to current | Button on the past-epoch banner |

## PollSharePanel (Story 3-5)

Card surface where the PM copies the poll URL and previews the QR code.

| Key | English | Context |
|---|---|---|
| `pm.polls.share.title` | Share this poll | Region heading (visible) |
| `pm.polls.share.urlLabel` | Poll URL | URL field label + `aria-label` |
| `pm.polls.share.copy` | Copy | Idle state of the copy button |
| `pm.polls.share.copied` | Copied | Post-click button label (~1.2 s) |
| `pm.polls.share.copyButton.ariaLabel` | Copy poll URL | `aria-label` on the copy button |
| `pm.polls.share.helperText` | Share via email or chat — link expires in 7 days | Helper caption under URL/QR |
| `pm.polls.share.copiedAnnouncement` | Copied to clipboard | `aria-live="polite"` snackbar text |
| `pm.polls.share.copyFailed` | Couldn't copy automatically — the URL is selected for you to copy manually | Fallback failure snackbar |
| `pm.polls.share.qr.fallback` | QR code is loading… | Placeholder before the QR data URL resolves |

## Generate-poll flow on project detail (Story 3-6)

| Key | English | Context |
|---|---|---|
| `pm.projects.detail.generatePoll.button` | Generate poll URL | Primary CTA on the project detail header + its `aria-label` |
| `pm.projects.detail.generatePoll.disabledTooltip` | Add at least one feature first | Tooltip when the button is disabled (zero active features) |
| `pm.projects.detail.generatePoll.noFeatures` | Add at least one feature before generating a poll | Inline warning shown on 422 `poll-requires-features` |
| `pm.projects.detail.generatePoll.backToProject` | Back to project | Back link on the share view |
| `pm.projects.detail.generatePoll.error` | We couldn't generate the poll. Please try again. | Generic-error alert on unexpected create-poll failures |
| `pm.projects.detail.pollLink.goButton` | Go to poll URL | Primary CTA + `aria-label`; get-or-creates the poll then opens its public URL in a new tab |
| `pm.projects.detail.pollLink.copyButton` | Copy poll URL to clipboard | Secondary CTA + `aria-label`; get-or-creates the poll then copies its public URL |
| `pm.projects.detail.pollLink.copied` | Poll URL copied to clipboard | Snackbar on successful copy |
| `pm.projects.detail.pollLink.copyFailed` | We couldn't copy the URL automatically. Please try again. | Snackbar when the clipboard write fails |

## PM polls list (Story 3-7) — the home screen

| Key | English | Context |
|---|---|---|
| `pm.polls.title` | Polls | Page heading + section `aria-label` |
| `pm.polls.loading` | Loading polls… | `v-data-table` loading text |
| `pm.polls.columns.project` | Project | Table column header |
| `pm.polls.columns.projectVersion` | Version | Table column header (free-form project version string) |
| `pm.polls.columns.version` | Epoch | Table column header (epoch chip) |
| `pm.polls.columns.responses` | Responses | Table column header |
| `pm.polls.columns.expiresIn` | Expires in | Table column header |
| `pm.polls.columns.created` | Created | Table column header |
| `pm.polls.columns.actions` | Actions | Table column header for per-row action buttons |
| `pm.polls.viewAnalysis.button` | View analysis | Row button that opens the poll's analysis page (only when response_count ≥ 1) |
| `pm.polls.actions.open` | Open poll URL in new tab | Row icon button + `aria-label`/tooltip; opens the poll's respondent URL in a new tab |
| `pm.polls.actions.copy` | Copy poll URL to clipboard | Row icon button + `aria-label`/tooltip; copies the poll's respondent URL |
| `pm.polls.actions.copied` | Poll URL copied to clipboard | Snackbar on successful copy from the polls list |
| `pm.polls.actions.copyFailed` | We couldn't copy the URL automatically. Please try again. | Snackbar when the clipboard write fails in the polls list |
| `pm.polls.expired` | Expired | Token shown in the Expires-in column for closed polls |
| `pm.polls.countdown.expiringNow` | expiring now | Countdown cell text when remaining < 1 minute |
| `pm.polls.countdown.minutes` | {n} min | Countdown when remaining < 1 hour |
| `pm.polls.countdown.hour` | {n} hour | Countdown singular variant for hours |
| `pm.polls.countdown.hours` | {n} hours | Countdown plural variant for hours |
| `pm.polls.countdown.day` | {n} day | Countdown singular variant for days |
| `pm.polls.countdown.days` | {n} days | Countdown plural variant for days |
| `pm.polls.empty.title` | No polls yet | Empty-state card title |
| `pm.polls.empty.body` | Create a project, add features, and generate your first poll URL. | Empty-state card body |
| `pm.polls.empty.cta` | Create your first project | Empty-state CTA → `/app/projects` |
| `pm.polls.analysisPlaceholder` | Analysis view ships in Epic 5 — for now, the expired poll's responses are preserved in the database. | Analysis placeholder card body (Epic 5 replaces) |

## Respondent landing (Story 4-4)

Story 3-8's `LivePollStub.vue` was deleted in Story 4-4 and replaced by `LiveLanding.vue` — a brand-anchored single-CTA landing. The `landing.stub.*` keys are gone with the component; `expired.*`, `notFound.*`, and `loadError.*` are reused unchanged.

| Key | English | Context |
|---|---|---|
| `respondent.landing.loading` | Loading… | `v-progress-circular` `aria-label` |
| `respondent.landing.brand` | Tixeo | LiveLanding brand-mark text |
| `respondent.landing.trustLine` | Tixeo · 2–3 minutes · shapes our roadmap | LiveLanding single trust line (middle-dot U+00B7 separators, en-dash U+2013) |
| `respondent.landing.methodology.intro` | For each feature, you'll answer two quick questions: | LiveLanding methodology explainer intro (above the two-question bullets) |
| `respondent.landing.methodology.functional` | How you'd feel if it's available | LiveLanding methodology bullet 1 — mirrors `respondent.likert.question.functional` wording |
| `respondent.landing.methodology.dysfunctional` | How you'd feel if it's not | LiveLanding methodology bullet 2 — mirrors `respondent.likert.question.dysfunctional` wording |
| `respondent.landing.beginCta` | Begin | LiveLanding primary CTA text |
| `respondent.landing.beginAriaLabel` | Begin the poll | LiveLanding Begin button aria-label |
| `respondent.expired.contactCta` | Get in touch with our product team | Mailto button label on expired + not-found |
| `respondent.notFound.title` | We couldn't find that poll | PollNotFound headline |
| `respondent.notFound.body` | The link may have been typed incorrectly. If you think this is an error, please reach out. | PollNotFound body |
| `respondent.loadError.title` | We couldn't load this poll right now | PollLoadError headline (transient 5xx / network) |
| `respondent.loadError.body` | Something on our end went wrong. Please try again in a moment. | PollLoadError body |
| `respondent.loadError.retry` | Try again | PollLoadError retry button |
| `respondent.question.placeholder` | The first question will appear here shortly. | Question.vue placeholder (Story 4-6 replaces) |
| `pm.polls.empty.noProjectsBody` | Create a project, add features, and generate your first poll URL. | PM polls empty state — zero projects |
| `pm.polls.empty.noProjectsCta` | Create your first project | PM polls empty state CTA — zero projects |
| `pm.polls.empty.hasProjectsBody` | Open a project to add features and generate a poll URL when you’re ready. | PM polls empty state — projects exist, no polls |
| `pm.polls.empty.hasProjectsCta` | Open your projects | PM polls empty state CTA — projects exist, no polls |
| `pm.polls.projectMissing` | (project pending) | PM polls row fallback while project name is being reconciled (replaces raw UUID) |

## Analysis — KanoStackedBar + KanoStackedBarTable (Story 5-4)

`{name}` resolves to a category label (`pm.category.*`); `{count}` is the
per-segment response count; `{pct}` is the count/total percentage rounded
to 1 decimal place (matches `dominant_percentage` from Story 5-1's
`build_analysis` service). The table column headers are the accessible
fallback's `<thead>` row, mirrored to screen readers regardless of the
sighted-user `visible` toggle.

| Key | English | Context |
|---|---|---|
| `analysis.stackedBar.tooltip` | {name}: {count} responses ({pct}%) | KanoStackedBar per-segment tooltip (hover + keyboard focus) |
| `analysis.stackedBarTable.col.category` | Category | KanoStackedBarTable `<thead>` column 1 |
| `analysis.stackedBarTable.col.count` | Count | KanoStackedBarTable `<thead>` column 2 |
| `analysis.stackedBarTable.col.percentage` | Percentage | KanoStackedBarTable `<thead>` column 3 |
| `dev.themeAudit.analysisPrimitives` | Analysis primitives | ThemeAudit section heading (dev-only) covering the Story 5-4 stacked bar + table |

## Analysis page composition — table / header / empty / error (Story 5-5)

The Story 5-5 page-level composition over the Epic 5 primitives. The
confidence-beat copy intentionally drops the "of N" denominator (Story
Recommendation A — no `expected_respondents` field exists on the data
model); the empty-state copy is unparameterized for the same reason.

| Key | English | Context |
|---|---|---|
| `analysis.page.aria` | Analysis | `aria-label` on the analysis page `<section>` landmark — describes the *role* of the region, not the version of any artifact |
| `analysis.table.col.feature` | Feature | AnalysisTable `<thead>` — feature name + description column |
| `analysis.table.col.dominant` | Dominant | AnalysisTable `<thead>` — dominant category + percentage column |
| `analysis.table.col.distribution` | Distribution | AnalysisTable `<thead>` — KanoStackedBar + companion table column |
| `analysis.table.col.n` | n | AnalysisTable `<thead>` — per-row response count column |
| `analysis.dominant.tiedPercent` | {pct} each | Dominant cell — interpolated suffix on tied-category rows (e.g. "50% each") |
| `analysis.emptyState` | No responses yet — analysis will populate as responses arrive. | FR37 full-table replacement when `total_submissions === 0` |
| `analysis.confidenceBeat.singular` | {total} response | Header confidence beat — exactly 1 response |
| `analysis.confidenceBeat.plural` | {total} responses | Header confidence beat — 0 or 2+ responses |
| `analysis.error.notFound.title` | Poll not found | AnalysisErrorSurface 404 card title |
| `analysis.error.notFound.body` | The poll URL is invalid or was removed. | AnalysisErrorSurface 404 card body |
| `analysis.error.notFound.cta` | Back to projects | AnalysisErrorSurface 404 back-link |
| `analysis.error.load.title` | Couldn't load analysis | AnalysisErrorSurface 5xx/network alert title |
| `analysis.error.load.body` | Please check your connection and try again. | AnalysisErrorSurface 5xx/network alert body |
| `analysis.error.load.retry` | Retry | AnalysisErrorSurface 5xx/network alert retry button |
| `analysis.export.button` | Export PDF | Analysis header "Export PDF" button — resting label |
| `analysis.export.generating` | Generating PDF… | Same button — in-flight label while html2canvas/jsPDF run |
| `analysis.export.ariaLabel` | Export this analysis as a PDF | `aria-label` for the Export PDF button |
| `analysis.export.error` | Couldn't generate the PDF. Please try again. | Error snackbar when PDF capture/assembly fails |

## Analysis page — PerCategoryPanels secondary cross-index (Story 5-6)

The cross-index renders below the table when `total_submissions > 0`, with
one `<section>` per Kano category that has at least one feature for which
it is dominant (FR36). Per-category section headers reuse `pm.category.*`
labels via `<CatBadge>` — no per-category title key here. `{feature}` is
a feature name; `{pct}` is the integer-or-1-decimal percentage string
(e.g. `70%` or `33.3%`) built by the component to mirror Story 5-1's
`dominant_percentage` rounding.

| Key | English | Context |
|---|---|---|
| `analysis.panels.heading` | By category | PerCategoryPanels block `<h2>` — labels the cross-index region |
| `analysis.panels.entryAriaLabel` | Jump to {feature} ({pct} dominant) | Per-anchor `aria-label` (single-dominant) — adds navigational intent over the visible feature-name + percentage |
| `analysis.panels.entryAriaLabelTied` | Jump to {feature} ({pct} in each tied category) | Per-anchor `aria-label` for features with multiple tied dominant categories — disambiguates "{pct} dominant" so a SR user does not parse it as "{pct} is dominant" (FR35) |

## Analysis page — category-repartition pie (By category panel)

| Key | Copy | Notes |
|-----|------|-------|
| `analysis.pie.ariaLabel` | Dominant-category distribution across features | `role="img"` label for the KanoCategoryPie SVG; the visible legend carries the per-category numbers as real text |
| `analysis.pie.sliceLabel` | {name}: {pct}% | Shared by each slice's hover tooltip AND the legend line; mirrors `analysis.stackedBar.tooltip`'s "{name}: {pct}%" shape (tied features split fractionally so slices total 100%) |

## Analysis page — tie-meaning help icon (Story 5-7)

The (i) icon next to the confidence beat opens a tooltip describing what a
dominant-category tie means (FR35 / FR39 first-use help). The icon also
carries its own aria-label so SRs announce the activator's role ("About
dominant-category ties") before reading the tooltip's described-by content.

| Key | English | Context |
|---|---|---|
| `analysis.help.tieMeaning` | When two categories share the top position, customer opinion is genuinely split — both categories are equally dominant. | Analysis header tie-meaning tooltip text (opens from the (i) icon next to the confidence beat) |
| `analysis.help.tieIconAriaLabel` | About dominant-category ties | Aria-label on the (i) icon activator next to the confidence beat |

## Analysis page — Kano category reference panel (By category section)

Standing glossary `<aside>` to the right of the "By category" content. Lists
all six Kano categories (always, regardless of the poll's data) with a fuller,
Kano-textbook-grounded description. Separate namespace from the terse
`pm.category.help.*` CatBadge first-use tooltips — different surface, different
length budget. `rev` / `que` descriptions follow the standard Kano table
(R = the user prefers the feature absent; Q = a contradictory answer pair).

| Key | English | Context |
|---|---|---|
| `analysis.categoryRef.heading` | What the categories mean | Reference `<aside>` heading |
| `analysis.categoryRef.desc.must` | A basic expectation. Its absence causes strong dissatisfaction, yet its presence is taken for granted — the price of entry. | Reference description — Must-be (`MUSTBE`) |
| `analysis.categoryRef.desc.perf` | The more, the better. Satisfaction rises and falls in direct proportion to how well this is delivered. | Reference description — Performance (`PERFORMANCE`) |
| `analysis.categoryRef.desc.attr` | An unexpected extra. Users don't ask for it, but its presence sparks delight and sets the product apart. | Reference description — Attractive (`ATTRACTIVE`) |
| `analysis.categoryRef.desc.ind` | Users are unmoved either way — its presence or absence makes little difference to how satisfied they feel. | Reference description — Indifferent |
| `analysis.categoryRef.desc.rev` | Users actively prefer this feature absent — building it would work against satisfaction, not for it. | Reference description — Reverse |
| `analysis.categoryRef.desc.que` | A contradictory answer pair, usually a misread question. The signal is unreliable; treat it with caution. | Reference description — Questionable |

## Analysis page — Kano evaluation matrix (By category section)

Static 5×5 Kano evaluation table (`KanoMatrixReference`) rendered as a card
directly under the "categories meaning" reference. Rows are the functional
answer (feature present), columns the dysfunctional answer (feature absent);
both axes share the five classic Kano answer labels (`answer.*`). The 25 cells
reuse the `pm.category.*` names — the matrix is a display mirror of
`kano_matrix.py`, never a categorization path.

| Key | English | Context |
|---|---|---|
| `analysis.kanoMatrix.heading` | How answers map to categories | Matrix card heading |
| `analysis.kanoMatrix.functionalAxis` | Functional (feature is present) | Vertical axis label for the matrix rows |
| `analysis.kanoMatrix.dysfunctionalAxis` | Dysfunctional (feature is absent) | Horizontal axis label for the matrix columns |
| `analysis.kanoMatrix.answer.like` | Like it | Answer label, Likert 1 (both axes) |
| `analysis.kanoMatrix.answer.expect` | Expect it | Answer label, Likert 2 (both axes) |
| `analysis.kanoMatrix.answer.neutral` | Neutral | Answer label, Likert 3 (both axes) |
| `analysis.kanoMatrix.answer.tolerate` | Can tolerate it | Answer label, Likert 4 (both axes) |
| `analysis.kanoMatrix.answer.dislike` | Dislike it | Answer label, Likert 5 (both axes) |
| `analysis.kanoMatrix.tableCaption` | Each cell shows the Kano category for a pair of answers: the row is how the respondent feels when the feature is present (functional), the column is how they feel when it is absent (dysfunctional). | `sr-only` `<caption>` disambiguating the two axes for screen readers |
