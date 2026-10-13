import { describe, expect, test } from 'vitest'
import {
  duplicateName,
  type ExistingChecklistItem,
  planChecklistSync,
  templateItemRows,
  templateKey,
} from '../../src/main/server/helpers/checklist.helper'
import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } from '../../src/main/shared/checklist.constants'

/**
 * Tests unitaires des helpers des checklists (Vitest, cf. vitest.config.ts),
 * sans lancer l'app.
 */

/**
 * Clés des noms déjà pris, comme les calcule la route de duplication.
 * @param names Noms des modèles existants
 */
function keys(...names: string[]): Set<string> {
  return new Set(names.map(templateKey))
}

describe('duplicateName', () => {
  test('garde la base quand elle est libre', () => {
    expect(duplicateName('Revue de code (copie)', keys('Revue de code'))).toBe('Revue de code (copie)')
  })

  test('numérote à partir de 2 quand « (copie) » est pris', () => {
    expect(duplicateName('Revue de code (copie)', keys('Revue de code', 'Revue de code (copie)'))).toBe(
      'Revue de code (copie) 2',
    )
  })

  test('saute les numéros déjà pris', () => {
    const taken = keys('Nouveau modèle', 'Nouveau modèle 2', 'Nouveau modèle 3', 'Nouveau modèle 5')
    expect(duplicateName('Nouveau modèle', taken)).toBe('Nouveau modèle 4')
  })

  test('ignore la casse des noms pris', () => {
    expect(duplicateName('Release (copie)', keys('RELEASE (COPIE)'))).toBe('Release (copie) 2')
    expect(duplicateName('Release (copie)', keys('release (copie)', 'RELEASE (Copie) 2'))).toBe('Release (copie) 3')
  })

  test('raccourcit la base pour que le numéro tienne dans la longueur maximale', () => {
    const base = 'a'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH)
    const name = duplicateName(base, keys(base))
    expect(name).toHaveLength(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH)
    expect(name).toBe(`${'a'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH - 2)} 2`)
  })

  test("ne laisse pas d'espace avant le numéro après un raccourcissement", () => {
    const base = `${'a'.repeat(7)} bb`
    expect(duplicateName(base, keys(base), 10)).toBe('aaaaaaa 2')
  })
})

describe('templateItemRows', () => {
  test('nettoie les textes, retire les vides et numérote les positions, sans point coché', () => {
    expect(templateItemRows(['  Écrire  ', '', '   ', 'Relire'])).toEqual([
      { text: 'Écrire', position: 0, isChecked: false, checkedAt: null },
      { text: 'Relire', position: 1, isChecked: false, checkedAt: null },
    ])
  })
})

