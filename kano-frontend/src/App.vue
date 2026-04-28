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
  return route.meta.layout === 'respondent' ? RespondentLayout : PmLayout
})
</script>
