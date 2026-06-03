---
title: 'Lighten the polls-list epoch badge for readability'
type: 'bugfix'
created: '2026-06-03'
status: 'done'
route: 'one-shot'
---

# Lighten the polls-list epoch badge for readability

## Intent

**Problem:** On the polls list, the "Epoch N" badge used `<v-chip variant="flat">` with no color. A flat no-color chip takes its background from the theme's `surface-variant` token — which Tixeo sets to a near-black `#1C1F26` — while the text stays `on-surface` (#1A1D23). The result was near-black text on a near-black pill: unreadable.

**Approach:** Switch the chip to `variant="outlined"` — transparent fill, near-black `on-surface` text on the white table row (~15:1 contrast), with a subtle border. This makes the badge light and readable, and aligns it with the epoch chip already used in `EpochSelector.vue`. Verified visually with a screenshot of the rendered row.

## Suggested Review Order

- The one-line fix: `flat` (dark surface-variant fill) → `outlined` (transparent, dark-on-white text).
  [`Polls.vue:47`](../../kano-frontend/src/pages/app/Polls.vue#L47)
