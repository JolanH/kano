# Story 3.5: PollSharePanel component with URL, QR preview, and one-click copy

Status: ready-for-dev

## Story

As a PM,
I want a `<PollSharePanel>` component that presents the generated URL, an adjacent QR code, and a one-click copy button with clear confirmation,
so that I can confidently hand off the URL to customers with a preview I've verified on my own phone.

## Acceptance Criteria

1. **Given** `<PollSharePanel :poll="poll" />` is rendered with a freshly generated `PollSummary`, **when** the component mounts, **then** a read-only monospace URL field displays the full `${window.location.origin}/poll/${poll.id}` URL as the largest visual element on the card.
2. A primary Copy button with a leading `mdi-content-copy` icon sits adjacent to the URL.
3. A QR code (roughly 120×120 px) renders the same URL using the `qrcode` npm library loaded **lazily via dynamic `import('qrcode')`** only on first mount of this component. A Vite chunk-name assertion in CI verifies `qrcode` does NOT appear in the main PM entry chunk.
4. Helper text below the URL reads exactly the copy-deck entry `pm.polls.share.helperText` (default English: "Share via email or chat — link expires in 7 days").
5. **When** I click the Copy button, **then** the URL is copied via `navigator.clipboard.writeText(url)`; the button transitions to "Copied ✓" (copy-deck key + `mdi-check` icon) for ~1 second then reverts to "Copy".
6. An `aria-live="polite"` `v-snackbar` announces the copy-deck entry `pm.polls.share.copiedAnnouncement` ("Copied to clipboard") to assistive tech.
7. QR image has `aria-hidden="true"` (decorative); the URL text is the accessible source of truth.
8. The Copy button has `aria-label="Copy poll URL"` (copy-deck key `pm.polls.share.copyButton.ariaLabel`).
9. All user-visible strings (button label, helper text, snackbar text, QR fallback alt if applicable) are sourced from the copy deck — no inline literals (inline-literal lint rule from Story 1.7 blocks merge otherwise).
10. **Given** the Clipboard API is unavailable (older Safari, non-HTTPS local), **when** I click Copy, **then** the button falls back to programmatic selection + `document.execCommand('copy')`; if that also fails, the snackbar announces the copy-deck `pm.polls.share.copyFailed` message and the URL text remains selected so the user can Ctrl/⌘+C manually.
11. The component's Vitest spec asserts: URL rendering, Copy-click → `clipboard.writeText` called with the correct URL, snackbar visible, button label transitions.

## Tasks / Subtasks

