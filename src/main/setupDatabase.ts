import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DB_PATH, IS_DEV, IS_TEST, MIGRATIONS_PATH } from './constants.js'
import Logger from 'electron-log'

/**
 * Éxécution des scripts de migrations
 */
export function setupDatabase() {
  if (IS_DEV && !IS_TEST) {
    // En dev, on ne touche pas à la DB
    Logger.info('Mode dev : pas de migration automatique, utilisez `prisma migrate dev`')
    return
  }

  // Vérifier si la DB existe
  if (!fs.existsSync(DB_PATH)) {
    fs.closeSync(fs.openSync(DB_PATH, 'w'))
    Logger.info('Premier lancement, DB créée :', DB_PATH)
  }

  const db = new Database(DB_PATH)

  try {
    // Créer la table _prisma_migrations si elle n'existe pas
    db.exec(`
      CREATE TABLE IF NOT EXISTS _prisma_migrations (
        migration_name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    const appliedRows = db.prepare('SELECT migration_name FROM _prisma_migrations').all()
    const applied = new Set(appliedRows.map((row: any) => row.migration_name))

    // readdirSync ne garantit pas l'ordre : les dossiers étant préfixés par leur
    // horodatage, le tri alphabétique donne l'ordre chronologique
    const folders = fs.readdirSync(MIGRATIONS_PATH).sort((a, b) => a.localeCompare(b))

    // Clés étrangères coupées le temps des migrations, hors transaction comme le
    // demande SQLite : le PRAGMA foreign_keys=OFF des reconstructions de table
    // Prisma est ignoré une fois la transaction ouverte. L'intégrité est
    // revérifiée avant chaque commit.
    db.pragma('foreign_keys = OFF')

    const applyMigration = db.transaction((folder: string, sql: string) => {
      db.exec(sql)

      const violations = db.pragma('foreign_key_check') as unknown[]
      if (violations.length) {
        throw new Error(`${violations.length} violation(s) de clé étrangère après la migration ${folder}`)
      }

      db.prepare('INSERT INTO _prisma_migrations(migration_name) VALUES(?)').run(folder)
    })

    // Appliquer les nouvelles migrations
    for (const folder of folders) {
      if (applied.has(folder)) continue

      const sqlPath = path.join(MIGRATIONS_PATH, folder, 'migration.sql')
      if (!fs.existsSync(sqlPath)) continue

      try {
        applyMigration(folder, fs.readFileSync(sqlPath, 'utf8'))
      } catch (err) {
        Logger.error(`Migration ${folder} annulée, base laissée à la version précédente :`, err)
        throw err
      }

      Logger.info(`Migration ${folder} appliquée`)
    }
  } finally {
    db.close()
  }
}
