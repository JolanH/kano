# Copy deck — English (canonical reference)

This file mirrors `kano-frontend/src/copy/en.ts`. When you add a key to the
TypeScript file, add the corresponding row here in the same order. Reviewers
use this document to read the surface copy without grepping for keys.

## Glossary discipline

- User-facing copy says **"Version"**. The codebase, DB, and API say `epoch`.
  The two never cross — see UX spec §Component Strategy.

## Common chrome

| Key | English | Context |
|---|---|---|
| `common.unsupportedViewport.title` | Open Kano on a desktop to manage projects | Title shown when a PM route is opened on a viewport <1280px |
| `common.unsupportedViewport.body` | The project-manager workspace is designed for screens 1280 px and wider. Polls themselves work on mobile. | Body for the same screen |
| `common.snackbar.success` | Done. | Universal success toast |
| `common.snackbar.error` | Something went wrong. Please try again. | Universal failure toast |
| `common.version` | Version | The user-facing word for `epoch` everywhere |

## PM layout chrome

| Key | English | Context |
|---|---|---|
| `pm.layout.sidebar.projects` | Projects | Sidebar nav item — projects list |
| `pm.layout.sidebar.polls` | Polls | Sidebar nav item — polls list |
| `pm.layout.sidebar.resources` | Resources | Sidebar group label (per the Tixeo screenshot) |
| `pm.layout.appBar.title` | Kano | Top bar product title |

## PM Kano category labels

| Key | English | Context |
|---|---|---|
| `pm.category.must` | Must-have | Mandatory category in `<cat-badge>`, stacked bar legend |
| `pm.category.perf` | Performance | Linear category |
| `pm.category.del` | Delighter | Exciter category |
| `pm.category.ind` | Indifferent | Indifferent category |
| `pm.category.rev` | Reverse | Contradictory category, never "Contradictory" in user copy |
| `pm.category.que` | Questionable | Doubtful category, never "Doubtful" in user copy |

## PM epoch-bump dialog (Story 2-11)

| Key | English | Context |
|---|---|---|
| `pm.epochBump.dialog.title` | Create Version {n}? | `{n}` is the next epoch number |
| `pm.epochBump.dialog.body` | Editing this feature locks the current version and starts a new one. Existing polls keep their current version. | Two-register confirmation prose |
| `pm.epochBump.dialog.confirm` | Create version | Confirm button label |
| `pm.epochBump.dialog.cancel` | Keep current version | Cancel button label |

## Respondent Likert option labels (FR22)

These five replace the Kano-methodology jargon ("functional/dysfunctional satisfaction
on a 1-5 scale") with plain language. They drive `<KanoLikert>` (Story 4-5).

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
| `respondent.progress` | Question {current} of {total} | Progress label per question; used in Story 4-6 |
| `respondent.thankYou.title` | Thanks for your input! | Submit-success page (Story 4-7) |
| `respondent.thankYou.body` | Your responses have been recorded. | Subtitle on the same page |
| `respondent.expired.title` | This poll is closed | Expired-link page (Story 3-8 / 4-4) |
| `respondent.expired.body` | The link you used is no longer accepting responses. | Subtitle on the same page |
