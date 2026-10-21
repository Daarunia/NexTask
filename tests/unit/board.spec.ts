import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { boardKey } from '../../src/main/shared/board.helper'
import { DEFAULT_STAGE_KEYS } from '../../src/main/server/helpers/board.helper'
import { MAIN_CATALOGS } from '../../src/main/locales'
import { SUPPORTED_LOCALES } from '../../src/main/shared/settings.constants'

/**
 * Tests unitaires des règles des tableaux (Vitest, cf. vitest.config.ts),
 * sans lancer l'app. Normalisation des noms, et colonnes d'un nouveau
 * tableau en mode `default` identiques à celles d'une base neuve.
 */

const SEEDS = path.join(__dirname, '../../src/main/prisma/seeds')

/**
 * Noms des colonnes de la seed 01_initial_stages.sql d'une langue, dans
 * l'ordre de leur position.
 * @param locale Langue de la seed
 */
function seededStageNames(locale: string): string[] {
  const sql = readFileSync(path.join(SEEDS, locale, '01_initial_stages.sql'), 'utf8')
  return [...sql.matchAll(/VALUES \('([^']*)', (\d+),/g)]
    .map((match) => ({ name: match[1], position: Number(match[2]) }))
    .sort((a, b) => a.position - b.position)
    .map((stage) => stage.name)
}

describe('boardKey', () => {
  test('ignore la casse, comme les tags et les modèles de checklist', () => {
    expect(boardKey('Mon Tableau')).toBe('mon tableau')
    expect(boardKey('MON TABLEAU')).toBe(boardKey('mon tableau'))
    expect(boardKey('Équipe')).toBe('équipe')
  })

  test('ne nettoie pas les espaces, le nom arrive déjà nettoyé', () => {
    expect(boardKey(' Perso ')).toBe(' perso ')
  })
})

describe('colonnes par défaut d’un nouveau tableau', () => {
  test('quatre clés, dans l’ordre de la seed', () => {
    expect(DEFAULT_STAGE_KEYS).toEqual(['todo', 'inProgress', 'waiting', 'done'])
  })

  test.each(SUPPORTED_LOCALES)('%s : mêmes noms que la seed 01_initial_stages.sql', (locale) => {
    const names = DEFAULT_STAGE_KEYS.map((key) => MAIN_CATALOGS[locale].boards.defaultStages[key])
    expect(seededStageNames(locale)).toHaveLength(DEFAULT_STAGE_KEYS.length)
    expect(names).toEqual(seededStageNames(locale))
  })
})
