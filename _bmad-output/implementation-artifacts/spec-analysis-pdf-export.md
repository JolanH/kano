---
title: 'Export poll analysis page as PDF (full page, all features)'
type: 'feature'
created: '2026-06-03'
status: 'done'
context: []
baseline_commit: '3cb43a7db0a001ebfbed7436811cd7d3cb870730'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A PM viewing a poll's analysis (`/app/projects/:id/polls/:pollId/analysis`) has no way to take the result off-screen — to attach to a report, share with stakeholders who lack access, or archive. The page already shows every feature at once (`AnalysisTable` is hardcoded to `items-per-page="-1"`), so the on-screen state is already "all features".

**Approach:** Add a one-click "Export PDF" button to the analysis header that rasterizes the live analysis surface (header + feature table + per-category panels + standing Kano reference panels) to a multi-page A4 PDF and downloads it, using client-side `html2canvas` + `jspdf`. Both libraries are loaded via dynamic `import()` so they never enter the static/respondent bundle.

## Boundaries & Constraints

**Always:**
- Capture the full `.analysis-page` section ref — results AND the standing reference panels, matching what's on screen.
- Lazy-load `html2canvas` and `jspdf` via `await import(...)` inside the export handler only — mirror the `qrcode` pattern in `PollSharePanel.vue` (`const { toDataURL } = await import('qrcode')`).
- Exclude the Export button and transient UI (snackbar) from the captured image (`data-html2canvas-ignore="true"`).
- All user-facing strings go through `useCopy` keys in `copy/en.ts` (`no-bare-strings-in-template` lint forbids inline literals).
- Disable the button + show a generating state while producing; re-enable on success or failure.

**Ask First:**
- Any server-side / headless-browser rendering (out of scope — client-side only was chosen), or a third runtime dependency beyond `html2canvas` + `jspdf`.

**Never:**
- Do not statically import `html2canvas`/`jspdf` anywhere reachable from the respondent or index entry (would break the 150 KB respondent-bundle gate in `scripts/check-respondent-bundle.mjs`).
- Do not add pagination controls or an itemsPerPage selector — the table already renders all rows.
- Do not change the analysis data fetch, the API, or any backend code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Analysis loaded, ≥1 submission, user clicks Export PDF | Multi-page A4 PDF of the full surface downloads; filename includes epoch (and project name if known) | N/A |
| Tall page | Surface taller than one A4 page | Image sliced across as many A4 pages as needed, no content clipped | N/A |
| Button gating | `loading`, `loadError`, or empty (`total_submissions === 0`) | Export button is not rendered / not actionable | N/A |
| Generation failure | `html2canvas`/`jspdf` throws or dynamic import fails | Button re-enables; error snackbar shown; no partial file forced | Catch, surface `analysis.export.error` |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/pages/app/Analysis.vue` -- adds the Export PDF button to `.analysis-header__meta`, a template ref on the `.analysis-page` section, wires the composable, and a local error `v-snackbar`.
- `kano-frontend/src/composables/useAnalysisPdf.ts` -- NEW. Lazy import + capture + multi-page A4 assembly + download. Returns `{ exporting, exportToPdf(el, filename) }`.
- `kano-frontend/src/components/PollSharePanel.vue` -- dynamic-import precedent for `qrcode` (pattern reference, no change).
- `kano-frontend/src/copy/en.ts` -- flat dot-path copy deck; add `analysis.export.*` keys.
- `kano-frontend/scripts/check-respondent-bundle.mjs` -- bundle gate that must still pass after the new deps land.
- `kano-frontend/tests/unit/analysis-page.spec.ts` -- existing page test to extend; `docs/copy-deck.md` -- copy-deck doc listing keys.

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/package.json` -- add `html2canvas` and `jspdf` to `dependencies` -- the two client-side libraries the export relies on. (Added `html2canvas ^1.4.1`, `jspdf ^4.2.1`.)
- [x] `kano-frontend/src/composables/useAnalysisPdf.ts` -- create the composable: reactive `exporting` ref + async `exportToPdf(el: HTMLElement, filename: string)` that `await import()`s both libs, renders `el` to canvas (white background, `scale: 2`), slices the canvas into A4 pages via `jsPDF`, and calls `pdf.save(filename)`; toggle `exporting` in a `try/finally` and rethrow on failure -- isolates the heavy/lazy logic and keeps it unit-testable.
- [x] `kano-frontend/src/copy/en.ts` -- add `analysis.export.button` ("Export PDF"), `analysis.export.generating` ("Generating PDF…"), `analysis.export.ariaLabel`, and `analysis.export.error` -- user-facing strings for the control and failure snackbar.
- [x] `kano-frontend/src/pages/app/Analysis.vue` -- add a `ref` on the `.analysis-page` section; render a `v-btn` (icon `mdi-file-pdf-box`) in `.analysis-header__meta`, shown only when `analysis && !isEmpty && !loading && !loadError`; mark the button (and snackbar) `data-html2canvas-ignore="true"`; on click call `exportToPdf(sectionEl, filename)`, bind `:loading="exporting"`; add a local error `v-snackbar` keyed to `analysis.export.error` -- the one-click trigger and feedback.
- [x] `docs/copy-deck.md` -- document the new `analysis.export.*` keys -- keeps the copy-deck doc authoritative per `en.ts` header rule.
- [x] `kano-frontend/tests/unit/use-analysis-pdf.spec.ts` -- create unit test mocking `html2canvas` + `jspdf`; assert single-page and multi-page (tall canvas) both call `addImage`/`addPage`/`save` correctly, `exporting` flips true→false, and a thrown error still resets `exporting` -- covers the I/O matrix.
- [x] `kano-frontend/tests/unit/analysis-page.spec.ts` -- extend: button present with data + hidden on loading/error/empty; click invokes the (mocked) composable with the section element and an epoch-bearing filename.

