/**
 * `useCopy` — keyed lookup against the active locale's copy deck.
 *
 * Behavior:
 * - Known key → returns the registered string, with `{name}` placeholders
 *   substituted from the optional `params` object via a single-pass regex
 *   scan (no chained replaceAll — substitution is order-independent and
 *   never recurses into a value that contains another placeholder).
 * - Unknown key → returns the key itself verbatim. This is the **graceful
 *   degradation** mode: a forgotten key shows up as `pm.foo.bar` text on the
 *   rendered surface during dev (loud and obvious) without crashing.
 *
 * The `vue/no-bare-strings-in-template` ESLint rule keeps new inline literals
 * out of templates, so there's no normal way to bypass this composable.
 */

import en, { type CopyKey } from '@/copy/en'

export type CopyParams = Record<string, string | number>

// Matches `{identifier}` where identifier is [A-Za-z0-9_]+. Anything else
// (e.g. `{foo bar}`, `{}`) is left as literal text.
const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g

function format(template: string, params?: CopyParams): string {
  if (!params) return template
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (!(key in params)) return match
    const value = params[key]
    if (value === null || value === undefined) {
      throw new TypeError(
        `useCopy: param "${key}" is null/undefined; nullish placeholder substitution is not allowed (would render the literal string "${value}").`,
      )
    }
    return String(value)
  })
}

// `CopyKey | (string & {})` keeps autocomplete on the known key set while
// still accepting arbitrary strings for dynamic lookups (e.g. building a
// key from a runtime category enum). The `& {}` brand is the standard
// TypeScript trick to preserve literal-type narrowing in the union.
type CopyKeyOrString = CopyKey | (string & {})

export function useCopy(): (key: CopyKeyOrString, params?: CopyParams) => string {
  return (key, params) => {
    const template = (en as Record<string, string>)[key]
    if (template === undefined) return key
    return format(template, params)
  }
}
