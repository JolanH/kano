/**
 * Reactive `prefers-reduced-motion` matcher.
 *
 * Returns a `ref<boolean>` that updates when the user toggles the OS-level
 * reduced-motion preference. Used by `<KanoLikert>` (auto-advance delay
 * collapses to 0 ms when set) and the upcoming Story 4-6 progress beat.
 *
 * SSR / non-browser guard: when `window` or `matchMedia` is missing
 * (jsdom-less unit tests, Vite SSR pre-render), defaults to `false`.
 */

import { onBeforeUnmount, ref, type Ref } from 'vue'

export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false)

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return reduced
  }

  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = query.matches

  const handler = (event: MediaQueryListEvent): void => {
    reduced.value = event.matches
  }

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler)
    onBeforeUnmount(() => query.removeEventListener('change', handler))
  } else if (typeof query.addListener === 'function') {
    // Safari < 14 still uses the deprecated API; cheap fallback.
    query.addListener(handler)
    onBeforeUnmount(() => query.removeListener(handler))
  }

  return reduced
}