**Acceptance Criteria:**
- Given a loaded analysis with ≥1 submission, when the PM clicks Export PDF, then a multi-page A4 PDF capturing the full analysis surface (header, table with all features, per-category panels, reference panels) downloads with a filename containing the epoch.
- Given the page is loading, errored, or has zero submissions, when the page renders, then no Export PDF button is actionable.
- Given the user clicks Export PDF, when generation is in flight, then the button shows a loading state and is disabled until completion.
- Given `html2canvas`/`jspdf` throws, when the export fails, then the button re-enables and an error snackbar appears.
- Given a production build, when `npm run build` runs, then the respondent-bundle gate still passes (the new libs sit in a lazy chunk, not the static entry).

## Design Notes

Multi-page slicing — the canonical html2canvas→jsPDF pattern (golden example):

```ts
const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
const pageW = pdf.internal.pageSize.getWidth()
const pageH = pdf.internal.pageSize.getHeight()
const imgH = (canvas.height * pageW) / canvas.width   // scale image to page width
const img = canvas.toDataURL('image/png')
let heightLeft = imgH, position = 0
pdf.addImage(img, 'PNG', 0, position, pageW, imgH)
heightLeft -= pageH
while (heightLeft > 0) {
  position -= pageH
  pdf.addPage()
  pdf.addImage(img, 'PNG', 0, position, pageW, imgH)
  heightLeft -= pageH
}
pdf.save(filename)
```

Filename: build from project name (when `projectName` is non-empty) + epoch, e.g. `kano-analysis-<slug>-epoch-<epoch>.pdf`, falling back to `kano-analysis-epoch-<epoch>.pdf` on direct URL entry. Capturing the `.analysis-page` section ref (not `document.body`) naturally excludes the PmLayout sidebar/app-bar chrome while keeping everything the page itself owns. SVG charts (`KanoStackedBar`, `KanoCategoryPie`) and Vuetify text render as a rasterized snapshot — fidelity tradeoff accepted with the html2canvas approach.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: new `use-analysis-pdf` suite + updated analysis-page suite pass.
- `cd kano-frontend && npm run lint` -- expected: clean (no bare-string violations).
- `cd kano-frontend && npm run type-check` -- expected: no TS errors.
- `cd kano-frontend && npm run build` -- expected: build succeeds AND `postbuild` respondent-bundle gate passes (proves html2canvas/jspdf are lazy chunks, not in the static entry).

