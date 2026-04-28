/**
 * Tiny breakpoint composable used by `PmLayout` to gate `/app/*` rendering on
 * desktop viewports. PM surface is desktop-only by product decision (UX spec
 * §Spacing & Layout); the respondent surface is mobile-first and never goes
 * through this guard.
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const PM_DESKTOP_BREAKPOINT = 1280

export interface BreakpointState {
  width: Ref<number>
  isDesktop: Ref<boolean>
}

export function useBreakpoint(): BreakpointState {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : PM_DESKTOP_BREAKPOINT)
  const isDesktop = ref(width.value >= PM_DESKTOP_BREAKPOINT)

  function update(): void {
    width.value = window.innerWidth
    isDesktop.value = window.innerWidth >= PM_DESKTOP_BREAKPOINT
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return { width, isDesktop }
}

export { PM_DESKTOP_BREAKPOINT }
