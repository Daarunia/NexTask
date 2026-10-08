import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DB_PATH, SEEDS_PATH } from './constants.js'
import type { Locale } from './shared/settings.constants.js'
import Logger from 'electron-log'

/** Seed à appliquer : nom enregistré dans `_seeds` et instructions SQL. */
export interface SeedFile {
  name: string
  sql: string
}

// Langue de référence des seeds : son dossier fixe la liste et le nom des seeds
const REFERENCE_LOCALE: Locale = 'fr'

/**
 * Seeds à appliquer, dans l'ordre de leur nom. Chaque langue a son dossier
 * (`fr/01_initial_stages.sql`, `en/01_initial_stages.sql`…) ; celui du
 * français donne la liste et le nom des seeds, le dossier de la langue donne
 * le contenu, le français à défaut. Le nom enregistré dans `_seeds` ne dépend
 * donc pas de la langue : une seed déjà appliquée ne l'est pas une seconde fois
 * après un changement de langue.
 *
 * @param locale Langue de l'interface au moment de l'application
 */
export function readSeedFiles(locale: Locale): SeedFile[] {
  const referenceDir = path.join(SEEDS_PATH, REFERENCE_LOCALE)
  if (!fs.existsSync(referenceDir)) return []

  return fs
    .readdirSync(referenceDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const translated = path.join(SEEDS_PATH, locale, name)
      const file = fs.existsSync(translated) ? translated : path.join(referenceDir, name)
      return { name, sql: fs.readFileSync(file, 'utf8') }
    })
}

/**
 * Applications des seeds
 *
 * Chaque seed est appliquée dans sa propre transaction, avec son
 * enregistrement dans `_seeds` : une seed qui échoue ne laisse aucune ligne à
 * moitié insérée (qui serait dupliquée au lancement suivant) et l'erreur est
 * remontée à l'appelant.
 *
 * @param locale Langue de l'interface, qui choisit la variante des seeds traduites
 */
export function applySeeds(locale: Locale) {
  const db = new Database(DB_PATH)

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _seeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        executed BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Récupérer les seeds déjà appliquées
    const appliedSeedsRows = db.prepare('SELECT name FROM _seeds WHERE executed = 1').all()
    const appliedSeeds = new Set(appliedSeedsRows.map((r: any) => r.name))

    const applySeed = db.transaction((file: string, sql: string) => {
      db.exec(sql)
      db.prepare('INSERT INTO _seeds(name, executed) VALUES(?, 1)').run(file)
    })

    for (const { name, sql } of readSeedFiles(locale)) {
      if (appliedSeeds.has(name)) {
        Logger.info(`Seed ${name} déjà appliquée`)
        continue
      }

      try {
        applySeed(name, sql)
      } catch (err) {
        Logger.error(`Seed ${name} annulée :`, err)
        throw err
      }

      Logger.info(`Seed ${name} appliquée (${locale})`)
    }
  } finally {
    db.close()
  }
}