**Manual checks:**
- On a poll analysis page with several features, click Export PDF; confirm the downloaded PDF contains the header, full feature table, per-category panels, and the Kano reference panels, paginated across A4 pages with nothing clipped.

## Suggested Review Order

**PDF generation core (the heart of the change)**

- Entry point — the lazy-import → capture → A4 pagination → download pipeline; read this first to grasp the design.
  [`useAnalysisPdf.ts:28`](../../kano-frontend/src/composables/useAnalysisPdf.ts#L28)
- Both heavy libs loaded only here via dynamic `import()` — keeps them out of the static/respondent bundle.
  [`useAnalysisPdf.ts:37`](../../kano-frontend/src/composables/useAnalysisPdf.ts#L37)
- Zero-dimension guard: throws instead of silently saving a corrupt PDF (review patch).
  [`useAnalysisPdf.ts:55`](../../kano-frontend/src/composables/useAnalysisPdf.ts#L55)
- Multi-page slicing with sub-pixel epsilon to avoid a gratuitous trailing blank page (review patch).
  [`useAnalysisPdf.ts:77`](../../kano-frontend/src/composables/useAnalysisPdf.ts#L77)

**Page wiring & UX (trigger, gating, feedback)**

- Capture root: the `.analysis-page` section ref — naturally excludes the PmLayout chrome.
  [`Analysis.vue:187`](../../kano-frontend/src/pages/app/Analysis.vue#L187)
- The Export button: gated to loaded+non-empty, `:loading` state, `data-html2canvas-ignore` so it's not in its own snapshot.
  [`Analysis.vue:277`](../../kano-frontend/src/pages/app/Analysis.vue#L277)
- Click handler — invokes the composable, flips the error snackbar on failure.
  [`Analysis.vue:128`](../../kano-frontend/src/pages/app/Analysis.vue#L128)
- Filename slug: diacritic-normalized + length-capped, epoch-bearing (review patch).
  [`Analysis.vue:109`](../../kano-frontend/src/pages/app/Analysis.vue#L109)

**Copy & docs**

- Four `analysis.export.*` keys (button / generating / aria / error) via the copy deck.
  [`en.ts:364`](../../kano-frontend/src/copy/en.ts#L364)
- Mirrored into the copy-deck doc per the en.ts header rule.
  [`copy-deck.md:354`](../../docs/copy-deck.md#L354)

**Tests (peripherals)**

- Composable unit tests — single/multi-page, lifecycle, failure, zero-canvas guard, re-entrancy.
  [`use-analysis-pdf.spec.ts:109`](../../kano-frontend/tests/unit/use-analysis-pdf.spec.ts#L109)
- Page tests — button presence/gating, click args, filename, in-flight generating label, error snackbar.
  [`analysis-page.spec.ts:545`](../../kano-frontend/tests/unit/analysis-page.spec.ts#L545)

## Spec Change Log

- **2026-06-03 — post-merge fix: swapped `html2canvas` → `html2canvas-pro`.** In the
  browser the export always failed with `Error: Attempting to parse an unsupported
  color function "color"` (snackbar: "Couldn't generate the PDF"). Root cause: the
  app's theme uses `color-mix()`, which the browser resolves to the modern
  `color(srgb …)` syntax in computed styles; stock `html2canvas@1.4.1` (Feb 2022)
  only understands `hsl/rgb/rgba` and throws. Replaced with the drop-in fork
  `html2canvas-pro@^2.0.4` (same default-export API, adds `color()`/`oklch`/`lab`
  support). Changed: `package.json` dep, the `await import()` specifier in
  `useAnalysisPdf.ts`, and the `vi.mock()` target in `use-analysis-pdf.spec.ts`.
  The unit-test mocks never exercised a real rasterization, so they passed against
  the broken lib — verified the fix end-to-end with headless Chromium (valid
  `%PDF-1.3`, multi-page download). Note: the dev Docker `web` container must be
  rebuilt + its `node_modules` volume recreated for the new dep to resolve.
