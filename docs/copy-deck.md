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
| `pm.epochBump.dialog.title` | Create Version {n}? | `{n}` is the next epoch number |
| `pm.epochBump.dialog.body` | Editing this feature locks the current version and starts a new one. Existing polls keep their current version. | Two-register confirmation prose |
| `pm.epochBump.dialog.confirm` | Create version | Confirm button label |
| `pm.epochBump.dialog.cancel` | Keep current version | Cancel button label |

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
| `placeholder.polls.title` | Polls | PollsPlaceholder.vue title (deleted by Epic 3-7) |
| `placeholder.polls.body` | PM polls list lands in Epic 3 (Story 3-7). | PollsPlaceholder.vue body |
| `placeholder.respondent.title` | Poll preview | RespondentPlaceholder.vue title (deleted by Epic 3-8 / 4-4) |
| `placeholder.respondent.body` | Respondent landing replaces this stub in Epic 3 (Story 3-8) and Epic 4 (Story 4-4). | RespondentPlaceholder.vue body |
