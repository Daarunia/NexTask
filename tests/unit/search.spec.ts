import { describe, expect, test } from 'vitest'
import {
  highlightParts,
  matchExcerpt,
  normalizeSearchText,
  searchTerms,
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
