import { describe, expect, test } from 'vitest'
import {
  highlightParts,
  matchExcerpt,
  normalizeSearchText,
  searchTerms,
  taskMatchExcerpt,
  taskMatchesFilter,
} from '../../src/renderer/utils/search.helper'
import type { Task } from '../../src/renderer/types/task.types'

/**
 * Tests unitaires de la recherche du board : normalisation de la saisie et
 * filtre d'une tâche par texte et par tags.
 */

/**
 * Tâche minimale pour les tests de filtre.
 * @param overrides Champs à remplacer
 */
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    version: '',
    description: '',
    position: 0,
    title: 'Tâche',
    isHistorized: false,
    stageId: 1,
    tags: [],
    ...overrides,
  }
}

const tag = (id: number) => ({ id, name: `tag${id}` }) as NonNullable<Task['tags']>[number]

describe('normalizeSearchText', () => {
  test.each([
    ['Tâche', 'tache'],
    ['  ÉLÈVE   Noël ', 'eleve noel'],
    ['Redmine', 'redmine'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })
})

describe('searchTerms', () => {
  test.each([
    ['', []],
    ['   ', []],
    ['redm', ['redm']],
    ['  Migrer  le WIKI ', ['migrer', 'le', 'wiki']],
  ])('%j → %j', (query, expected) => {
    expect(searchTerms(query)).toEqual(expected)
  })
})

describe('taskMatchesFilter', () => {
  test('sans mots ni tags, toute tâche passe', () => {
    expect(taskMatchesFilter(task(), [], [])).toBe(true)
  })

  test('cherche dans le titre sans tenir compte de la casse ni des accents', () => {
    expect(taskMatchesFilter(task({ title: 'Créer la Tâche' }), searchTerms('tache'), [])).toBe(true)
    expect(taskMatchesFilter(task({ title: 'Créer la Tâche' }), searchTerms('autre'), [])).toBe(false)
  })

  test('cherche dans la description, syntaxe Markdown ignorée', () => {
    const t = task({ title: 'Wiki', description: '## Migrer\n- vers **Redmine**\n[lien](http://x)' })
    expect(taskMatchesFilter(t, searchTerms('redmine'), [])).toBe(true)
    expect(taskMatchesFilter(t, searchTerms('http'), [])).toBe(false)
  })

  test('tous les mots doivent être présents, titre et description confondus', () => {
    const t = task({ title: 'Migrer le wiki', description: 'vers Redmine' })
    expect(taskMatchesFilter(t, searchTerms('wiki redmine'), [])).toBe(true)
    expect(taskMatchesFilter(t, searchTerms('wiki jira'), [])).toBe(false)
  })

  test('cherche dans les textes des points de la checklist, cochés ou non', () => {
    const t = task({
      title: 'Courses',
      checklist: {
        id: 1,
        items: [
          { id: 1, text: 'Acheter du Café', position: 0, isChecked: true, checkedAt: null },
          { id: 2, text: 'Pain complet', position: 1, isChecked: false, checkedAt: null },
        ],
      },
    })
    expect(taskMatchesFilter(t, searchTerms('cafe'), [])).toBe(true)
    expect(taskMatchesFilter(t, searchTerms('courses pain'), [])).toBe(true)
    expect(taskMatchesFilter(t, searchTerms('beurre'), [])).toBe(false)
    expect(taskMatchesFilter(task({ checklist: null }), searchTerms('cafe'), [])).toBe(false)
  })

  test('tags en OU', () => {
    const t = task({ tags: [tag(2)] })
    expect(taskMatchesFilter(t, [], [1, 2])).toBe(true)
    expect(taskMatchesFilter(t, [], [3])).toBe(false)
    expect(taskMatchesFilter(task({ tags: undefined }), [], [1])).toBe(false)
  })

  test('texte ET tags', () => {
    const t = task({ title: 'redmine', tags: [tag(1)] })
    expect(taskMatchesFilter(t, searchTerms('redm'), [1])).toBe(true)
    expect(taskMatchesFilter(t, searchTerms('redm'), [2])).toBe(false)
    expect(taskMatchesFilter(t, searchTerms('jira'), [1])).toBe(false)
  })
})

describe('highlightParts', () => {
  test('surligne sans tenir compte de la casse ni des accents, texte conservé', () => {
    expect(highlightParts('Créer la Tâche', searchTerms('tache'))).toEqual([
      { text: 'Créer la ', match: false },
      { text: 'Tâche', match: true },
    ])
  })

  test('plusieurs mots et occurrences', () => {
    expect(highlightParts('redmine et Redmine', ['redm', 'et'])).toEqual([
      { text: 'redm', match: true },
      { text: 'ine ', match: false },
      { text: 'et', match: true },
      { text: ' ', match: false },
      { text: 'Redm', match: true },
      { text: 'ine', match: false },
    ])
  })

  test('sans mots, un seul morceau non surligné', () => {
    expect(highlightParts('Wiki', [])).toEqual([{ text: 'Wiki', match: false }])
  })
})

describe('matchExcerpt', () => {
  test('extrait centré sur le mot trouvé, Markdown retiré', () => {
    const description = `${'a'.repeat(50)} vers **Redmine** ${'b'.repeat(50)}`
    const excerpt = matchExcerpt(description, ['redmine'], 10)
    expect(excerpt).toMatch(/^….*Redmine.*…$/)
    expect(excerpt).not.toContain('**')
  })

  test('vide si le mot est absent', () => {
    expect(matchExcerpt('rien ici', ['redmine'])).toBe('')
  })
})

describe('taskMatchExcerpt', () => {
  const checklist = (...texts: string[]): Task['checklist'] => ({
    id: 1,
    items: texts.map((text, position) => ({ id: position + 1, text, position, isChecked: false, checkedAt: null })),
  })

  test('extrait de la description quand le mot y figure', () => {
    const t = task({ description: 'Voir le **wiki**', checklist: checklist('Relire le wiki') })
    expect(taskMatchExcerpt(t, ['wiki'])).toBe('Voir le wiki')
  })

  test('sinon le premier point de la checklist qui contient un mot, sans tenir compte des accents', () => {
    const t = task({
      description: 'Rien à voir',
      checklist: checklist('Pain complet', 'Acheter du Café', 'Café moulu'),
    })
    expect(taskMatchExcerpt(t, ['cafe'])).toBe('Acheter du Café')
  })

  test("extrait d'un long point centré sur le mot trouvé", () => {
    const t = task({ checklist: checklist(`${'a'.repeat(50)} vers Redmine ${'b'.repeat(50)}`) })
    expect(taskMatchExcerpt(t, ['redmine'], 10)).toMatch(/^….*Redmine.*…$/)
  })

  test('vide si le mot ne figure ni dans la description ni dans les points', () => {
    expect(taskMatchExcerpt(task({ description: 'rien', checklist: checklist('ici non plus') }), ['redmine'])).toBe('')
    expect(taskMatchExcerpt(task({ checklist: null }), ['redmine'])).toBe('')
  })
})
