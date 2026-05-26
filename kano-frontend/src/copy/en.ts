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
  'common.notFound.title': 'Page not found',
  'common.notFound.body': "The link you followed doesn't exist (or no longer does).",
  'common.notFound.cta': 'Back to projects',
  'common.snackbar.success': 'Done.',
  'common.snackbar.error': 'Something went wrong. Please try again.',
  'common.version': 'Version',

  // PM layout chrome. `sidebar.aria` is the assistive-tech label for the
  // sidebar `<nav>` element — it describes the *role* of the landmark, not
  // the product name. The visible product title sits in `appBar.title`.
  'pm.layout.sidebar.aria': 'Primary navigation',
  'pm.layout.sidebar.projects': 'Projects',
  'pm.layout.sidebar.polls': 'Polls',
  'pm.layout.sidebar.resources': 'Resources',
  'pm.layout.appBar.title': 'Kano',

  // PM category labels (mirror the six theme tokens in src/theme/tixeo.ts)
  // Display labels are the friendlier industry-standard Kano terms for the
  // first three categories (Must-have ↔ MANDATORY, Performance ↔ LINEAR,
  // Delighter ↔ EXCITER) — these map 1:1. The bottom two use the spec's own
  // names (Contradictory, Doubtful) rather than the extended-Kano vocabulary
  // (Reverse, Questionable) that drafts inadvertently used — those terms
  // mean *different things* in Kano theory and conflict with the backend
  // semantics (e.g. C means "respondent answers contradict each other,"
  // not "user wants the inverse feature"). See story 1-5 (5,1)→D fix.
  'pm.category.must': 'Must-have',
  'pm.category.perf': 'Performance',
  'pm.category.del': 'Delighter',
  'pm.category.ind': 'Indifferent',
  'pm.category.cont': 'Contradictory',
  'pm.category.doub': 'Doubtful',

  // Respondent Likert option labels (FR22 — plain-language replacements for
  // the Kano-methodology jargon). The wording is Story 4-5 / epics line
  // 1126: lowercase past the first option is intentional (UX register is
  // conversational, not interrogative). The historical numeric keys are
  // preserved so any inline `respondent.likert.${value}` consumer still
  // resolves.
  'respondent.likert.1': "Love it",
  'respondent.likert.2': 'Like it',
  'respondent.likert.3': 'Neutral',
  'respondent.likert.4': "Dislike it",
  'respondent.likert.5': "Hate it",
  // KanoLikert (Story 4-5) — interpolated question templates + error copy.
  'respondent.likert.question.functional':
    'How would you feel if feature is available?',
  'respondent.likert.question.dysfunctional':
    'How would you feel if feature is not available?',
  'respondent.likert.error.unanswered':
    'Please select an answer before continuing.',

  // Respondent flow chrome (Epic 4)
  'respondent.progress': 'Question {current} of {total}',
  'respondent.thankYou.title': 'Thanks for your input!',
  'respondent.thankYou.body': 'Your responses have been recorded.',
  'respondent.expired.title': 'This poll is closed',
  'respondent.expired.body': 'The link you used is no longer accepting responses.',
  // Preregistered for Epic 4 — the CTAs and the generic-error string are
  // load-bearing across multiple respondent stories (4-3 submission path,
  // 4-5 Likert, 4-6 next/back, 4-7 submit). Registering them here means
  // each downstream story consumes a key instead of inventing a literal.
  'respondent.cta.next': 'Next',
  'respondent.cta.back': 'Back',
  'respondent.cta.submit': 'Submit',
  'respondent.error.generic': "We couldn't save your response. Please try again.",

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
  // Story 5-4 added the Analysis primitives section (KanoStackedBar +
  // KanoStackedBarTable). Lives at the section heading only — the demo
  // bar/table content is wired from internal demo state, not the copy
  // deck (the per-segment tooltip + table column labels are reused from
  // `analysis.stackedBar*` keys further down).
  'dev.themeAudit.analysisPrimitives': 'Analysis primitives',

  // Story 1.6 / 1.8 scaffold placeholders. Removed when the real pages land
  // (Epic 2-9, Epic 3-7, Epic 3-8 / 4-4 respectively).
  'placeholder.projects.title': 'Projects',
  'placeholder.projects.body': 'Project list lands in Epic 2 (Story 2-9).',

  // PM Projects list + detail (Story 2-9).
  'pm.projects.title': 'Projects',
  'pm.projects.newProject.cta': 'New project',
  'pm.projects.newProject.placeholder.name': 'Project name',
  'pm.projects.newProject.placeholder.version': 'Version label',
  'pm.projects.newProject.commit': 'Create',
  'pm.projects.newProject.cancel': 'Cancel',
  'pm.projects.col.name': 'Name',
  'pm.projects.col.version': 'Version',
  'pm.projects.col.epoch': 'Current version',
  'pm.projects.col.featureCount': 'Features',
  'pm.projects.col.createdAt': 'Created',
  'pm.projects.empty.title': 'No projects yet',
  'pm.projects.empty.body': 'Projects are where you collect Kano feature feedback.',
  'pm.projects.empty.cta': 'Create your first project',
  'pm.projects.loading': 'Loading projects…',
  'pm.projects.error.generic': "We couldn't load your projects. Please try again.",

  // PM Project Detail
  'pm.projectDetail.notFound.title': 'Project not found',
  'pm.projectDetail.notFound.body':
    "This project doesn't exist (or no longer does).",
  'pm.projectDetail.notFound.cta': 'Back to projects',
  'pm.projectDetail.name.aria': 'Project name (click to edit)',
  'pm.projectDetail.version.aria': 'Project version label (click to edit)',
  'pm.projectDetail.features.title': 'Features',
  'pm.projectDetail.features.empty':
    'No features yet — Story 2-10 ships the inline editor.',
  'pm.projectDetail.loading': 'Loading project…',

  // FeatureListEditor (Story 2-10).
  'pm.features.editor.grid.aria': 'Feature list editor',
  'pm.features.editor.row.aria': 'Feature row',
  'pm.features.editor.col.name': 'Feature',
  'pm.features.editor.col.description': 'Description (optional)',
  'pm.features.editor.newRow.placeholder.name': 'Add a feature…',
  'pm.features.editor.newRow.placeholder.description': 'Description (optional)',
  'pm.features.editor.delete.aria': 'Delete feature',
  'pm.features.editor.error.create': "We couldn't create that feature. Please try again.",
  'pm.features.editor.error.update': "We couldn't save that change. Please try again.",
  'pm.features.editor.error.delete': "We couldn't delete that feature. Please try again.",

  // EpochBumpDialog + EpochBumpBanner (Story 2-11).
  // Placeholder names deliberately avoid the substring "epoch": the
  // useCopy regression test sweeps every value in this file for the literal
  // string "epoch" (case-insensitive) to enforce the Version/Epoch glossary.
  'pm.versionBump.dialog.title': 'Create Version {n}?',
  'pm.versionBump.dialog.body.preserved':
    'Existing responses on Version {current} will be preserved.',
  'pm.versionBump.dialog.body.newPolls': 'New polls will use Version {next}.',
  'pm.versionBump.dialog.confirm': 'Create Version {n}',
  'pm.versionBump.dialog.cancel': 'Cancel',
  'pm.versionBump.dialog.error': "We couldn't bump the version. Please try again.",
  'pm.versionBump.dialog.processing': 'Creating new version…',
  'pm.versionBump.banner.inPlace': 'Version {n} updated in place — no responses to preserve.',
  'pm.versionBump.banner.close': 'Dismiss',
  'pm.versionBump.nowEditing': 'Now editing Version {n}',

  // EpochSelector + past-epoch view (Story 2-12). Internal name retains
  // "Epoch"; user-facing strings say "Version" (per Story 1-7 glossary).
  // Placeholder name `current` deliberately avoids the substring "epoch".
  'pm.versionSelector.trigger.aria': 'Switch version',
  'pm.versionSelector.item.aria': 'View Version {n}',
  'pm.versionSelector.item.current': 'Current',
  'pm.viewingPast.banner':
    'Viewing Version {n} (read-only). Return to Version {current} to edit.',
  'pm.viewingPast.returnCta': 'Return to current',

  // PollSharePanel (Story 3-5). Internal name retains "epoch" semantics in
  // the URL routing, but every visible string here is plain English.
  'pm.polls.share.title': 'Share this poll',
  'pm.polls.share.urlLabel': 'Poll URL',
  'pm.polls.share.copy': 'Copy',
  'pm.polls.share.copied': 'Copied',
  'pm.polls.share.copyButton.ariaLabel': 'Copy poll URL',
  'pm.polls.share.helperText': 'Share via email or chat — link expires in 7 days',
  'pm.polls.share.copiedAnnouncement': 'Copied to clipboard',
  'pm.polls.share.copyFailed':
    "Couldn't copy automatically — the URL is selected for you to copy manually",
  'pm.polls.share.qr.fallback':
    'QR code is loading…',

  // Generate-poll flow on project detail (Story 3-6).
  'pm.projects.detail.generatePoll.button': 'Generate poll URL',
  'pm.projects.detail.generatePoll.disabledTooltip': 'Add at least one feature first',
  'pm.projects.detail.generatePoll.noFeatures': 'Add at least one feature before generating a poll',
  'pm.projects.detail.generatePoll.backToProject': 'Back to project',
  'pm.projects.detail.generatePoll.error':
    "We couldn't generate the poll. Please try again.",

  // PM polls list (Story 3-7) — the PM home screen.
  'pm.polls.title': 'Polls',
  'pm.polls.loading': 'Loading polls…',
  'pm.polls.columns.project': 'Project',
  'pm.polls.columns.version': 'Version',
  'pm.polls.columns.responses': 'Responses',
  'pm.polls.columns.expiresIn': 'Expires in',
  'pm.polls.columns.created': 'Created',
  'pm.polls.expired': 'Expired',
  'pm.polls.countdown.expiringNow': 'expiring now',
  'pm.polls.countdown.minutes': '{n} min',
  'pm.polls.countdown.hour': '{n} hour',
  'pm.polls.countdown.hours': '{n} hours',
  'pm.polls.countdown.day': '{n} day',
  'pm.polls.countdown.days': '{n} days',
  'pm.polls.empty.title': 'No polls yet',
  'pm.polls.empty.body': 'Create a project, add features, and generate your first poll URL.',
  'pm.polls.empty.cta': 'Create your first project',
  'pm.polls.empty.noProjectsBody':
    'Create a project, add features, and generate your first poll URL.',
  'pm.polls.empty.noProjectsCta': 'Create your first project',
  'pm.polls.empty.hasProjectsBody':
    'Open a project to add features and generate a poll URL when you’re ready.',
  'pm.polls.empty.hasProjectsCta': 'Open your projects',
  'pm.polls.projectMissing': '(project pending)',
  'pm.polls.analysisPlaceholder':
    "Analysis view ships in Epic 5 — for now, the expired poll's responses are preserved in the database.",

  // Respondent landing (Story 3-8 / 4-4). The stub-era `landing.stub.*`
  // keys are gone — Story 4-4 deleted the LivePollStub component.
  // `expired.*` / `notFound.*` / `loadError.*` are reused unchanged.
  'respondent.landing.loading': 'Loading…',
  'respondent.landing.brand': 'Tixeo',
  // Trust line — UX-spec line 685 / epics line 1108 exact wording. The
  // separators are middle dots (U+00B7), not pipes or hyphens; the
  // em-dash in "2–3" is U+2013. Three beats: brand anchor, honest time
  // cost, value exchange.
  'respondent.landing.trustLine': 'Tixeo · 2–3 minutes · shapes our roadmap',
  // Methodology explainer — sets respondent expectations for the Kano
  // functional/dysfunctional pair before they hit the first question. The
  // two bullet lines mirror the wording of `respondent.likert.question.*`
  // (Story 4-5) so the landing primes the exact question shape Marcus
  // will see.
  'respondent.landing.methodology.intro':
    "For each feature, you'll answer two quick questions:",
  'respondent.landing.methodology.functional': "How you'd feel if it's available",
  'respondent.landing.methodology.dysfunctional': "How you'd feel if it's not",
  'respondent.landing.beginCta': 'Begin',
  'respondent.landing.beginAriaLabel': 'Begin the poll',
  'respondent.expired.contactCta': 'Get in touch with our product team',
  'respondent.notFound.title': "We couldn't find that poll",
  'respondent.notFound.body':
    'The link may have been typed incorrectly. If you think this is an error, please reach out.',
  'respondent.loadError.title': "We couldn't load this poll right now",
  'respondent.loadError.body':
    'Something on our end went wrong. Please try again in a moment.',
  'respondent.loadError.retry': 'Try again',

  // Placeholder until Story 4-6 ships the real Question screen — kept
  // for any leftover reference; the Question route itself is no longer a
  // placeholder.
  'respondent.question.placeholder': 'The first question will appear here shortly.',

  // Question route chrome (Story 4-6 — per-feature progression amendment
  // 2026-05-22: each route screen shows ONE feature with both Likerts;
  // progress label denominates features, not questions, and the halfway
  // microcopy was dropped per user direction).
  'respondent.common.loading': 'Loading…',
  'respondent.flow.progressLabel': 'Feature {current} of {total}',
  'respondent.flow.progressBarAriaLabel': 'Poll progress',

  // SubmitConfirm + Thanks (Story 4-7). The placeholder key from Story
  // 4-6 is preserved for any leftover reference.
  'respondent.submitConfirm.placeholder':
    "Almost done — Story 4-7 will land the submit confirmation here.",
  'respondent.submitConfirm.title': 'Review & submit',
  'respondent.submitConfirm.body':
    "You've answered every question. Send your input when you're ready.",
  'respondent.submitConfirm.submitCta': 'Submit',
  'respondent.submitConfirm.backCta': 'Back',
  'respondent.submitConfirm.missingRedirect':
    "Some answers are missing — we've taken you back",
  'respondent.submitConfirm.error.generic': 'Something went wrong. Please try again.',

  // Thanks page (Story 4-7). Exact title per epics line 1177. No CTAs.
  'respondent.thanks.title': 'Thanks — your input is on the record',
  'respondent.thanks.body': 'Your product manager will see this on a short horizon.',

  // KanoStackedBar + KanoStackedBarTable (Story 5-4). The tooltip template
  // is consumed by every per-segment v-tooltip on the bar (sighted hover +
  // keyboard focus); the column-header keys label the accessible-fallback
  // table that mirrors the bar for screen readers. `{pct}` is rendered as
  // a 1-decimal string by the component (e.g. "33.3") to match the backend
  // dominant_percentage rounding from Story 5-1.
  'analysis.stackedBar.tooltip': '{name}: {count} responses ({pct}%)',
  'analysis.stackedBarTable.col.category': 'Category',
  'analysis.stackedBarTable.col.count': 'Count',
  'analysis.stackedBarTable.col.percentage': 'Percentage',
} as const

export type CopyKey = keyof typeof en

export default en
