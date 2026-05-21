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
- The bottom two Kano category labels are **"Contradictory"** / **"Doubtful"**
  — matching the backend `Category` enum. Earlier drafts used
  *"Reverse"* / *"Questionable"* (extended-Kano vocabulary) — those terms
  mean different things in Kano theory and were corrected in the story 1-6
  fix-up.

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
| `common.version` | Version | The user-facing word for `epoch` everywhere |

## PM layout chrome

| Key | English | Context |
|---|---|---|
| `pm.layout.sidebar.aria` | Primary navigation | `aria-label` on the sidebar `<nav>` element — NOT the visible product title |
| `pm.layout.sidebar.projects` | Projects | Sidebar nav item — projects list |
| `pm.layout.sidebar.polls` | Polls | Sidebar nav item — polls list |
| `pm.layout.sidebar.resources` | Resources | Sidebar group label (per the Tixeo screenshot) |
| `pm.layout.appBar.title` | Kano | Top bar product title |

## PM Kano category labels

Token suffix mirrors the backend `Category` enum (`MANDATORY` / `LINEAR` /
`EXCITER` / `INDIFFERENT` / `CONTRADICTORY` / `DOUBTFUL`) — see
`src/theme/tixeo.ts` and `docs/accessibility/kano-palette-validation.md`.

| Key | English | Context |
|---|---|---|
| `pm.category.must` | Must-have | Maps to `MANDATORY` — friendlier industry term |
| `pm.category.perf` | Performance | Maps to `LINEAR` — friendlier industry term |
| `pm.category.del` | Delighter | Maps to `EXCITER` — friendlier industry term |
| `pm.category.ind` | Indifferent | Maps to `INDIFFERENT` |
| `pm.category.cont` | Contradictory | Maps to `CONTRADICTORY` — answers contradict each other |
| `pm.category.doub` | Doubtful | Maps to `DOUBTFUL` — extreme / unusual answer pair |

## PM epoch-bump dialog (Story 2-11)

| Key | English | Context |
|---|---|---|

## Respondent Likert option labels (FR22)

