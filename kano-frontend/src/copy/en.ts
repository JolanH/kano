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

  // PM category labels (mirror the six theme tokens in src/theme/tixeo.ts).
  // Standard Kano evaluation-table vocabulary: A=Attractive, M=Must-be,
  // O=Performance, I=Indifferent, R=Reverse, Q=Questionable. Suffixes track
  // the backend `Category` enum values and the `pm.category.*` key map in
  // `kano-categories.ts` (must/perf/attr/ind/rev/que).
  'pm.category.must': 'Must-be',
  'pm.category.perf': 'Performance',
  'pm.category.attr': 'Attractive',
  'pm.category.ind': 'Indifferent',
  'pm.category.rev': 'Reverse',
  'pm.category.que': 'Questionable',

  // PM category help tooltips (Story 5-7) — short ≤ 2-line definitions
  // surfaced by `<CatBadge :with-help="true">` on the analysis page (FR39
  // first-use help). Suffix vocabulary tracks the backend `Category` enum
  // (Attractive / Reverse / Questionable) to match `pm.category.attr` /
  // `pm.category.rev` / `pm.category.que` above. Wording is non-load-bearing
  // (every category is also labeled visibly via CatBadge); a copy-deck
  // refinement during low-fidelity review does not require a code change.
  'pm.category.help.must': 'Users expect this feature. Its absence causes frustration.',
  'pm.category.help.perf': 'Satisfaction scales with quality. More is better.',
  'pm.category.help.attr': "Aspirational. Users don't expect it, but love it when present.",
  'pm.category.help.ind': "Users don't care whether this feature exists or not.",
  'pm.category.help.rev': 'Users actively prefer this feature absent. Presence reduces satisfaction.',
  'pm.category.help.que': 'Contradictory answers — usually a misread question. Treat the result with caution.',

  // Respondent Likert option labels — the classic Kano evaluation scale
  // (Like → Expect → Neutral → Can-tolerate → Dislike), kept verbatim in
  // sync with the PM analysis matrix axes (`analysis.kanoMatrix.answer.*`) so
  // a respondent's answer reads identically to the cell that categorizes it.
  // NOTE: this is a deliberate override of FR22 / the UX-spec "no Kano jargon
  // on the respondent surface" rule, made at the user's explicit request in
  // favor of matrix↔poll label consistency. Values must match the matrix
  // answer copy 1:1.
  'respondent.likert.1': 'Like it',
  'respondent.likert.2': 'Expect it',
  'respondent.likert.3': 'Neutral',
  'respondent.likert.4': 'Can tolerate it',
  'respondent.likert.5': 'Dislike it',
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
  'pm.projectDetail.viewAnalysis.button': 'View analysis',
  'pm.projectDetail.viewAnalysis.disabledTooltip':
    'No polls yet — generate one to see analysis.',

  // FeatureListEditor (Story 2-10).
  'pm.features.editor.grid.aria': 'Feature list editor',
  'pm.features.editor.row.aria': 'Feature row',
  'pm.features.editor.col.name': 'Feature',
  'pm.features.editor.col.description': 'Description (optional)',
  'pm.features.editor.newRow.placeholder.name': 'Add a feature…',
  'pm.features.editor.newRow.placeholder.description': 'Description (optional)',
  'pm.features.editor.delete.aria': 'Delete feature',
  'pm.features.editor.submit.aria': 'Add feature',
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

  // Deterministic poll-link actions on project detail. One poll exists per
  // (project, epoch); these two buttons get-or-create it, then open / copy.
  'pm.projects.detail.pollLink.goButton': 'Go to poll URL',
  'pm.projects.detail.pollLink.copyButton': 'Copy poll URL to clipboard',
  'pm.projects.detail.pollLink.copied': 'Poll URL copied to clipboard',
  'pm.projects.detail.pollLink.copyFailed':
    "We couldn't copy the URL automatically. Please try again.",

  // PM polls list (Story 3-7) — the PM home screen.
  'pm.polls.title': 'Polls',
  'pm.polls.loading': 'Loading polls…',
  'pm.polls.columns.project': 'Project',
  'pm.polls.columns.version': 'Version',
  'pm.polls.columns.responses': 'Responses',
  'pm.polls.columns.expiresIn': 'Expires in',
  'pm.polls.columns.created': 'Created',
  'pm.polls.columns.actions': 'Actions',
  'pm.polls.viewAnalysis.button': 'View analysis',
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

  // Story 5-5 — analysis page composition (table, header, empty/error
  // surfaces). Per the story's Dev Notes the "of N expected" denominator
  // doesn't exist in the data model (no expected_respondents column on
  // polls), so Recommendation (A) wins: `analysis.confidenceBeat` drops the
  // "of N" and renders the response volume alone; `analysis.emptyState`
  // drops the count entirely. If a future story adds the field, swap the
  // parameterized variants in.
  // `analysis.page.aria` is the assistive-tech landmark label for the
  // `<section>` that wraps the whole page — describes the *role* of the
  // region, not the version of any artifact (the version chip carries its
  // own visible text).
  'analysis.page.aria': 'Analysis',
  'analysis.table.col.feature': 'Feature',
  'analysis.table.col.dominant': 'Dominant',
  'analysis.table.col.distribution': 'Distribution',
  'analysis.table.col.n': 'n',
  'analysis.dominant.tiedPercent': '{pct} each',
  'analysis.emptyState':
    'No responses yet — analysis will populate as responses arrive.',
  'analysis.confidenceBeat.singular': '{total} response',
  'analysis.confidenceBeat.plural': '{total} responses',
  'analysis.error.notFound.title': 'Poll not found',
  'analysis.error.notFound.body':
    'The poll URL is invalid or was removed.',
  'analysis.error.notFound.cta': 'Back to projects',
  'analysis.error.load.title': "Couldn't load analysis",
  'analysis.error.load.body': 'Please check your connection and try again.',
  'analysis.error.load.retry': 'Retry',

  // PerCategoryPanels (Story 5-6) — secondary cross-index below the table.
  // `heading` labels the whole panels block as an h2; per-category section
  // headers source their visible text from <CatBadge>'s existing
  // `pm.category.*` label, so no per-category title key is added here.
  // `entryAriaLabel` is the per-anchor aria-label that adds navigational
  // intent ("Jump to …") on top of the visible feature-name + percentage.
  // The tied variant exists because a SR user hearing "50 percent dominant"
  // on a tied row could parse it as "50 percent is dominant", missing that
  // the percentage applies in each tied category — FR35.
  'analysis.panels.heading': 'By category',
  'analysis.panels.entryAriaLabel': 'Jump to {feature} ({pct} dominant)',
  'analysis.panels.entryAriaLabelTied':
    'Jump to {feature} ({pct} in each tied category)',

  // KanoCategoryPie — category-repartition pie at the top of the "By
  // category" panel. The pie keys on each feature's dominant category; a
  // tied feature is split fractionally (1/N) across its tied categories so
  // the slices sum to 100%. `ariaLabel` labels the `role="img"` SVG (the
  // visible legend carries the per-category numbers as real text);
  // `sliceLabel` is shared by the per-slice hover tooltip AND the legend
  // line, mirroring `analysis.stackedBar.tooltip`'s "{name}: {pct}%" shape.
  'analysis.pie.ariaLabel': 'Dominant-category distribution across features',
  'analysis.pie.sliceLabel': '{name}: {pct}%',

  // Tie-meaning help (Story 5-7 AC #4) — surfaced by the (i) icon next to
  // the confidence beat on the analysis page header. Explains what a
  // dominant-category tie means in plain language (FR35 / FR39).
  // `analysis.help.tieIconAriaLabel` labels the icon button itself so SRs
  // announce its role before the tooltip's aria-describedby content reads.
  'analysis.help.tieMeaning':
    'When two categories share the top position, customer opinion is genuinely split — both categories are equally dominant.',
  'analysis.help.tieIconAriaLabel': 'About dominant-category ties',

  // KanoCategoryReference — standing glossary `<aside>` to the right of the
  // "By category" section. Lists all six Kano categories (always, regardless
  // of the poll's data) with a fuller, Kano-textbook-grounded description.
  // Deliberately a SEPARATE namespace from the terse `pm.category.help.*`
  // CatBadge first-use tooltips (Story 5-7): different surface, different
  // length budget. Standard Kano evaluation-table vocabulary — `rev`/`que`
  // are Reverse (the user prefers the feature absent) and Questionable (a
  // contradictory answer pair); see kano_matrix.py.
  'analysis.categoryRef.heading': 'What the categories mean',
  'analysis.categoryRef.desc.must':
    'A basic expectation. Its absence causes strong dissatisfaction, yet its presence is taken for granted — the price of entry.',
  'analysis.categoryRef.desc.perf':
    'The more, the better. Satisfaction rises and falls in direct proportion to how well this is delivered.',
  'analysis.categoryRef.desc.attr':
    "An unexpected extra. Users don't ask for it, but its presence sparks delight and sets the product apart.",
  'analysis.categoryRef.desc.ind':
    'Users are unmoved either way — its presence or absence makes little difference to how satisfied they feel.',
  'analysis.categoryRef.desc.rev':
    'Users actively prefer this feature absent — building it would work against satisfaction, not for it.',
  'analysis.categoryRef.desc.que':
    'A contradictory answer pair, usually a misread question. The signal is unreliable; treat it with caution.',

  // KanoMatrixReference — static 5×5 Kano evaluation table rendered as a card
  // directly under the "categories meaning" reference, reminding the PM how a
  // pair of poll answers maps to a category. Rows are the functional answer
  // (feature present), columns the dysfunctional answer (feature absent); both
  // axes share the five classic Kano answer labels (`answer.*`). The 25 cell
  // labels reuse the existing `pm.category.*` names — the matrix is a display
  // mirror of kano_matrix.py, never a categorization path.
  'analysis.kanoMatrix.heading': 'How answers map to categories',
  'analysis.kanoMatrix.functionalAxis': 'Functional (feature is present)',
  'analysis.kanoMatrix.dysfunctionalAxis': 'Dysfunctional (feature is absent)',
  'analysis.kanoMatrix.answer.like': 'Like it',
  'analysis.kanoMatrix.answer.expect': 'Expect it',
  'analysis.kanoMatrix.answer.neutral': 'Neutral',
  'analysis.kanoMatrix.answer.tolerate': 'Can tolerate it',
  'analysis.kanoMatrix.answer.dislike': 'Dislike it',
  'analysis.kanoMatrix.tableCaption':
    'Each cell shows the Kano category for a pair of answers: the row is how the respondent feels when the feature is present (functional), the column is how they feel when it is absent (dysfunctional).',
} as const

export type CopyKey = keyof typeof en

export default en
