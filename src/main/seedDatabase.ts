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

/**
 * Seeds du dossier, dans l'ordre de leur nom. Le fichier à la racine du
 * dossier (en français) donne le nom de la seed ; sa variante du sous-dossier
 * de la langue (`en/01_initial_stages.sql`), si elle existe, donne le contenu.
 * Le nom ne dépend donc pas de la langue : une seed déjà appliquée ne l'est
 * pas une seconde fois après un changement de langue.
 *
 * @param locale Langue de l'interface au moment de l'application
 */
export function readSeedFiles(locale: Locale): SeedFile[] {
  if (!fs.existsSync(SEEDS_PATH)) return []

  return fs
    .readdirSync(SEEDS_PATH)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const translated = path.join(SEEDS_PATH, locale, name)
      const file = fs.existsSync(translated) ? translated : path.join(SEEDS_PATH, name)
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
