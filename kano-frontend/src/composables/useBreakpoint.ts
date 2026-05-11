/**
 * Tiny breakpoint composable used by `PmLayout` to gate `/app/*` rendering on
 * desktop viewports. PM surface is desktop-only by product decision (UX spec
 * §Spacing & Layout); the respondent surface is mobile-first and never goes
 * through this guard.
 *
 * Must be called from a component `setup()` (the resize listener is attached
 * via `onBeforeUnmount`). Calling from a Pinia store, route guard, or unit
 * test that doesn't mount a component would silently leak the resize listener
 * and never get cleanup — the `getCurrentInstance()` check below throws in
 * dev so the misuse is impossible to ship.
 */

import {
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  type Ref,
} from 'vue'

const PM_DESKTOP_BREAKPOINT = 1280

export interface BreakpointState {
  width: Ref<number>
  isDesktop: Ref<boolean>
}

export function useBreakpoint(): BreakpointState {
  if (getCurrentInstance() === null) {
    // Throw in both dev and prod — silent no-op is the worst-of-both: a
    // future engineer using this from a store/guard would get a frozen
    // `isDesktop` ref forever with no signal. Better to fail loud here than
    // let a desktop-gate silently misreport on resize in production.
    throw new Error(
      '[useBreakpoint] must be called from a component setup() — the resize listener relies on onBeforeUnmount for cleanup.',
    )
  }

  // Read window.innerWidth once. The resize listener (registered
  // synchronously, not on `onMounted`) keeps both refs in sync from this
  // moment forward, so a viewport change between setup and first paint is
  // reflected without an interim wrong value.
  const width = ref(window.innerWidth)
  const isDesktop = ref(window.innerWidth >= PM_DESKTOP_BREAKPOINT)

  function update(): void {
    width.value = window.innerWidth
    isDesktop.value = window.innerWidth >= PM_DESKTOP_BREAKPOINT
  }

  window.addEventListener('resize', update)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return { width, isDesktop }
}

export { PM_DESKTOP_BREAKPOINT }
