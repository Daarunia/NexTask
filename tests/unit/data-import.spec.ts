import { describe, expect, test } from 'vitest'
import {
  clampChecklistItems,
  cleanItemText,
  importedSeriesChecklist,
  importedTaskChecklist,
  planTemplateImport,
  truncateText,
} from '../../src/main/server/helpers/dataImport.helper'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../src/main/shared/checklist.constants'

/**
 * Tests unitaires des helpers de l'import des checklists (Vitest, cf.
 * vitest.config.ts), sans lancer l'app.
 */

/** Paramètres des messages des listes raccourcies. */
const LIMITS = { maxItems: CHECKLIST_MAX_ITEMS, maxLength: CHECKLIST_ITEM_MAX_LENGTH }

/**
 * Textes numérotés « Point 1 », « Point 2 »…
 * @param count Nombre de textes
 */
function texts(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Point ${index + 1}`)
}

describe('truncateText', () => {
  test('laisse un texte assez court tel quel', () => {
    expect(truncateText('Relire', 6)).toBe('Relire')
  })

  test('coupe à la longueur maximale et retire les blancs de fin', () => {
    expect(truncateText('Relire le code', 7)).toBe('Relire')
  })

  test("ne sépare pas les deux moitiés d'un émoji", () => {
    expect(truncateText('ab😀', 3)).toBe('ab')
  })
})

describe('cleanItemText', () => {
  test('remplace les retours à la ligne par des espaces et retire les blancs autour', () => {
    expect(cleanItemText('  Relire\r\nle code\n ')).toBe('Relire le code')
  })
})

describe('clampChecklistItems', () => {
  test('garde une liste dans les limites sans la signaler', () => {
    expect(clampChecklistItems([{ text: ' Relire ' }, { text: 'Tester' }])).toEqual({
      items: [{ text: 'Relire' }, { text: 'Tester' }],
      clamped: false,
    })
  })

  test('retire les textes vides sans les signaler ni les compter', () => {
    const items = [{ text: '  ' }, ...texts(CHECKLIST_MAX_ITEMS).map((text) => ({ text }))]
    const result = clampChecklistItems(items)
    expect(result.items).toHaveLength(CHECKLIST_MAX_ITEMS)
    expect(result.clamped).toBe(false)
  })

  test('raccourcit un texte trop long', () => {
    const result = clampChecklistItems([{ text: 'a'.repeat(CHECKLIST_ITEM_MAX_LENGTH + 20) }])
    expect(result.items[0].text).toHaveLength(CHECKLIST_ITEM_MAX_LENGTH)
    expect(result.clamped).toBe(true)
  })

  test('retire les points au-delà du nombre maximal', () => {
    const result = clampChecklistItems(texts(CHECKLIST_MAX_ITEMS + 2).map((text) => ({ text })))
    expect(result.items).toHaveLength(CHECKLIST_MAX_ITEMS)
    expect(result.items.at(-1)?.text).toBe(`Point ${CHECKLIST_MAX_ITEMS}`)
    expect(result.clamped).toBe(true)
  })

  test('garde les autres champs des points', () => {
    expect(clampChecklistItems([{ text: 'Relire', isChecked: true }]).items).toEqual([
      { text: 'Relire', isChecked: true },
    ])
  })
})

describe('importedTaskChecklist', () => {
  test('sans points (export antérieur aux checklists), aucune ligne ni anomalie', () => {
    expect(importedTaskChecklist(3, undefined)).toEqual({ rows: [], problem: null })
  })

  test('reprend la coche et sa date, retire la date d’un point non coché', () => {
    const checkedAt = '2026-10-01T10:00:00.000Z'
    const { rows, problem } = importedTaskChecklist(3, [
      { text: 'Relire', isChecked: true, checkedAt },
      { text: 'Tester', isChecked: false, checkedAt },
      { text: 'Livrer' },
    ])
    expect(rows).toEqual([
      { text: 'Relire', position: 0, isChecked: true, checkedAt: new Date(checkedAt) },
      { text: 'Tester', position: 1, isChecked: false, checkedAt: null },
      { text: 'Livrer', position: 2, isChecked: false, checkedAt: null },
    ])
    expect(problem).toBeNull()
  })

  test('signale une checklist ramenée aux limites', () => {
    const { rows, problem } = importedTaskChecklist(3, [{ text: 'a'.repeat(CHECKLIST_ITEM_MAX_LENGTH + 1) }])
    expect(rows[0].text).toHaveLength(CHECKLIST_ITEM_MAX_LENGTH)
    expect(problem).toEqual({ code: 'taskChecklistClamped', params: { id: 3, ...LIMITS } })
  })
})

describe('importedSeriesChecklist', () => {
  test('sans textes, une liste vide', () => {
    expect(importedSeriesChecklist(2, undefined)).toEqual({ texts: [], problem: null })
  })

  test('signale une liste ramenée aux limites', () => {
    const result = importedSeriesChecklist(2, texts(CHECKLIST_MAX_ITEMS + 1))
    expect(result.texts).toHaveLength(CHECKLIST_MAX_ITEMS)
    expect(result.problem).toEqual({ code: 'recurrenceChecklistClamped', params: { id: 2, ...LIMITS } })
  })
})

describe('planTemplateImport', () => {
  test('sans modèles (export antérieur aux checklists), rien à écrire', () => {
    expect(planTemplateImport(undefined)).toEqual({ templates: [], problems: [] })
  })

  test('trie par position, ordre du fichier à égalité, puis renumérote', () => {
    const { templates } = planTemplateImport([
      { name: 'C', position: 7 },
      { name: 'A', position: 2 },
      { name: 'Sans position' },
      { name: 'B', position: 2 },
    ])
    expect(templates.map(({ name, position }) => [name, position])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
      ['Sans position', 3],
    ])
  })

  test('nettoie le nom, calcule sa clé et reprend les textes des points', () => {
    expect(planTemplateImport([{ name: '  Revue de code ', position: 0, items: [' Relire ', ''] }])).toEqual({
      templates: [{ name: 'Revue de code', nameKey: 'revue de code', position: 0, items: ['Relire'] }],
      problems: [],
    })
  })

  test('ne recrée pas un modèle dont le nom est déjà pris, casse mise à part', () => {
    const { templates, problems } = planTemplateImport([
      { name: 'Revue', position: 0, items: ['Premier'] },
      { name: 'REVUE', position: 1, items: ['Second'] },
    ])
    expect(templates).toEqual([{ name: 'Revue', nameKey: 'revue', position: 0, items: ['Premier'] }])
    expect(problems).toEqual([{ code: 'duplicateTemplateName', params: { name: 'REVUE' } }])
  })

  test('raccourcit un nom trop long et signale les points ramenés aux limites', () => {
    const { templates, problems } = planTemplateImport([
      { name: 'n'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH + 5), items: texts(CHECKLIST_MAX_ITEMS + 1) },
    ])
    const name = 'n'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH)
    expect(templates[0].name).toBe(name)
    expect(templates[0].items).toHaveLength(CHECKLIST_MAX_ITEMS)
    expect(problems).toEqual([
      { code: 'templateNameTruncated', params: { name, maxLength: CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } },
      { code: 'templateChecklistClamped', params: { name, ...LIMITS } },
    ])
  })
})
