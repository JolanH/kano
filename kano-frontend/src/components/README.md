# Components

Reusable Vue components live here. Each component is imported explicitly
where it's used; this project does NOT use `unplugin-vue-components` for
auto-import (the create-vuetify scaffolder's claim that it does was carried
into the initial boilerplate; story 1-1's deferred-work flagged it, story
1-8 corrected it during cleanup).

Conventions:
- One component per file, PascalCase filename matching the component name
  (e.g. `KanoLikert.vue` exports `<KanoLikert>`).
- User-facing strings flow through `useCopy()` — see `docs/copy-deck.md`.
- Themed primitives sit on `src/theme/*`; reusable styles go through
  Vuetify's defaults system in `src/plugins/vuetify.ts`.
