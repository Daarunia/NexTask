import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DB_PATH, SEEDS_PATH } from './constants.js'
import Logger from 'electron-log'

/**
 * Applications des seeds
 *
 * Chaque seed est appliquée dans sa propre transaction, avec son
 * enregistrement dans `_seeds` : une seed qui échoue ne laisse aucune ligne à
 * moitié insérée (qui serait dupliquée au lancement suivant) et l'erreur est
 * remontée à l'appelant.
 */
export function applySeeds() {
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

    // Lire les fichiers SQL dans le dossier seeds
    const seedFiles = fs.existsSync(SEEDS_PATH)
      ? fs
          .readdirSync(SEEDS_PATH)
          .filter((f) => f.endsWith('.sql'))
          .sort((a, b) => a.localeCompare(b))
      : []

    const applySeed = db.transaction((file: string, sql: string) => {
      db.exec(sql)
      db.prepare('INSERT INTO _seeds(name, executed) VALUES(?, 1)').run(file)
    })

    for (const file of seedFiles) {
      if (appliedSeeds.has(file)) {
        Logger.info(`Seed ${file} déjà appliquée`)
        continue
      }

      const sqlPath = path.join(SEEDS_PATH, file)
      if (!fs.existsSync(sqlPath)) {
        Logger.warn(`Fichier seed introuvable: ${file}`)
        continue
      }

      try {
        applySeed(file, fs.readFileSync(sqlPath, 'utf8'))
      } catch (err) {
        Logger.error(`Seed ${file} annulée :`, err)
        throw err
      }

      Logger.info(`Seed ${file} appliquée`)
    }
  } finally {
    db.close()
  }
}
