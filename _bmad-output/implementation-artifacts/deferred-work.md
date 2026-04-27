# Deferred Work

Items deferred during code reviews that should be revisited at the indicated story or phase.

## Deferred from: code review of story 1-1 (2026-04-27)

- **Vuetify scaffolder leftovers in `kano-frontend/src/`** — HelloWorld broken text classes (`text-body-medium` etc.), remote `cdn.vuetifyjs.com` image, `defaultTheme: 'system'` (Vuetify expects a theme name), empty `<script setup>` blocks, no router catch-all 404, no error boundary, `define: { 'process.env': {} }` shim. Spec "What NOT to do" defers SPA restructure to Story 1.6.
- **`mypy strict = true` lacks third-party overrides** — will explode on first import of factory_boy / flask_migrate; revisit when first real Python code lands (Story 1.3 / 1.5).
- **Frontend `build` script `run-p` exit-code semantics** — failed `type-check` may not propagate non-zero on all `run-p` versions; CI gate (Story 1.10) must verify.
- **Add `engines: { node: ">=24 <25" }` to `kano-frontend/package.json`** — Node 24.x pinning intentionally deferred per Dev Notes to Story 1.9 (Dockerfile) and Story 1.10 (CI matrix).
- **create-vuetify README boilerplate** — sponsor section in `kano-frontend/README.md` and false `unplugin-vue-components` auto-import claim in `src/components/README.md`. Defer docs pass to Story 1.6.

## Deferred from: code review of story 1-2 (2026-04-27)

- **Cross-test schema isolation** — `tests/conftest.py` uses a session-scoped Postgres container plus a per-test `command.downgrade(alembic_config, "base")`. Sequential CI is fine; parallel test runners (pytest-xdist) will collide on the shared container. Revisit when CI parallelism is introduced (Story 1.10).
- **Mark Story 1.1's "mypy strict overrides" item partially discharged** — Story 1.2 added `[[tool.mypy.overrides]]` for `testcontainers.*` (closes that fragment); `factory_boy` and `flask_migrate` overrides still pending until first real Python code lands (Story 1.3 / 1.5). Update the Story 1.1 entry above to reflect partial discharge.
- **`lock_timeout` / `statement_timeout` at migration start** — `migrations/versions/0001_initial_schema.py` does not set per-migration timeouts. Operational safety: a real production upgrade behind a held AccessExclusiveLock would hang indefinitely. Revisit before first production deploy (Story 1.9 / 1.10).
- **Strengthen `test_alembic_roundtrip_completes`** — current test only verifies tables exist after the second upgrade. Add a schema-snapshot helper (capture full inspector output, compare before/after) so silent index/constraint loss across roundtrip is caught. Revisit when adding the second migration so the helper is reusable.
- **AC #3/#5 partial-index wording vs reality** — migration ships a plain B-tree on `polls.expires_at`; PG's IMMUTABLE rule blocks the literal `WHERE expires_at > now()` partial. Functionally equivalent for query plans but the AC text still reads "partial". Revisit if/when production query plans show seq scans, or fold the AC wording fix into a future spec edit.
- **ON DELETE policy for all 5 FKs** — currently PG default (NO ACTION). Decide RESTRICT vs CASCADE per relationship when Epic 2 introduces project/feature delete endpoints. Likely landing point: alongside the first DELETE service in Story 2.x.
- **Positivity CHECK on `current_epoch`, `features.epoch`, `polls.epoch`** — DB-level guard against bug-introduced negative values. Application authority lives in `epoch_service.bump_epoch_on_feature_change()` (Story 2.6); add the CHECKs only if a regression ever writes a bad epoch.
- **`expires_at > created_at` CHECK on polls** — DB-level guard against already-expired polls at creation. Application enforces the 7-day TTL (Story 3.2); add the CHECK only if an "extend poll" flow or a bug-introduced past-expiry shows up.
- **Index on `responses.feature_id` alone** — composite PK `(submission_id, feature_id)` only covers `submission_id` (left-most). Story 5.1's `services.analysis.build_analysis` will need this for cross-submission analysis queries; add the index there alongside the query that needs it.
