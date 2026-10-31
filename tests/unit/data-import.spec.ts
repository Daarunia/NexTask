import { describe, expect, test } from 'vitest'
import {
  boardPlacement,
  clampChecklistItems,
  cleanItemText,
  findBoardProblem,
  firstDuplicate,
  importedBoards,
  importedSeriesChecklist,
  importedTaskChecklist,
  paletteColor,
  planTemplateImport,
  truncateText,
} from '../../src/main/server/helpers/dataImport.helper'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../src/main/shared/checklist.constants'

/**
 * Tests unitaires des helpers de l'import des checklists et des tableaux
 * (Vitest, cf. vitest.config.ts), sans lancer l'app.
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

describe('paletteColor', () => {
  test('garde une couleur de la palette, retire une couleur inconnue ou absente', () => {
    expect(paletteColor('sky')).toBe('sky')
    expect(paletteColor('pink')).toBeNull()
    expect(paletteColor(undefined)).toBeNull()
  })
})

describe('firstDuplicate', () => {
  test('renvoie le premier doublon, ou undefined', () => {
    expect(firstDuplicate([1, 2, 3, 2, 1])).toBe(2)
    expect(firstDuplicate(['a', 'b'])).toBeUndefined()
  })
})

describe('findBoardProblem', () => {
  const boards = [
    { id: 10, name: 'Travail', position: 0 },
    { id: 20, name: 'Perso', position: 1 },
  ]

  test('fichier antérieur aux tableaux, aucun contrôle', () => {
    expect(findBoardProblem({ stages: [{ id: 1, boardId: 99 }] })).toBeNull()
  })

  test('accepte des tableaux cohérents, une colonne sans tableau prenant le premier', () => {
    expect(findBoardProblem({ boards, stages: [{ id: 1, boardId: 20 }, { id: 2 }] })).toBeNull()
  })

  test('refuse un id de tableau en double', () => {
    expect(findBoardProblem({ boards: [...boards, { id: 10, name: 'Autre', position: 2 }], stages: [] })).toEqual({
      code: 'duplicateBoard',
      params: { id: 10 },
    })
  })

  test('refuse deux noms égaux une fois nettoyés, casse mise à part', () => {
    expect(findBoardProblem({ boards: [...boards, { id: 30, name: ' PERSO ', position: 2 }], stages: [] })).toEqual({
      code: 'duplicateBoardName',
      params: { name: 'perso' },
    })
  })

  test('refuse une colonne dans un tableau absent du fichier', () => {
    expect(
      findBoardProblem({
        boards,
        stages: [
          { id: 1, boardId: 10 },
          { id: 2, boardId: 99 },
        ],
      }),
    ).toEqual({
      code: 'stageUnknownBoard',
      params: { id: 2 },
    })
  })

  test('refuse des colonnes avec une liste de tableaux vide, accepte un fichier vide', () => {
    expect(findBoardProblem({ boards: [], stages: [{ id: 1 }] })).toEqual({
      code: 'stageUnknownBoard',
      params: { id: 1 },
    })
    expect(findBoardProblem({ boards: [], stages: [] })).toBeNull()
  })
})

describe('importedBoards', () => {
  test('fichier antérieur aux tableaux, null', () => {
    expect(importedBoards(undefined)).toBeNull()
  })

  test('trie par position puis id, nettoie le nom, calcule sa clé et retire une couleur inconnue', () => {
    expect(
      importedBoards([
        { id: 30, name: 'Perso', color: 'sky', position: 1 },
        { id: 20, name: ' Travail ', color: 'pink', position: 0, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 10, name: 'Idées', position: 1 },
      ]),
    ).toEqual([
      {
        id: 20,
        name: 'Travail',
        nameKey: 'travail',
        color: null,
        position: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 10, name: 'Idées', nameKey: 'idées', color: null, position: 1, createdAt: undefined },
      { id: 30, name: 'Perso', nameKey: 'perso', color: 'sky', position: 1, createdAt: undefined },
    ])
  })
})

describe('boardPlacement', () => {
  test('fichier antérieur aux tableaux, tout rejoint le tableau par défaut', () => {
    const placement = boardPlacement(null, 7)
    expect(placement.stage(undefined)).toBe(7)
    expect(placement.kept(undefined)).toBe(7)
    expect(placement.kept(null)).toBe(7)
  })

  test('colonne sans tableau dans le premier, archive gardée seulement si son tableau est dans le fichier', () => {
    const boards = importedBoards([
      { id: 10, name: 'Travail', position: 0 },
      { id: 20, name: 'Perso', position: 1 },
    ])
    const placement = boardPlacement(boards, 10)
    expect(placement.stage(20)).toBe(20)
    expect(placement.stage(undefined)).toBe(10)
    expect(placement.kept(20)).toBe(20)
    expect(placement.kept(99)).toBeNull()
    expect(placement.kept(null)).toBeNull()
    expect(placement.kept(undefined)).toBeNull()
  })
})
