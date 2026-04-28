/**
 * English copy deck. Single source of truth for every user-facing string in
 * the SPA. Add a key here, reference it via `useCopy('your.key')`, and update
 * `docs/copy-deck.md`.
 *
 * Keys are flat dot-paths so a downstream i18n migration (post-MVP) maps each
 * `key: value` pair to the same key in `fr.ts` / `de.ts` / etc. without
 * restructuring. Values may contain `{name}` placeholders that `useCopy`
 * interpolates from a params object.
 *
 * Glossary rule (UX spec §Component Strategy): user-facing copy says "Version"
 * when referring to what the codebase / DB call `epoch`. Never put "Epoch"
 * into a value here.
 */

export const en = {
  // Common chrome
  'common.unsupportedViewport.title': 'Open Kano on a desktop to manage projects',
  'common.unsupportedViewport.body':
    'The project-manager workspace is designed for screens 1280 px and wider. Polls themselves work on mobile.',
  'common.snackbar.success': 'Done.',
  'common.snackbar.error': 'Something went wrong. Please try again.',
  'common.version': 'Version',

  // PM layout chrome
  'pm.layout.sidebar.projects': 'Projects',
  'pm.layout.sidebar.polls': 'Polls',
  'pm.layout.sidebar.resources': 'Resources',
  'pm.layout.appBar.title': 'Kano',

  // PM category labels (mirror the six theme tokens in src/theme/tixeo.ts)
  'pm.category.must': 'Must-have',
  'pm.category.perf': 'Performance',
  'pm.category.del': 'Delighter',
  'pm.category.ind': 'Indifferent',
  'pm.category.rev': 'Reverse',
  'pm.category.que': 'Questionable',

  // Epoch-bump dialog (Story 2-11). The user-facing copy says "Version".
  'pm.epochBump.dialog.title': 'Create Version {n}?',
  'pm.epochBump.dialog.body':
    'Editing this feature locks the current version and starts a new one. Existing polls keep their current version.',
  'pm.epochBump.dialog.confirm': 'Create version',
  'pm.epochBump.dialog.cancel': 'Keep current version',

  // Respondent Likert option labels (FR22 — plain-language replacements for
  // the Kano-methodology jargon).
  'respondent.likert.1': "I'd love it",
  'respondent.likert.2': 'Nice to have',
  'respondent.likert.3': 'Neutral',
  'respondent.likert.4': 'I can live without it',
  'respondent.likert.5': 'I would dislike it',

  // Respondent flow chrome (Epic 4)
  'respondent.progress': 'Question {current} of {total}',
  'respondent.thankYou.title': 'Thanks for your input!',
  'respondent.thankYou.body': 'Your responses have been recorded.',
  'respondent.expired.title': 'This poll is closed',
  'respondent.expired.body': 'The link you used is no longer accepting responses.',

  // Story 1.8 dev-only theme audit page section labels.
  'dev.themeAudit.title': 'Theme audit',
  'dev.themeAudit.colors': 'Colors',
  'dev.themeAudit.typography': 'Typography',
  'dev.themeAudit.spacing': 'Spacing',
  'dev.themeAudit.buttons': 'Buttons',
  'dev.themeAudit.inputs': 'Inputs',
  'dev.themeAudit.dataTable': 'Data table',
  'dev.themeAudit.feedback': 'Dialogs, menus, tooltips, snackbars',
  'dev.themeAudit.progress': 'Progress, skeleton, alerts',
  'dev.themeAudit.listsAndTabs': 'Lists & tabs',
  'dev.themeAudit.overrides': 'Override evidence',

  // Story 1.6 / 1.8 scaffold placeholders. Removed when the real pages land
  // (Epic 2-9, Epic 3-7, Epic 3-8 / 4-4 respectively).
  'placeholder.projects.title': 'Projects',
  'placeholder.projects.body': 'Project list lands in Epic 2 (Story 2-9).',
  'placeholder.polls.title': 'Polls',
  'placeholder.polls.body': 'PM polls list lands in Epic 3 (Story 3-7).',
  'placeholder.respondent.title': 'Poll preview',
  'placeholder.respondent.body':
    'Respondent landing replaces this stub in Epic 3 (Story 3-8) and Epic 4 (Story 4-4).',
} as const

export type CopyKey = keyof typeof en

export default en
