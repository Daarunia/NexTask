import { afterEach, describe, expect, test } from 'vitest'
import { i18n } from '../../src/renderer/i18n'
import {
  checklistProgress,
  progressLabel,
  withItemChecked,
  withSavedItem,
} from '../../src/renderer/utils/checklist.helper'
import type { TaskChecklist } from '../../src/renderer/types/checklist.types'

/**
 * Tests unitaires de l'avancement d'une checklist, affiché par le badge des
 * cartes et des Archives (nombre de points cochés et libellé accessible), et
 * coche d'un point depuis la carte.
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

describe('withItemChecked', () => {
  const checklist: TaskChecklist = {
    id: 1,
    items: [
      { id: 10, text: 'Pain', position: 0, isChecked: false, checkedAt: null },
      { id: 11, text: 'Café', position: 1, isChecked: true, checkedAt: '2026-10-15T08:00:00.000Z' },
    ],
  }

  test('coche le point visé et garde les autres tels quels', () => {
    const result = withItemChecked(checklist, 10, true)
    expect(result.items.map((item) => item.isChecked)).toEqual([true, true])
    expect(result.items[1]).toBe(checklist.items[1])
  })

  test('ne modifie pas la checklist reçue', () => {
    withItemChecked(checklist, 11, false)
    expect(checklist.items[1].isChecked).toBe(true)
  })

  test('un id inconnu ne change aucun point', () => {
    expect(withItemChecked(checklist, 99, true).items).toEqual(checklist.items)
  })
})

describe('withSavedItem', () => {
  const checklist: TaskChecklist = {
    id: 1,
    items: [
      { id: 10, text: 'Pain', position: 0, isChecked: true, checkedAt: null },
      { id: 11, text: 'Café', position: 1, isChecked: true, checkedAt: null },
    ],
  }

  test('reprend le point enregistré sans toucher à une autre coche en cours', () => {
    const saved = { id: 10, text: 'Pain', position: 0, isChecked: true, checkedAt: '2026-10-15T08:00:00.000Z' }
    const result = withSavedItem(checklist, saved)
    expect(result.items[0]).toBe(saved)
    expect(result.items[1]).toBe(checklist.items[1])
  })

  test('un point absent ne change rien', () => {
    const saved = { id: 99, text: 'Autre', position: 5, isChecked: true, checkedAt: null }
    expect(withSavedItem(checklist, saved).items).toEqual(checklist.items)
  })
})
