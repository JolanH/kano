<template>
  <v-app>
    <template v-if="isDesktop">
      <v-navigation-drawer
        permanent
        color="surface-variant"
        theme="dark"
        width="240"
      >
        <nav :aria-label="copy('pm.layout.appBar.title')">
          <ul class="pm-nav-list">
            <li>
              <RouterLink class="pm-nav-link" to="/app/projects">
                <v-icon size="20" class="me-2">mdi-folder-multiple</v-icon>
                {{ copy('pm.layout.sidebar.projects') }}
              </RouterLink>
            </li>
            <li>
              <RouterLink class="pm-nav-link" to="/app/polls">
                <v-icon size="20" class="me-2">mdi-poll</v-icon>
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
          <v-card class="pa-6 text-center" data-testid="unsupported-viewport">
            <v-icon size="48" color="primary" class="mb-4">mdi-monitor</v-icon>
            <div class="text-h6 mb-2">{{ copy('common.unsupportedViewport.title') }}</div>
            <div class="text-body-2 text-on-surface-variant">
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