- [ ] `src/components/PollSharePanel.vue` (AC: #1, #2, #4, #5, #7, #8)
  - [ ] Props: `poll: PollSummary` (typed import from `src/api/types.ts`)
  - [ ] Template layout (Vuetify):
    - Root `<v-card>` with `class="poll-share-panel"` and `role="region"` + `aria-labelledby`
    - Top section: URL field as a `<v-text-field readonly monospace>` with full URL value; Copy button (`<v-btn color="primary" prepend-icon="mdi-content-copy">`) to its right
    - Middle section: QR `<img>` placeholder (120×120 px) with `aria-hidden="true"` and `alt=""`; swapped to a rendered data URL once `qrcode` resolves
    - Bottom section: `<p class="text-caption text-medium-emphasis">` with helper text from `useCopy('pm.polls.share.helperText')`
    - Adjacent `<v-snackbar v-model="copied" :timeout="1200" location="bottom" aria-live="polite">` with the copied announcement
- [ ] Lazy-load `qrcode` npm package (AC: #3)
  - [ ] Add `qrcode` as a runtime dep in `kano-frontend/package.json` and its types: `@types/qrcode` as devDep
  - [ ] Inside `onMounted`:
    ```ts
    const { toDataURL } = await import('qrcode');
    qrDataUrl.value = await toDataURL(shareUrl.value, { width: 120, margin: 1 });
    ```
  - [ ] The `import('qrcode')` **must** be dynamic (ESM `import()` expression). A static `import` at the top of the file would statically include the library in the PM entry chunk and regress the lazy-load goal.
  - [ ] Vite chunk assertion in CI: extend the existing `size-limit` / bundle-check script (from Story 1.10) with an explicit test that `qrcode` is in an async-loaded chunk, not in `index-*.js`. Approach: `grep -L "qrcode" kano-frontend/dist/assets/index-*.js` must succeed (i.e., `qrcode` not present); a sibling async chunk should contain it. Wire into the CI bundle-gate step.
- [ ] Copy button handler (AC: #5, #6, #10)
  - [ ] `async function copyUrl()`:
    ```ts
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      copied.value = true;
      setTimeout(() => (copied.value = false), 1200);
    } catch (e) {
      // Fallback: select the text + execCommand
      urlInputRef.value?.select();
      const ok = document.execCommand('copy');
      if (ok) {
        copied.value = true;
        setTimeout(() => (copied.value = false), 1200);
      } else {
        copyFailed.value = true;
        setTimeout(() => (copyFailed.value = false), 3000);
      }
    }
    ```
  - [ ] Button label reactive: `{{ copied ? useCopy('pm.polls.share.copied') : useCopy('pm.polls.share.copy') }}`
- [ ] Copy deck entries (AC: #4, #6, #8, #9)
  - [ ] Extend `kano-frontend/src/copy/en.ts` with the `pm.polls.share.*` namespace:
    - `pm.polls.share.title` — "Share this poll" (for the `aria-labelledby` heading, even if visually hidden)
    - `pm.polls.share.copy` — "Copy"
    - `pm.polls.share.copied` — "Copied ✓"
    - `pm.polls.share.copyButton.ariaLabel` — "Copy poll URL"
    - `pm.polls.share.helperText` — "Share via email or chat — link expires in 7 days"
    - `pm.polls.share.copiedAnnouncement` — "Copied to clipboard"
    - `pm.polls.share.copyFailed` — "Couldn't copy automatically — the URL is selected for you to copy manually"
- [ ] Vitest spec (AC: #11)
  - [ ] `kano-frontend/src/components/PollSharePanel.spec.ts`:
    - Mock `navigator.clipboard` (jsdom doesn't ship it by default)
    - Mount with a `PollSummary` fixture
    - Assert: `<v-text-field>` value === expected URL; button has `aria-label="Copy poll URL"`
    - Simulate click → assert `clipboard.writeText` called once with the URL; snackbar becomes visible; button label flips to "Copied ✓"
    - After 1200 ms (use `vi.useFakeTimers()`), button label reverts to "Copy"
    - Test the fallback path by stubbing `clipboard.writeText` to reject; assert `execCommand('copy')` invoked; assert failure snackbar shown if both fail

## Dev Notes

### Why lazy-load `qrcode`

`qrcode` is ~30 KB minified (mostly the Reed-Solomon tables). It's used only on the share panel, which is one step in Paola's authoring flow. Including it in the PM main bundle wastes ~30 KB on every screen load; dynamic import moves it to an async chunk that loads only when `/app/projects/:id/polls/:pollId/share` mounts.

Architecture §Frontend Performance line 405: "Lazy-load the `qrcode` library (D16) only in `<poll-share-panel>` — respondent bundle never imports it." Since the share panel is **only** rendered on PM routes, this is doubly guarded: the respondent bundle wouldn't accidentally pull it in even via a static import mistake.

### QR decorative, URL authoritative

Per UX spec §Component Strategy line 871: "QR code `aria-hidden='true'` (the URL text is the accessible source of truth)." The QR is a visual/mobile-scanning affordance, not content. Screen readers would announce a meaningless data URL if the QR weren't hidden; the adjacent readable URL carries the meaning.

### Button label transition (no dialog, no toast pile-up)

UX spec §Component Strategy line 869: "Copy button transitions to 'Copied' with a check icon for 1 second, then reverts." The reversion is deliberate — no persistent "Copied" state that suggests the operation is still ongoing or unclear. 1200 ms feels snappy but readable (AC #5 says "roughly 1 second"; 1200 ms is the industry default for this pattern).

The snackbar is `aria-live="polite"` so screen readers announce it without interrupting. Do NOT use `aria-live="assertive"` here — the user initiated the action; polite is sufficient and less disruptive.

### Clipboard fallback

`navigator.clipboard.writeText` requires a secure context (HTTPS or localhost) AND user activation. In local dev, HTTPS isn't on (Caddy only terminates TLS in prod per architecture §Infrastructure line 428), but `localhost` is always a secure context — so Clipboard API works. In case of:
- Cross-browser edge (old Safari, some iOS WebKit quirks)
- Non-HTTPS, non-localhost scenario (shouldn't happen in prod but defensive)

The `document.execCommand('copy')` fallback is deprecated but still widely supported as of 2026. The second fallback (select-and-let-user-manually-copy) is the ultimate safety net. AC #10 ties the behavior down so no silent failure is possible.

### Inline-literal lint rule from Story 1.7

Story 1.7's `copy/index.ts` + ESLint rule forbids string literals in `.vue` `<template>` blocks (exceptions: already-whitelisted technical strings like ARIA roles, component names). Every visible string here routes through `useCopy('pm.polls.share.*')`. If the PR's lint step fails on a new literal, thread it through the copy deck — do not whitelist.

### Story does NOT include

- The "Generate poll URL" button on the project detail page — Story 3.6.
- The PM home poll list — Story 3.7.
- The URL's backend creation — Story 3.2.
- The respondent landing that the QR code points at — Story 3.8.
- A "Share via email / SMS" sub-menu — not in v1 per UX spec §Component Strategy line 873 ("no 'Share via…' sub-menus").
- Resending / regenerating a poll — not in v1 (FR15 sets a hard 7-day TTL with no UI override per Post-MVP list line 135).

### Project Structure Notes

Files:
- `kano-frontend/src/components/PollSharePanel.vue` (new)
- `kano-frontend/src/components/PollSharePanel.spec.ts` (new)
- Extend `kano-frontend/package.json` (add `qrcode` runtime dep + `@types/qrcode` dev dep)
- Extend `kano-frontend/src/copy/en.ts` with the `pm.polls.share.*` keys
- Extend `kano-frontend/src/api/types.ts` with `PollSummary` import (if not yet defined; export shape matches Story 3.1's `PollSummary`)
- Update the CI bundle-gate script (from Story 1.10) to assert `qrcode` is in an async chunk

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — `<poll-share-panel>` spec (line 865–874)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 1 authoring ends at share panel (line 665–674)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Critical Success Moments] — share panel is Critical Success Moment 2
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — lazy-load `qrcode` (line 405)
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Component Boundaries] — custom components per UX spec
- [Source: _bmad-output/planning-artifacts/prd.md#FR13–14] — shareable URL handoff
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5] — original AC
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — `useCopy` + inline-literal lint rule
- [Source: _bmad-output/implementation-artifacts/1-10-ci-baseline-pipeline-and-pre-commit-hooks.md] — bundle-size CI gate to extend
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — `PollSummary` wire type

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
