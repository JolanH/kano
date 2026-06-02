---
title: 'Deterministic single poll per (project, epoch) + poll-link buttons'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: '85941ff2ecbe651816f0b5a8e4c85c220194eb7a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Each click of "Generate poll URL" mints a fresh `uuid4` poll, so one `(project, epoch)` feature snapshot can spawn unlimited polls — splitting responses and analysis. The single button also always navigates to the PM share view, with no quick way to grab the link.

**Approach:** Make poll creation idempotent — the poll `id` is `uuid5(NAMESPACE, "{project_id}:{epoch}")`, so the deterministic primary key guarantees exactly one poll per `(project, epoch)`. Replace the single generate button with **"Go to poll URL"** (get-or-create, then open the public `/poll/:id` page in a new tab) and **"Copy poll URL to clipboard"** (get-or-create, then copy).

*(The epoch "Version"→"Epoch" relabel was split off to `deferred-work.md` — out of scope here.)*

## Boundaries & Constraints

**Always:**
- Poll `id` is `uuid5` of `f"{project_id}:{epoch}"` under a fixed namespace constant. Re-creating returns the existing poll (idempotent get-or-create), never a duplicate.
- Keep the existing `SELECT ... FOR UPDATE` project lock and the "≥1 active feature required" gate for *new* polls.
- Preserve epoch-pinning: a poll's `epoch` is frozen at creation; a later epoch bump resolves to a *different* deterministic id (a different poll), not a mutation.
- Both new buttons stay disabled when the project has zero active features, exactly as the old button did.

**Ask First:**
- Adding a DB migration or a `version` column to `polls` (the chosen design needs neither — do not add one).
- Changing the public poll URL shape `{base}/poll/{id}` or the `VITE_PUBLIC_BASE_URL` fallback.

**Never:**
- Do not delete the `poll-share` route / `PollShare.vue` / `PollSharePanel.vue` — still reachable from the polls-home page.
- Do not introduce `Math.random`/`uuid4` into poll id generation.
- Do not relabel any "Version" UI copy (that is the deferred follow-up).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First create | ≥1 active feature, no poll for current epoch | 201; `poll.id == uuid5(NS, f"{pid}:{epoch}")` (`UUID.version == 5`); 7-day TTL; `Location` header | N/A |
| Idempotent re-create | poll exists, not expired | 200; same `id`; `expires_at` unchanged; `response_count` reflects current submissions; `is_expired=false` | N/A |
| Re-create after expiry | existing poll `expires_at <= now` | 200; same `id`; `expires_at` refreshed to `now + 7d`; `is_expired=false` | N/A |
| Epoch bumped since first poll | poll exists for epoch 1, project now epoch 2, ≥1 active feature | 201; **new** poll with the epoch-2 deterministic id | N/A |
| Zero active features (no poll yet) | current epoch has 0 active features | unchanged: 422 `poll-requires-features` | raise `PollRequiresFeatures` |
| Nonexistent project | ghost project id | unchanged: 404 `entity-not-found` | raise `EntityNotFound` |
| Go to poll URL (FE) | click "Go to poll URL", poll get-or-created | public `/poll/:id` opens in a new browser tab | popup blocked → failure snackbar; `PollRequiresFeaturesError` → no-features alert; other API error → generic error alert |
| Copy poll URL (FE) | click "Copy poll URL to clipboard" | URL copied; success snackbar | clipboard rejects → failure snackbar; API errors → same alerts as above |

</frozen-after-approval>

## Code Map

