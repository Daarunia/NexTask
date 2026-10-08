import { describe, expect, test } from 'vitest'
import { descriptionExcerpt, hasDescription } from '../../src/renderer/utils/description.helper'

/**
 * Tests unitaires de l'indicateur de description des cartes (`hasDescription`)
 * et de son extrait au survol (`descriptionExcerpt`), sans lancer l'app ni de
 * navigateur (Vitest, cf. vitest.config.ts).
 */

describe('hasDescription', () => {
  test.each([
    ['', false],
    ['   \n  ', false],
    [null, false],
    [undefined, false],
    ['Texte', true],
  ])('%j → %s', (description, expected) => {
    expect(hasDescription(description)).toBe(expected)
  })
})

describe('descriptionExcerpt', () => {
  test('retire la syntaxe Markdown courante', () => {
    const source =
      '## Étapes\n\n- **Préparer** le *dossier*\n1. Lancer `npm test`\n> Voir [la doc](https://example.com)'

    expect(descriptionExcerpt(source)).toBe('Étapes\n• Préparer le dossier\n• Lancer npm test\nVoir la doc')
  })

  test('garde le contenu des blocs de code, sans les clôtures', () => {
    expect(descriptionExcerpt('```ts\nconst x = 1\n```')).toBe('const x = 1')
  })

  test('laisse intacts les mots avec un tiret bas', () => {
    expect(descriptionExcerpt('Renommer user_id')).toBe('Renommer user_id')
  })

  test('coupe un texte trop long avec des points de suspension', () => {
    expect(descriptionExcerpt('abcdef ghij', 7)).toBe('abcdef…')
  })
})
