import { describe, expect, test } from 'vitest'
import { appendTemplateItems, toChecklistInput, toTemplateItems } from '../../src/renderer/utils/checklist.helper'

/**
 * Tests unitaires des fonctions de la checklist du dialogue de tâche, soit
 * l'application d'un modèle, l'enregistrement comme modèle, les points envoyés
 * avec la tâche et la largeur de la barre de progression.
 */

/** Point du dialogue, comme ceux de l'éditeur (clé de rendu en plus). */
interface Draft {
  key: number
  id?: number
  text: string
  isChecked: boolean
}

let lastKey = 0

/**
 * Nouveau point décoché, avec sa clé.
 * @param text Texte du point
 */
function draft(text: string): Draft {
  return { key: ++lastKey, text, isChecked: false }
}

/**
 * Modèle réduit à ses points.
 * @param texts Textes des points
 */
function template(...texts: string[]) {
  return {
    items: texts.map((text, position) => ({ id: position + 1, text, position, isChecked: false, checkedAt: null })),
  }
}

describe('appendTemplateItems', () => {
  test('ajoute les points du modèle à la fin, décochés et dans le même ordre', () => {
    const existing: Draft = { key: 900, id: 7, text: 'Déjà là', isChecked: true }
    const result = appendTemplateItems([existing], template('Changelog', 'Tag'), draft)

    expect(result.map((item) => item.text)).toEqual(['Déjà là', 'Changelog', 'Tag'])
    expect(result[0]).toBe(existing)
    expect(result.slice(1).every((item) => !item.isChecked && item.id === undefined)).toBe(true)
  })

  test('remplit une checklist vide', () => {
    expect(appendTemplateItems([], template('Un', 'Deux'), draft).map((item) => item.text)).toEqual(['Un', 'Deux'])
  })

  test('appliquer deux fois le même modèle donne deux copies aux clés distinctes', () => {
    const tpl = template('Un')
    const result = appendTemplateItems(appendTemplateItems([], tpl, draft), tpl, draft)

    expect(result.map((item) => item.text)).toEqual(['Un', 'Un'])
    expect(new Set(result.map((item) => item.key)).size).toBe(2)
  })

  test('ne modifie ni la liste reçue ni le modèle', () => {
    const items = [draft('A')]
    const tpl = template('B')
    appendTemplateItems(items, tpl, draft)

    expect(items).toHaveLength(1)
    expect(tpl.items).toHaveLength(1)
  })
})

describe('toTemplateItems', () => {
  test('garde les textes nettoyés, sans les vides ni leur état coché', () => {
    expect(toTemplateItems([{ text: '  Changelog ' }, { text: '   ' }, { text: 'Tag' }, { text: '' }])).toEqual([
      'Changelog',
      'Tag',
    ])
  })

  test('une checklist vide donne un modèle sans point', () => {
    expect(toTemplateItems([])).toEqual([])
  })
})

describe('toChecklistInput', () => {
  test("garde l'ordre, l'id des points existants et leur état coché", () => {
    expect(
      toChecklistInput([
        { id: 3, text: 'Existant', isChecked: true },
        { text: ' Nouveau ', isChecked: false },
      ]),
    ).toEqual([
      { id: 3, text: 'Existant', isChecked: true },
      { text: 'Nouveau', isChecked: false },
    ])
  })

  test('retire les points vides après nettoyage', () => {
    expect(
      toChecklistInput([
        { id: 1, text: '  ', isChecked: true },
        { text: '', isChecked: false },
        { text: 'Reste', isChecked: false },
      ]),
    ).toEqual([{ text: 'Reste', isChecked: false }])
  })

  test("n'envoie pas la clé de rendu de l'éditeur", () => {
    expect(toChecklistInput([draft('Point')])).toEqual([{ text: 'Point', isChecked: false }])
  })
})