These five replace the Kano-methodology jargon ("functional/dysfunctional
satisfaction on a 1-5 scale") with plain language. They drive `<KanoLikert>`
(Story 4-5).

| Key | English | Likert position |
|---|---|---|
| `respondent.likert.1` | I'd love it | 1 |
| `respondent.likert.2` | Nice to have | 2 |
| `respondent.likert.3` | Neutral | 3 |
| `respondent.likert.4` | I can live without it | 4 |
| `respondent.likert.5` | I would dislike it | 5 |

## Respondent flow chrome

| Key | English | Context |
|---|---|---|
| `respondent.progress` | Question {current} of {total} | Progress label per question (Story 4-6) |
| `respondent.thankYou.title` | Thanks for your input! | Submit-success page (Story 4-7) |
| `respondent.thankYou.body` | Your responses have been recorded. | Subtitle on the same page |
| `respondent.expired.title` | This poll is closed | Expired-link page (Story 3-8 / 4-4) |
| `respondent.expired.body` | The link you used is no longer accepting responses. | Subtitle on the same page |
| `respondent.cta.next` | Next | Likert "next question" CTA (Story 4-5 / 4-6) |
| `respondent.cta.back` | Back | Previous-question CTA (Story 4-6) |
| `respondent.cta.submit` | Submit | Final-submission CTA (Story 4-7) |
| `respondent.error.generic` | We couldn't save your response. Please try again. | Submission failure (Story 4-3 error path) |

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
| `pm.projects.col.epoch` | Current version | Projects table column header (user-facing for `current_epoch`) |
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
| `pm.projectDetail.version.aria` | Project version label (click to edit) | Aria-label on inline-editable version |
| `pm.projectDetail.features.title` | Features | Detail page features panel heading |
| `pm.projectDetail.features.empty` | No features yet — Story 2-10 ships the inline editor. | Placeholder body when feature list is empty |
| `pm.projectDetail.loading` | Loading project… | Detail page loading state |

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
| `pm.features.editor.error.create` | We couldn't create that feature. Please try again. | Error message on create failure |
| `pm.features.editor.error.update` | We couldn't save that change. Please try again. | Error message on update failure |
| `pm.features.editor.error.delete` | We couldn't delete that feature. Please try again. | Error message on delete failure |

## EpochBumpDialog + EpochBumpBanner (Story 2-11)

Internal name retains `Epoch` (matches backend); user-facing values say `Version`. Placeholder names avoid the substring "epoch" so the `useCopy` regression sweep stays strict.

| Key | English | Context |
|---|---|---|
| `pm.versionBump.dialog.title` | Create Version {n}? | Dialog title; `{n}` is the next version number |
| `pm.versionBump.dialog.body.preserved` | Existing responses on Version {current} will be preserved. | First body paragraph |
| `pm.versionBump.dialog.body.newPolls` | New polls will use Version {next}. | Second body paragraph |
| `pm.versionBump.dialog.confirm` | Create Version {n} | Primary CTA |
| `pm.versionBump.dialog.cancel` | Cancel | Secondary CTA |
| `pm.versionBump.dialog.error` | We couldn't bump the version. Please try again. | Error alert inside the dialog on confirm failure |
| `pm.versionBump.dialog.processing` | Creating new version… | Loading text while confirm is in-flight |
| `pm.versionBump.banner.inPlace` | Version {n} updated in place — no responses to preserve. | Soft banner after a Branch-A mutation |
| `pm.versionBump.banner.close` | Dismiss | `aria-label` on the banner close button |
| `pm.versionBump.nowEditing` | Now editing Version {n} | Snackbar message after a successful version bump |

## EpochSelector + past-epoch view (Story 2-12)

Component file is `EpochSelector.vue` (internal name keeps "Epoch" parity with the backend); user-facing copy below stays Version-only.

| Key | English | Context |
|---|---|---|
| `pm.versionSelector.trigger.aria` | Switch version | `aria-label` on the dropdown trigger |
| `pm.versionSelector.item.aria` | View Version {n} | `aria-label` for a version list-item |
| `pm.versionSelector.item.current` | Current | Suffix tag next to the active version in the dropdown |
| `pm.viewingPast.banner` | Viewing Version {n} (read-only). Return to Version {current} to edit. | Banner on `/app/projects/:id?epoch=N` when viewing a past version |
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

## PM polls list (Story 3-7) — the home screen

| Key | English | Context |
|---|---|---|
| `pm.polls.title` | Polls | Page heading + section `aria-label` |
| `pm.polls.loading` | Loading polls… | `v-data-table` loading text |
| `pm.polls.columns.project` | Project | Table column header |
| `pm.polls.columns.version` | Version | Table column header (version chip) |
| `pm.polls.columns.responses` | Responses | Table column header |
| `pm.polls.columns.expiresIn` | Expires in | Table column header |
| `pm.polls.columns.created` | Created | Table column header |
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

## Respondent landing (Story 3-8)

Live-poll component (`LivePollStub.vue`) is a stub that Story 4-4 will replace; expired + not-found surfaces ship to production quality and are reused verbatim.

| Key | English | Context |
|---|---|---|
| `respondent.landing.loading` | Loading… | `v-progress-circular` `aria-label` |
| `respondent.landing.stub.title` | This poll is ready | LivePollStub headline |
| `respondent.landing.stub.body` | A short survey is being prepared. Please check back shortly. | LivePollStub body |
| `respondent.expired.contactCta` | Get in touch with our product team | Mailto button label on expired + not-found |
| `respondent.notFound.title` | We couldn't find that poll | PollNotFound headline |
| `respondent.notFound.body` | The link may have been typed incorrectly. If you think this is an error, please reach out. | PollNotFound body |
| `respondent.loadError.title` | We couldn't load this poll right now | PollLoadError headline (transient 5xx / network) |
| `respondent.loadError.body` | Something on our end went wrong. Please try again in a moment. | PollLoadError body |
| `respondent.loadError.retry` | Try again | PollLoadError retry button |
| `respondent.landing.stub.expiresAt` | This survey is open until {date}. | LivePollStub closes-on line (consumes `PollPublic.expires_at`) |
| `pm.polls.empty.noProjectsBody` | Create a project, add features, and generate your first poll URL. | PM polls empty state — zero projects |
| `pm.polls.empty.noProjectsCta` | Create your first project | PM polls empty state CTA — zero projects |
| `pm.polls.empty.hasProjectsBody` | Open a project to add features and generate a poll URL when you’re ready. | PM polls empty state — projects exist, no polls |
| `pm.polls.empty.hasProjectsCta` | Open your projects | PM polls empty state CTA — projects exist, no polls |
| `pm.polls.projectMissing` | (project pending) | PM polls row fallback while project name is being reconciled (replaces raw UUID) |
