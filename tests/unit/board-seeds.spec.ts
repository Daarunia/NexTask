import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, test } from 'vitest'
import { boardKey } from '../../src/main/shared/board.helper'
import { type Locale, SUPPORTED_LOCALES } from '../../src/main/shared/settings.constants'

/**
 * Tests unitaires de la seed du tableau par défaut (Vitest, cf.
 * vitest.config.ts), sur une base SQLite en mémoire construite par les vraies
 * migrations, sans lancer l'app.
 */

const PRISMA = path.join(__dirname, '../../src/main/prisma')
const MIGRATIONS = path.join(PRISMA, 'migrations')
const SEEDS = path.join(PRISMA, 'seeds')

// Migration qui crée les tableaux et rattache les données existantes
const ADD_BOARDS = readdirSync(MIGRATIONS).find((folder) => folder.endsWith('_add_boards'))

// Nom du tableau par défaut attendu dans chaque langue
const BOARD_NAMES: Record<Locale, string> = {
  fr: 'Mon tableau',
  en: 'My board',
  es: 'Mi tablero',
  pt: 'Meu quadro',
  zh: '我的看板',
}

interface BoardRow {
  id: number
  name: string
  nameKey: string
  position: number
}

let db: Database.Database | undefined

afterEach(() => {
  db?.close()
  db = undefined
})

/**
 * Base en mémoire avec les migrations dont le dossier précède `before`
 * (toutes sans borne), clés étrangères coupées comme dans setupDatabase.ts.
 * @param before Premier dossier de migration à ne pas appliquer
 */
function migratedDatabase(before?: string): Database.Database {
  const base = new Database(':memory:')
  base.pragma('foreign_keys = OFF')
  const folders = readdirSync(MIGRATIONS)
    .filter((folder) => existsSync(path.join(MIGRATIONS, folder, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b))
  for (const folder of folders) {
    if (before && folder >= before) break
    base.exec(readFileSync(path.join(MIGRATIONS, folder, 'migration.sql'), 'utf8'))
  }
  expect(base.pragma('foreign_key_check')).toEqual([])
  return base
}

/**
 * Joue une seed d'une langue instruction par instruction, découpée sur `;`
 * comme le fait `POST /test/reset`.
 * @param base Base visée
 * @param locale Langue de la seed
 * @param name Nom du fichier de seed
 */
function runSeed(base: Database.Database, locale: Locale, name: string): void {
  const statements = readFileSync(path.join(SEEDS, locale, name), 'utf8')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
  for (const statement of statements) base.exec(statement)
}

/**
 * Tableaux de la base, par id.
 * @param base Base lue
 */
function boards(base: Database.Database): BoardRow[] {
  return base.prepare('SELECT id, name, nameKey, position FROM Board ORDER BY id').all() as BoardRow[]
}

describe('seed 00_initial_board', () => {
  test('existe dans chaque langue, après la migration des tableaux', () => {
    expect(ADD_BOARDS).toBeDefined()
    for (const locale of SUPPORTED_LOCALES) {
      expect(existsSync(path.join(SEEDS, locale, '00_initial_board.sql')), locale).toBe(true)
    }
  })

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    const name = BOARD_NAMES[locale]

    test('crée le tableau traduit sur une base neuve, puis les colonnes le rejoignent', () => {
      db = migratedDatabase()
      expect(boards(db)).toEqual([])

      runSeed(db, locale, '00_initial_board.sql')
      const [board, ...others] = boards(db)
      expect(others).toEqual([])
      expect(board).toMatchObject({ name, nameKey: boardKey(name), position: 0 })

      runSeed(db, locale, '01_initial_stages.sql')
      const stages = db.prepare('SELECT boardId FROM Stage').all() as { boardId: number }[]
      expect(stages).toHaveLength(4)
      expect(stages.every((stage) => stage.boardId === board.id)).toBe(true)
      expect(db.pragma('foreign_key_check')).toEqual([])
    })

    test('traduit « Mon tableau » créé par la migration sur une base existante', () => {
      db = migratedDatabase(ADD_BOARDS)
      db.exec(`INSERT INTO Stage (id, name, position) VALUES (7, 'Colonne', 1)`)
      db.exec(readFileSync(path.join(MIGRATIONS, ADD_BOARDS!, 'migration.sql'), 'utf8'))
      expect(boards(db)).toEqual([{ id: 1, name: 'Mon tableau', nameKey: 'mon tableau', position: 0 }])

      runSeed(db, locale, '00_initial_board.sql')
      expect(boards(db)).toEqual([{ id: 1, name, nameKey: boardKey(name), position: 0 }])
      expect(db.prepare('SELECT boardId FROM Stage WHERE id = 7').get()).toEqual({ boardId: 1 })
    })

    test("ne renomme pas « Mon tableau » s'il n'est pas seul", () => {
      db = migratedDatabase()
      db.exec(
        `INSERT INTO Board (name, nameKey, position) VALUES ('Mon tableau', 'mon tableau', 0), ('Perso', 'perso', 1)`,
      )

      runSeed(db, locale, '00_initial_board.sql')
      expect(boards(db).map((board) => board.name)).toEqual(['Mon tableau', 'Perso'])
    })
  })
})
