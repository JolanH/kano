# Story 2.13: Paola authoring flow manual a11y sweep (VoiceOver + NVDA)

Status: ready-for-dev

## Story

As a solo dev,
I want manual accessibility validation of Paola's full authoring + epoch flow with VoiceOver (macOS) and NVDA (Windows),
so that keyboard-first does not mean screen-reader-broken — field labels, save-state transitions, epoch-bump dialog focus handling, and inline-edit commits all announce correctly to assistive tech.

## Acceptance Criteria

1. **Given** Stories 2.9, 2.10, 2.11, 2.12 have landed (projects + detail + FeatureListEditor + EpochBump pattern + EpochSelector), **when** Kanaud executes the documented manual a11y checklist for Paola's authoring surface, **then** VoiceOver on macOS Safari correctly announces: project name/version fields on focus, each FeatureListEditor cell label and current value on Tab, inline-edit commit (Enter) as a state change, EpochBumpDialog title and consequence list when it opens, and focus-return to the triggering edit site when the dialog dismisses.
2. NVDA on Windows Firefox announces the same events consistently (noting any cross-platform differences documented as known issues).
3. Focus management is correct end-to-end: no focus traps, no focus-loss on route transition, modal open/close restores focus to trigger, `<EpochSelector>` dropdown arrow-key navigation is audible.
4. `axe-core` CI check on `/app/projects`, `/app/projects/:id`, and `/app/projects/:id?epoch=N` reports zero violations across populated and empty states.
5. The manual checklist results are committed as `docs/a11y/paola-authoring-checklist.md` with a dated signoff and screenshots of any issues found/fixed.
6. Any issues discovered are either fixed in this story or filed as follow-up tickets with explicit acceptance criteria.

## Tasks / Subtasks

- [ ] Author the manual checklist (AC: #1, #2, #5)
  - [ ] `docs/a11y/paola-authoring-checklist.md` — sections:
    - **Environment setup**: macOS + Safari + VoiceOver; Windows (VM acceptable) + Firefox + NVDA; both latest stable versions
    - **Checklist per screen**:
      - `/app/projects` (empty state): VO/NVDA announces page title, empty-state CTA; Tab lands on CTA; Enter activates
      - `/app/projects` (populated): table rows announce name + version + epoch + date; row Enter/Click navigates; "New project" button announces; inline form cells announce labels
      - `/app/projects/:id`: name + version inline-edit announces label on focus, announces "edit mode" on click, announces committed value on Enter
      - `<FeatureListEditor>`: each cell announces its column (name/description) and current value; empty row announces "Add feature" placeholder; Tab order is correct; Backspace-on-empty announces "deleted feature {name}"
      - `<EpochBumpDialog>`: dialog announces role="dialog" + title on open; body content is read; buttons are focusable with Tab; Escape announces closure
      - `<EpochBumpBanner>`: `role="status"` live region announces without stealing focus
      - `<EpochSelector>`: trigger announces "Version {n}, has popup, listbox"; arrow keys announce items; selection announces navigation
    - **Issue log**: table for findings (platform / screen / severity / status)
    - **Signoff**: date + initials per platform
- [ ] Execute the checklist
  - [ ] Run on both platforms; capture screenshots of any issues
  - [ ] File issues for any finding marked "defect" — either fix inline (update the responsible component file and reference the fix commit in the checklist) or open a tracked follow-up
- [ ] Extend CI axe-core coverage (AC: #4)
  - [ ] `e2e/pm/a11y-paola.spec.ts`: navigate to each of the three URLs with both empty and populated seed data; run `AxeBuilder().analyze()`; assert zero violations
  - [ ] Seed helpers: test-setup fixtures that create a project (empty, populated, multi-epoch) in the ephemeral DB; cleaned up after
- [ ] Focus-management Playwright tests (AC: #3)
  - [ ] Modal open/close: trigger EpochBumpDialog via UI action → assert `page.locator(':focus')` is on the primary action on open, returns to the triggering cell on close
  - [ ] Route transition: navigate `/app/projects` → `/app/projects/:id` → assert focus is on a sensible landmark (page heading or first interactive), not lost

## Dev Notes

### Why this story is the Epic 2 gate

PRD NFR9–11 + Readiness Gates make WCAG 2.1 AA + axe-core in CI non-negotiable. The earlier automated checks (axe-core in CI from Story 1-10, Playwright specs throughout) catch structural violations. This story is the **manual verification** that no automatable gap has slipped through — specifically around screen-reader semantic quality, which axe can't fully assess.

Schedule this story **after** 2-9 through 2-12 merge — there's nothing to test until the full authoring UI is in place.

### VM / hardware needs

VoiceOver ships with macOS — Kanaud's Mac should have it. NVDA is free on Windows — if there's no Windows machine, run NVDA in a Windows 10 VM via VirtualBox or use BrowserStack's remote-desktop tier. Document whichever path is used.

### What to do when an issue is found

- **Trivial fix** (e.g., missing `aria-label` on an icon button): fix in the responsible component, note in checklist, re-verify
- **Complex fix**: file a follow-up story in sprint-status (or GitHub Issue), document in the checklist with the tracking link, gate: the story ships without 100% resolution as long as the issue log is public and severity isn't blocker

### Not in scope

- Respondent-surface a11y (Epic 4 has its own sweep, Story 4-8)
- Analysis-surface a11y (Epic 5 has its own, Story 5-8)
- AAA-level compliance

### Project Structure Notes

Files:
- `docs/a11y/paola-authoring-checklist.md`
- `kano-frontend/e2e/pm/a11y-paola.spec.ts`
- Any fix commits referenced from the checklist

### References

- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core gate
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — full E2E Playwright suite green before first PM study
- [Source: _bmad-output/planning-artifacts/architecture.md#Accessibility] — axe-core CI enforcement
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — keyboard parity, focus rings, screen-reader semantics (line 576)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.13] — original AC

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
