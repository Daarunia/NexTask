import { describe, expect, test } from 'vitest'
import { duplicateName, templateItemRows, templateKey } from '../../src/main/server/helpers/checklist.helper'
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
