/**
 * WCAG contrast spec for the Tixeo theme tokens.
 *
 * Computed locally (no `wcag-contrast` dep) per the spec formula:
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 *
 * The pairings tested here are the ones declared in `src/theme/tixeo.ts` —
 * see `contrastPairings.bodyText` (must hit 4.5:1) and
 * `contrastPairings.largeOrUi` (must hit 3:1). If a token's hex is changed in
 * `tixeo.ts`, this spec fails fast.
 */

import { describe, expect, test } from 'vitest'

import {
  contrastPairings,
  decorativeTokens,
  tixeoColors,
  type TixeoColorToken,
} from '@/theme/tixeo'

function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.replace('#', '')
  const value = parseInt(trimmed, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function channelLuminance(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex)
  const l2 = relativeLuminance(bgHex)
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (light + 0.05) / (dark + 0.05)
}

function colorOf(token: TixeoColorToken): string {
  return tixeoColors[token]
}

describe('Tixeo theme — body text contrast (WCAG AA, ≥ 4.5:1)', () => {
  for (const pairing of contrastPairings.bodyText) {
    test(`${pairing.fg} on ${pairing.bg}`, () => {
      const ratio = contrastRatio(
        colorOf(pairing.fg as TixeoColorToken),
        colorOf(pairing.bg as TixeoColorToken),
      )
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('Tixeo theme — large / non-text UI contrast (WCAG AA, ≥ 3:1)', () => {
  for (const pairing of contrastPairings.largeOrUi) {
    test(`${pairing.fg} on ${pairing.bg}`, () => {
      const ratio = contrastRatio(
        colorOf(pairing.fg as TixeoColorToken),
        colorOf(pairing.bg as TixeoColorToken),
      )
      expect(ratio).toBeGreaterThanOrEqual(3.0)
    })
  }
})

describe('Tixeo theme — decorative tokens excluded from contrast assertions', () => {
  // The decorative-token list pins which colors are intentionally low-
  // contrast (subtle borders, page-level fills). The contrast pairings list
  // MUST NOT include any of them as a foreground — doing so would falsely
  // claim a decorative color meets a WCAG threshold it isn't engineered for.
  const decorativeSet = new Set<string>(decorativeTokens)
  const allPairings = [...contrastPairings.bodyText, ...contrastPairings.largeOrUi]

  for (const pairing of allPairings) {
    test(`pairing fg=${pairing.fg} is not a decorative token`, () => {
      expect(decorativeSet.has(pairing.fg)).toBe(false)
    })
  }
})

describe('contrastRatio helper', () => {
  test('white on black is 21:1 (max)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
  })

  test('symmetric (foreground/background swap is identical)', () => {
    expect(contrastRatio('#1E3A8A', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#1E3A8A'),
      5,
    )
  })
})
