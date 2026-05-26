---
title: 'Polls-home row "View analysis" button (response-count gated)'
type: 'feature'
created: '2026-05-26'
status: 'done'
route: 'one-shot'
---

# Polls-home row "View analysis" button (response-count gated)

## Intent

**Problem:** The PM polls home (`/app/polls`) had no explicit affordance to reach a poll's analysis page. Row-click navigated expired rows to analysis and live rows to share, but a PM with a live poll that already had responses had no in-app path to view the data — the analysis route is fully built (Stories 5-1 to 5-5) but practically unreachable for the common "live poll with N responses" case.

**Approach:** Add a per-row "View analysis" `v-btn` rendered only when `response_count >= 1`. The button sits in a new last "Actions" column, routes to the `poll-analysis` named route with the row's `project_id` and `pollId`, and uses `@click.stop` so the existing row-click handler doesn't double-fire. To avoid the new actions cell behaving like an invisible row-click hot-zone, the button's wrapper carries `data-no-row-click` and the row handler's bail-out selector widens to `closest('a, button, [data-no-row-click]')`.

## Suggested Review Order

**Entry point — the new affordance**

- Conditional button in the actions slot — gating + stop-propagation in one place.
  [`Polls.vue:64`](../../kano-frontend/src/pages/app/Polls.vue#L64)

**Routing**

- Handler that pushes to `poll-analysis` (matches the existing expired-row branch's params shape).
  [`Polls.vue:187`](../../kano-frontend/src/pages/app/Polls.vue#L187)

**Row-click safety net**

- Bail-out widened so clicks inside `[data-no-row-click]` don't fire row-level nav.
  [`Polls.vue:168`](../../kano-frontend/src/pages/app/Polls.vue#L168)

**Column registration**

- New `actions` header — `sortable: false`, `align: 'end'`.
  [`Polls.vue:93`](../../kano-frontend/src/pages/app/Polls.vue#L93)

**Copy keys + parity**

- Two new keys in `en.ts` registered with matching rows in `copy-deck.md` (the en.ts↔copy-deck parity test enforces this).
  [`en.ts:211`](../../kano-frontend/src/copy/en.ts#L211)
  [`copy-deck.md:255`](../../docs/copy-deck.md#L255)

**Tests**

- VDataTable stub extended to forward the `item.actions` slot — required to exercise the new button in unit tests.
  [`polls-page.spec.ts:85`](../../kano-frontend/tests/unit/polls-page.spec.ts#L85)

- Two new specs: gating (button only when `response_count >= 1`) and routing (single push to `poll-analysis`, no row-click double-fire).
  [`polls-page.spec.ts:207`](../../kano-frontend/tests/unit/polls-page.spec.ts#L207)

- VBtn stub now forwards the `MouseEvent` to `emit('click', e)` — required so Vue's `.stop` modifier has an event arg to call `stopPropagation()` on.
  [`polls-page.spec.ts:78`](../../kano-frontend/tests/unit/polls-page.spec.ts#L78)
