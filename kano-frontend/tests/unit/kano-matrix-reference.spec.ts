// @vitest-environment jsdom
/**
 * KanoMatrixReference — the static 5×5 Kano evaluation table rendered under the
 * "categories meaning" panel. Asserts:
 *
 * - All 25 cells render, one per (functional, dysfunctional) answer pair.
 * - Each cell's category matches the canonical Kano evaluation table, pinned
 *   here independently of the component's own `KANO_MATRIX` constant so a
 *   silent edit to either drifting from the backend `kano_matrix.py` fails CI.
 * - Cell labels are the copy-deck category names (color is reinforcement, the
 *   name text is the accessible channel — NFR10); cells carry `data-category`.
 * - Both axes' answer headers (`<th scope="col|row">`) source the five classic
 *   Kano answer labels from the copy deck, in Likert 1..5 order.
 * - The grid is a semantic `<table>` with an `sr-only` `<caption>`; the card is
 *   an `<aside>` labelled by its own heading.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'

import KanoMatrixReference from '@/components/KanoMatrixReference.vue'
import { COPY_KEY, MATRIX_ANSWER_KEYS } from '@/components/kano-categories'
import type { Category } from '@/api/types'
import en from '@/copy/en'

// Independent pin of the standard Kano evaluation table (rows = functional
// answer fq 1..5, cols = dysfunctional answer dq 1..5) — the exact grid in
// kano-backend/src/kano/services/kano_matrix.py. Hard-coded here on purpose:
// if either this or the component's KANO_MATRIX changes, parity breaks loudly.
const EXPECTED: Category[][] = [
  ['Q', 'A', 'A', 'A', 'O'],
  ['R', 'Q', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'Q', 'M'],
  ['R', 'R', 'R', 'R', 'Q'],
]

describe('KanoMatrixReference', () => {
  test('renders all 25 cells', () => {
    const wrapper = mount(KanoMatrixReference)
    expect(wrapper.findAll('.matrix-cell')).toHaveLength(25)
  })

  test('every cell matches the canonical Kano evaluation table', () => {
    const wrapper = mount(KanoMatrixReference)

    for (let fq = 0; fq < 5; fq++) {
      for (let dq = 0; dq < 5; dq++) {
        const cat = EXPECTED[fq][dq]
        const cell = wrapper.find(
          `[data-testid="kano-matrix-cell-${fq + 1}-${dq + 1}"]`,
        )
        expect(cell.exists(), `cell ${fq + 1}-${dq + 1} present`).toBe(true)
        // Category identity is carried both by the data attribute and by the
        // visible name text (the accessible channel — color alone never).
        expect(cell.attributes('data-category')).toBe(cat)
        expect(cell.text()).toBe(en[COPY_KEY[cat]])
      }
    }
  })

  test('column and row headers source the five classic answer labels in order', () => {
    const wrapper = mount(KanoMatrixReference)

    const expectedLabels = MATRIX_ANSWER_KEYS.map((key) => en[key])

    const colHeads = wrapper.findAll('th[scope="col"]').map((th) => th.text())
    expect(colHeads).toEqual(expectedLabels)

    const rowHeads = wrapper.findAll('th[scope="row"]').map((th) => th.text())
    expect(rowHeads).toEqual(expectedLabels)
  })

  test('axis labels source the copy deck', () => {
    const wrapper = mount(KanoMatrixReference)
    expect(wrapper.find('.axis-dysfunctional').text()).toBe(
      en['analysis.kanoMatrix.dysfunctionalAxis'],
    )
    expect(wrapper.find('.axis-functional').text()).toBe(
      en['analysis.kanoMatrix.functionalAxis'],
    )
  })

  test('grid is a semantic table with an sr-only caption disambiguating the axes', () => {
    const wrapper = mount(KanoMatrixReference)

    const table = wrapper.find('table.matrix-table')
    expect(table.exists()).toBe(true)

    const caption = table.find('caption')
    expect(caption.exists()).toBe(true)
    expect(caption.classes()).toContain('sr-only')
    expect(caption.text()).toBe(en['analysis.kanoMatrix.tableCaption'])
  })

  test('the card is an aside labelled by its own heading', () => {
    const wrapper = mount(KanoMatrixReference)

    const aside = wrapper.find('[data-testid="kano-matrix-reference"]')
    expect(aside.element.tagName).toBe('ASIDE')

    const heading = aside.find('.matrix-heading')
    expect(heading.element.tagName).toBe('H3')
    expect(heading.text()).toBe(en['analysis.kanoMatrix.heading'])

    const headingId = heading.attributes('id')
    expect(headingId).toBeTruthy()
    expect(aside.attributes('aria-labelledby')).toBe(headingId)
  })
})
