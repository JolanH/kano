<template>
  <component :is="layoutComponent">
    <router-view />
  </component>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

import RespondentLayout from '@/layouts/RespondentLayout.vue'

// PM layout is async-imported so the respondent bundle (Epic 3/4 routes)
// doesn't drag in the navigation drawer / app bar / breakpoint composable.
const PmLayout = defineAsyncComponent(() => import('@/layouts/PmLayout.vue'))

const route = useRoute()

const layoutComponent = computed(() => {
  // Explicit discriminator: every route MUST declare `meta.layout`. The
  // catch-all 404 route (and any future dev/admin routes) declares `'pm'`
  // so the layout is always deliberate — there is no silent fallback. A
  // meta-less route is a misconfiguration: throw in dev so the offender
  // can't ship; fall through to PmLayout + console error in prod so the
  // user still sees *something* rather than a blank screen.
  const layout = route.meta.layout
  if (layout === 'respondent') return RespondentLayout
  if (layout === 'pm') return PmLayout
  const msg = `[App.vue] Route "${String(route.fullPath)}" has no meta.layout — set meta.layout: 'pm' | 'respondent' explicitly.`
  if (import.meta.env.DEV) throw new Error(msg)
  // eslint-disable-next-line no-console
  console.error(msg)
  return PmLayout
})
</script>
