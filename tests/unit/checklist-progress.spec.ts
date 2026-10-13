import { afterEach, describe, expect, test } from 'vitest'
import { i18n } from '../../src/renderer/i18n'
import { checklistProgress, progressLabel } from '../../src/renderer/utils/checklist.helper'

/**
 * Tests unitaires de l'avancement d'une checklist, affiché par le badge des
 * cartes et des Archives (nombre de points cochés et libellé accessible).
 */

describe('checklistProgress', () => {
  test('compte les points cochés et le total', () => {
    expect(checklistProgress([{ isChecked: true }, { isChecked: false }, { isChecked: true }])).toEqual({
      done: 2,
      total: 3,
    })
  })

  test('une liste vide ou absente vaut 0 sur 0', () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 })
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0 })
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 })
  })
})

describe('progressLabel', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  test.each([
    [0, 3, '0 point coché sur 3'],
    [1, 3, '1 point coché sur 3'],
    [2, 6, '2 points cochés sur 6'],
  ])('%i sur %i en français → %j', (done, total, expected) => {
    expect(progressLabel(done, total)).toBe(expected)
  })

  test.each([
    [0, 3, '0 items checked out of 3'],
    [1, 3, '1 item checked out of 3'],
    [3, 3, '3 items checked out of 3'],
  ])('%i sur %i en anglais → %j', (done, total, expected) => {
    i18n.global.locale.value = 'en'
    expect(progressLabel(done, total)).toBe(expected)
  })
})
