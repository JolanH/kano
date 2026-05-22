<template>
  <v-app>
    <v-main>
      <v-container
        class="respondent-container"
        :class="{ 'respondent-container--wide': isWide }"
      >
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// Routes opt into the wider container via `meta.wideRespondent` (set on
// `poll-question` so the per-feature page can lay out its two Likerts
// side-by-side on desktop). Landing / expired / not-found / thanks
// stay at the mobile-narrow 480 px default.
const route = useRoute()
const isWide = computed(() => Boolean(route.meta.wideRespondent))
</script>

<style scoped>
/* Respondent body register: 16 px is the mobile-readability minimum
 * (UX spec §Typography System). The 18 px "body-large" variant for the
 * question being answered is applied per-component by `<KanoLikert>`. */
:deep(.v-application__wrap) {
  font-size: 1rem;
}

.respondent-container {
  max-width: 480px;
  padding-left: 16px;
  padding-right: 16px;
  padding-top: 24px;
  padding-bottom: 24px;
}

.respondent-container--wide {
  max-width: 960px;
}
</style>
