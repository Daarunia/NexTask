import { describe, expect, test } from 'vitest'
import { resolveLocale, systemLocale } from '../../src/main/shared/locale.helper'

/**
 * Tests unitaires de la résolution de la langue de l'interface (choix de
 * l'utilisateur et langues préférées de l'OS).
 */

describe('systemLocale', () => {
  test.each([
    [['fr-FR'], 'fr'],
    [['fr-CA', 'en-US'], 'fr'],
    [['en-US', 'fr-FR'], 'en'],
    [['en-GB'], 'en'],
    [['de-DE', 'fr-FR'], 'fr'],
    [['FR_be'], 'fr'],
    [['de-DE', 'ja-JP'], 'en'],
    [[], 'en'],
  ])('%j → %s', (languages, expected) => {
    expect(systemLocale(languages)).toBe(expected)
  })
})

describe('resolveLocale', () => {
  test('un choix explicite ignore la langue de l’OS', () => {
    expect(resolveLocale('fr', ['en-US'])).toBe('fr')
    expect(resolveLocale('en', ['fr-FR'])).toBe('en')
  })

  test('le choix « système » suit la langue de l’OS', () => {
    expect(resolveLocale('system', ['fr-FR'])).toBe('fr')
    expect(resolveLocale('system', ['es-ES'])).toBe('en')
  })
})