- `kano-backend/src/kano/services/poll_service.py` -- `create_poll`: deterministic `uuid5` id + get-or-create + TTL-refresh-on-expiry; returns `tuple[Poll, bool]` (poll, created). Add a `POLL_ID_NAMESPACE` constant + `_deterministic_poll_id` helper.
- `kano-backend/src/kano/api/polls.py` -- `POST .../polls`: unpack `(poll, created)`; status `201` if created else `200`; keep the `Location` header.
- `kano-backend/tests/integration/test_polls_api.py` -- fix `poll_id.version == 4` → `== 5`; add idempotency + 200-on-existing + TTL-refresh cases; the epoch-drift test now expects two *different* deterministic ids.
- `kano-backend/tests/unit/` -- new pure unit test asserting `_deterministic_poll_id` is stable and `(pid, epoch)`-sensitive.
- `kano-frontend/src/lib/pollUrl.ts` -- NEW: `buildPollUrl(pollId)` extracted from `PollSharePanel.vue` lines 94–103.
- `kano-frontend/src/components/PollSharePanel.vue` -- consume `buildPollUrl` instead of inline construction (behavior unchanged).
- `kano-frontend/src/pages/app/ProjectDetail.vue` -- replace the single `generate-poll-button` block with two buttons (`go-to-poll-url-button`, `copy-poll-url-button`); add `onGoToPoll` / `onCopyPollUrl` handlers + a copy snackbar; reuse existing `noFeaturesAlert`/`generateError` state.
- `kano-frontend/src/stores/polls.ts` -- `createPoll` already maps to the now-idempotent endpoint; returns the get-or-created `PollSummary`. No signature change needed.
- `kano-frontend/src/copy/en.ts` -- ADD `pm.projects.detail.pollLink.goButton` = "Go to poll URL", `.copyButton` = "Copy poll URL to clipboard", `.copied`, `.copyFailed`. (Old `generatePoll.noFeatures`/`.error`/`.disabledTooltip` stay and are reused.)
- `kano-frontend/e2e/pm/generate-poll.spec.ts` -- rewrite for the two-button flow (new-tab open + clipboard copy) instead of share-view navigation.
- `kano-frontend/e2e/pm/a11y-paola.spec.ts` -- update if it clicks `generate-poll-button`.

## Tasks & Acceptance

**Execution:**
- [x] `kano-backend/src/kano/services/poll_service.py` -- add `POLL_ID_NAMESPACE = UUID("b54cefc2-de05-4fdd-8913-fa06a48abc30")` and `_deterministic_poll_id(project_id, epoch)`; rewrite `create_poll` as get-or-create returning `(Poll, created: bool)`; on existing-but-expired refresh `expires_at` to `now+7d`; set transient `response_count`/`is_expired` on both branches (count submissions for the existing branch).
- [x] `kano-backend/src/kano/api/polls.py` -- unpack the tuple; `201` when created, `200` otherwise; keep `Location`.
- [x] `kano-backend/tests/integration/test_polls_api.py` + `tests/unit/test_poll_id_deterministic.py` -- cover every backend row of the I/O Matrix.
- [x] `kano-frontend/src/lib/pollUrl.ts` -- extract `buildPollUrl`; wire `PollSharePanel.vue` to it.
- [x] `kano-frontend/src/copy/en.ts` -- add the four `pm.projects.detail.pollLink.*` keys (+ documented them in `docs/copy-deck.md` for the sync gate).
- [x] `kano-frontend/src/pages/app/ProjectDetail.vue` -- two buttons + handlers + copy snackbar (reused the existing snackbar); both call `pollsStore.createPoll` then open-new-tab / copy via `buildPollUrl`; reuse existing alert state.
- [x] `kano-frontend/e2e/pm/generate-poll.spec.ts` -- aligned to the new two-button flow (`a11y-paola.spec.ts` needed no change).

**Acceptance Criteria:**
- Given a project at epoch N with active features, when `POST .../polls` is called twice, then both responses carry the identical `id` and the DB holds exactly one matching poll row.
- Given the deterministic id, when computed for the same `(project_id, epoch)`, then it is byte-stable across processes and differs for any other epoch or project.
- Given the project detail screen, when a PM clicks "Go to poll URL", then the public `/poll/:id` page opens in a new tab; when they click "Copy poll URL to clipboard", then the clipboard holds `{base}/poll/{id}` and a success snackbar shows.
- Given the suites, when `pytest`, `vitest`, `ruff`, `mypy`, and `eslint` run, then all pass (existing "Version" copy is untouched).

## Design Notes

Deterministic id makes a separate `UNIQUE` constraint unnecessary — the primary key *is* the uniqueness guarantee, and a duplicate insert is impossible because the same inputs resolve to the same PK. Existing legacy `uuid4` polls remain readable; they simply won't match the new scheme (acceptable pre-MVP, no real poll data).

