/**
 * Build the public, respondent-facing URL for a poll.
 *
 * Prefer the explicit `VITE_PUBLIC_BASE_URL` when set — covers split-origin
 * deploys (PM SPA + respondent SPA on distinct hosts), staging links, and
 * offline / SSR contexts where `window` is undefined. Fall back to
 * `window.location.origin` so default same-origin v1 setups keep working.
 *
 * Single source of truth shared by `PollSharePanel.vue` (share view) and
 * `ProjectDetail.vue`'s "Go to poll URL" / "Copy poll URL" actions.
 */
export function buildPollUrl(pollId: string): string {
  const configured = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.trim()
  const base = configured && configured.length > 0
    ? configured.replace(/\/$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/poll/${pollId}`
}
