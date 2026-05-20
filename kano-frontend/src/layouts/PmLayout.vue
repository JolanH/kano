<template>
  <v-app>
    <template v-if="isDesktop">
      <v-navigation-drawer
        permanent
        color="surface-variant"
        width="240"
      >
        <nav :aria-label="copy('pm.layout.sidebar.aria')">
          <ul class="pm-nav-list">
            <li>
              <RouterLink class="pm-nav-link" to="/app/projects">
                <v-icon icon="mdi-folder-multiple" size="20" class="me-2" aria-hidden="true" />
                {{ copy('pm.layout.sidebar.projects') }}
              </RouterLink>
            </li>
            <li>
              <RouterLink class="pm-nav-link" to="/app/polls">
                <v-icon icon="mdi-poll" size="20" class="me-2" aria-hidden="true" />
                {{ copy('pm.layout.sidebar.polls') }}
              </RouterLink>
            </li>
          </ul>
        </nav>
      </v-navigation-drawer>

      <v-app-bar flat color="surface" class="border-b">
        <v-app-bar-title>{{ copy('pm.layout.appBar.title') }}</v-app-bar-title>
      </v-app-bar>

      <v-main>
        <v-container class="pm-container py-6">
          <slot />
        </v-container>
      </v-main>
    </template>

    <template v-else>
      <v-main>
        <v-container
          class="d-flex align-center justify-center"
          style="min-height: 100vh; max-width: 480px;"
        >
          <v-card
            class="pa-6 text-center"
            data-testid="unsupported-viewport"
            role="alert"
            aria-live="assertive"
            :aria-labelledby="`unsupported-viewport-title`"
            :aria-describedby="`unsupported-viewport-body`"
          >
            <v-icon icon="mdi-monitor" size="48" color="primary" class="mb-4" aria-hidden="true" />
            <div id="unsupported-viewport-title" class="text-h6 mb-2">
              {{ copy('common.unsupportedViewport.title') }}
            </div>
            <div id="unsupported-viewport-body" class="text-body-2 text-on-surface-variant">
              {{ copy('common.unsupportedViewport.body') }}
            </div>
          </v-card>
        </v-container>
      </v-main>
    </template>
  </v-app>
</template>

<script lang="ts" setup>
import { RouterLink } from 'vue-router'

import { useBreakpoint } from '@/composables/useBreakpoint'
import { useCopy } from '@/composables/useCopy'

const { isDesktop } = useBreakpoint()
const copy = useCopy()
</script>

<style scoped>
/* PM body register: 14 px / rem ratio matches the Tixeo screenshot's dense
 * enterprise typography (UX spec §Typography System). Set on the v-app root
 * via `:deep` so descendant Vuetify primitives inherit. */
:deep(.v-application__wrap) {
  font-size: 0.875rem;
}

.pm-container {
  max-width: 1440px;
}

.pm-nav-list {
  list-style: none;
  padding: 8px 12px;
  margin: 0;
}

.pm-nav-list li {
  margin: 0;
}

.pm-nav-link {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 4px;
  color: rgb(var(--v-theme-on-surface-dark));
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}

.pm-nav-link:hover,
.pm-nav-link:focus-visible {
  background-color: rgba(255, 255, 255, 0.06);
  outline: none;
}

.pm-nav-link.router-link-active {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