Service shape:
```python
poll_id = _deterministic_poll_id(project_id, epoch)
existing = db.session.get(Poll, poll_id)
if existing is not None:
    if existing.expires_at <= now:
        existing.expires_at = now + timedelta(days=POLL_TTL_DAYS)
        db.session.commit(); db.session.refresh(existing)
    existing.response_count = <count submissions for poll_id>
    existing.is_expired = existing.expires_at <= now
    return existing, False
# else: require ≥1 active feature, then insert Poll(id=poll_id, ...)
```

Popup-blocker guard for "Go to poll URL": open the tab **synchronously inside the click handler** (`const win = window.open('', '_blank', 'noopener')`), then after `createPoll` resolves set `win.location = buildPollUrl(id)`; if the poll call fails, `win?.close()` and surface the matching alert. This keeps the open in the user-gesture window so it isn't blocked.

## Verification

**Commands:**
- `cd kano-backend && ruff check . && mypy src && pytest` -- expected: all green; new idempotency/TTL/uuid5 tests pass.
- `cd kano-frontend && npm run lint && npm run test:unit` -- expected: all green.
- `cd kano-frontend && npx playwright test e2e/pm/generate-poll.spec.ts` -- expected: two-button flow passes (new-tab open + clipboard copy).

**Manual checks:**
- Clicking each button behaves per the I/O Matrix; clicking "Go to poll URL" twice opens the *same* URL.

## Suggested Review Order

**Deterministic poll identity (entry point)**

- The core idea: poll id is uuid5 of (project, epoch), so the PK enforces one poll.
  [`poll_service.py:56`](../../kano-backend/src/kano/services/poll_service.py#L56)

- Get-or-create: existing row short-circuits; otherwise insert with feature gate.
  [`poll_service.py:95`](../../kano-backend/src/kano/services/poll_service.py#L95)

- Duplicate-PK race guard — rollback then return the winner's row (idempotent 500-proofing).
  [`poll_service.py:153`](../../kano-backend/src/kano/services/poll_service.py#L153)

- Shared TTL-refresh + transient-field decoration for existing/raced polls.
  [`poll_service.py:62`](../../kano-backend/src/kano/services/poll_service.py#L62)

- Endpoint maps created→201 / existing→200, keeps the Location header.
  [`polls.py:43`](../../kano-backend/src/kano/api/polls.py#L43)

**Frontend poll-link actions**

- "Go to poll URL": open tab synchronously (popup-safe), navigate on resolve.
  [`ProjectDetail.vue:344`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L344)

- Shared get-or-create → URL helper, with the same inline alerts as before.
  [`ProjectDetail.vue:307`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L307)

- Clipboard write + snackbar feedback (graceful failure path).
  [`ProjectDetail.vue:329`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L329)

- Two buttons replace the single generate CTA.
  [`ProjectDetail.vue:146`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L146)

- Extracted public-URL builder, reused by PollSharePanel (DRY).
  [`pollUrl.ts:12`](../../kano-frontend/src/lib/pollUrl.ts#L12)
  [`PollSharePanel.vue:95`](../../kano-frontend/src/components/PollSharePanel.vue#L95)

- Dedupe by poll id so repeated get-or-create clicks don't grow the home list.
  [`polls.ts:82`](../../kano-frontend/src/stores/polls.ts#L82)

**Supporting changes (copy, tests)**

- New poll-link copy keys (no "Version"→"Epoch" relabel — that was deferred).
  [`en.ts:219`](../../kano-frontend/src/copy/en.ts#L219)

- Idempotency + TTL-refresh + uuid5 integration coverage.
  [`test_polls_api.py:198`](../../kano-backend/tests/integration/test_polls_api.py#L198)

- Pure unit test pinning the deterministic-id contract.
  [`test_poll_id_deterministic.py:1`](../../kano-backend/tests/unit/test_poll_id_deterministic.py#L1)

- Rewritten e2e for the two-button flow (new-tab open + clipboard copy).
  [`generate-poll.spec.ts:89`](../../kano-frontend/e2e/pm/generate-poll.spec.ts#L89)
