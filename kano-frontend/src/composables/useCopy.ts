/**
 * `useCopy` — keyed lookup against the active locale's copy deck.
 *
 * Behavior:
 * - Known key → returns the registered string, with `{name}` placeholders
 *   substituted from the optional `params` object.
 * - Unknown key → returns the key itself verbatim. This is the **graceful
 *   degradation** mode: a forgotten key shows up as `pm.foo.bar` text on the
 *   rendered surface during dev (loud and obvious) without crashing.
 *
 * The `vue/no-bare-strings-in-template` ESLint rule keeps new inline literals
 * out of templates, so there's no normal way to bypass this composable.
 */

import en from '@/copy/en'

export type CopyParams = Record<string, string | number>

function format(template: string, params?: CopyParams): string {
  if (!params) return template
  let output = template
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{${key}}`, String(value))
  }
  return output
}

export function useCopy(): (key: string, params?: CopyParams) => string {
  return (key: string, params?: CopyParams): string => {
    const template = (en as Record<string, string>)[key]
    if (template === undefined) return key
    return format(template, params)
  }
}
