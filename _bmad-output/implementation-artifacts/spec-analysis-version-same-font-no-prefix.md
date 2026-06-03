---
title: 'Analysis header: version inline with name, no "Version" prefix'
type: 'feature'
created: '2026-06-03'
status: 'done'
route: 'one-shot'
---

# Analysis header: version inline with name, no "Version" prefix

## Intent

**Problem:** On the poll analysis header the project version rendered as a separate, smaller, on-surface-variant line prefixed with "Version:" (e.g. *TMMS* Version: 18.2.0). The desired reading is a single heading unit: *TMMS 18.2.0*.

**Approach:** Move the version into the project-name `h1` as a plain text `<span>` immediately after the linked name (only the name remains the link), so it inherits the `text-h2` font; drop the "Version:" prefix and the body/variant typography. A small `margin-inline-start` supplies the word gap. An `aria-label` keeps the "Version" semantic for screen readers without showing it.

## Suggested Review Order

**Header markup (the change)**

- Version now sits inside the name heading as bare text after the link; only the name links out.
  [`Analysis.vue:162`](../../kano-frontend/src/pages/app/Analysis.vue#L162)

- `aria-label` preserves the spoken "Version X" the visible label dropped.
  [`Analysis.vue:165`](../../kano-frontend/src/pages/app/Analysis.vue#L165)

**Styling**

- Version inherits `text-h2` from the `h1`; style only adds the inter-word gap.
  [`Analysis.vue:285`](../../kano-frontend/src/pages/app/Analysis.vue#L285)

**Tests (peripheral)**

- Unit: assert link text is the name and the version element is the bare string (no prefix).
  [`analysis-page.spec.ts:329`](../../kano-frontend/tests/unit/analysis-page.spec.ts#L329)

- E2E: header assertions retargeted from the `h1` to the link + version test-ids.
  [`analysis-page.spec.ts:168`](../../kano-frontend/e2e/pm/analysis-page.spec.ts#L168)