describe('planChecklistSync', () => {
  const now = new Date('2026-10-13T09:00:00Z')
  const earlier = new Date('2026-10-01T08:00:00Z')

  /**
   * Point existant de la tâche, décoché par défaut.
   * @param id Id du point
   * @param text Texte
   * @param position Position en base
   * @param checkedAt Date de coche, le point est coché si elle est fournie
   */
  function existingItem(id: number, text: string, position: number, checkedAt?: Date): ExistingChecklistItem {
    return { id, text, position, isChecked: checkedAt !== undefined, checkedAt: checkedAt ?? null }
  }

  test("crée tous les points d'une checklist vide, positions numérotées", () => {
    const plan = planChecklistSync(
      [],
      [
        { text: 'Écrire', isChecked: false },
        { text: 'Relire', isChecked: true },
      ],
      now,
    )
    expect(plan).toEqual({
      deleteIds: [],
      update: [],
      create: [
        { text: 'Écrire', position: 0, isChecked: false, checkedAt: null },
        { text: 'Relire', position: 1, isChecked: true, checkedAt: now },
      ],
      total: 2,
    })
  })

  test('met à jour les points modifiés ou déplacés, ignore ceux qui ne changent pas', () => {
    const existing = [existingItem(1, 'Écrire', 0), existingItem(2, 'Relire', 1), existingItem(3, 'Publier', 2)]
    const plan = planChecklistSync(
      existing,
      [
        { id: 1, text: 'Écrire', isChecked: false },
        { id: 3, text: 'Publier la note', isChecked: false },
        { id: 2, text: 'Relire', isChecked: false },
      ],
      now,
    )
    expect(plan.update).toEqual([
      { id: 3, text: 'Publier la note', position: 1, isChecked: false, checkedAt: null },
      { id: 2, text: 'Relire', position: 2, isChecked: false, checkedAt: null },
    ])
    expect(plan.create).toEqual([])
    expect(plan.deleteIds).toEqual([])
    expect(plan.total).toBe(3)
  })

  test('supprime les points absents de la liste, et tous avec une liste vide', () => {
    const existing = [existingItem(1, 'Écrire', 0), existingItem(2, 'Relire', 1)]
    expect(planChecklistSync(existing, [{ id: 2, text: 'Relire', isChecked: false }], now)).toEqual({
      deleteIds: [1],
      update: [{ id: 2, text: 'Relire', position: 0, isChecked: false, checkedAt: null }],
      create: [],
      total: 1,
    })
    expect(planChecklistSync(existing, [], now)).toEqual({ deleteIds: [1, 2], update: [], create: [], total: 0 })
  })

  test('traite un id étranger à la tâche, ou répété, comme un nouveau point', () => {
    const existing = [existingItem(1, 'Écrire', 0)]
    const plan = planChecklistSync(
      existing,
      [
        { id: 99, text: "Point d'une autre tâche", isChecked: false },
        { id: 1, text: 'Écrire', isChecked: false },
        { id: 1, text: 'Écrire encore', isChecked: false },
      ],
      now,
    )
    expect(plan.create).toEqual([
      { text: "Point d'une autre tâche", position: 0, isChecked: false, checkedAt: null },
      { text: 'Écrire encore', position: 2, isChecked: false, checkedAt: null },
    ])
    expect(plan.update).toEqual([{ id: 1, text: 'Écrire', position: 1, isChecked: false, checkedAt: null }])
    expect(plan.deleteIds).toEqual([])
  })

  test('nettoie les textes et retire les vides, sans trou dans les positions', () => {
    const existing = [existingItem(1, 'Écrire', 0), existingItem(2, 'Relire', 1)]
    const plan = planChecklistSync(
      existing,
      [
        { id: 1, text: '   ', isChecked: true },
        { text: '', isChecked: false },
        { id: 2, text: '  Relire  ', isChecked: false },
        { text: ' Publier ', isChecked: false },
      ],
      now,
    )
    // Le point 1 vidé est supprimé, le point 2 remonte en tête
    expect(plan).toEqual({
      deleteIds: [1],
      update: [{ id: 2, text: 'Relire', position: 0, isChecked: false, checkedAt: null }],
      create: [{ text: 'Publier', position: 1, isChecked: false, checkedAt: null }],
      total: 2,
    })
  })

  test("date un point coché à l'instant", () => {
    const plan = planChecklistSync([existingItem(1, 'Écrire', 0)], [{ id: 1, text: 'Écrire', isChecked: true }], now)
    expect(plan.update).toEqual([{ id: 1, text: 'Écrire', position: 0, isChecked: true, checkedAt: now }])
  })

  test("garde la date d'un point déjà coché", () => {
    const existing = [existingItem(1, 'Écrire', 0, earlier), existingItem(2, 'Relire', 1, earlier)]
    const plan = planChecklistSync(
      existing,
      [
        { id: 1, text: 'Écrire', isChecked: true },
        { id: 2, text: 'Relire le texte', isChecked: true },
      ],
      now,
    )
    // Le point 1 ne change pas, le point 2 change de texte mais garde sa date
    expect(plan.update).toEqual([{ id: 2, text: 'Relire le texte', position: 1, isChecked: true, checkedAt: earlier }])
  })

  test("remet à null la date d'un point décoché", () => {
    const plan = planChecklistSync(
      [existingItem(1, 'Écrire', 0, earlier)],
      [{ id: 1, text: 'Écrire', isChecked: false }],
      now,
    )
    expect(plan.update).toEqual([{ id: 1, text: 'Écrire', position: 0, isChecked: false, checkedAt: null }])
  })
})
