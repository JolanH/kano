# Summary

<!-- 1–3 sentences: what and why. -->

## Story / linked work

<!-- Story ID (e.g. 2-7-feature-mutation-api…) or linked ticket. -->

## Test plan

<!-- Bullet list of manual/automated checks performed. -->

## Quality gates (required before merge)

- [ ] Every feature-mutation path still routes through `epoch_service.bump_epoch_on_feature_change()` (architecture §Enforcement Guidelines)
- [ ] Any new Alembic migration has a green `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` roundtrip locally
- [ ] No inline user-facing strings added in `<template>` blocks — all strings go through `useCopy('some.key')` with the key registered in `src/copy/en.ts`
- [ ] Respondent bundle (`/poll/*` routes) stays <150 KB gzipped; ran `npx size-limit` locally
