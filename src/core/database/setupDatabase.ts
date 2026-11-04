import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { IS_DEV, IS_TEST, MIGRATIONS_PATH } from './constants.js'
import { DB_PATH, IS_CUSTOM_DB } from './database/location.js'
import Logger from 'electron-log'

/**
 * Migrations connues de cette version de l'app, dans l'ordre d'application.
 * readdirSync ne garantit pas l'ordre : les dossiers étant préfixés par leur
 * horodatage, le tri alphabétique donne l'ordre chronologique.
 */
export function knownMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_PATH)
    .filter((folder) => fs.existsSync(path.join(MIGRATIONS_PATH, folder, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Éxécution des scripts de migrations
 */
export function setupDatabase() {
  // En dev, on ne touche pas à dev.db, migrée par `prisma migrate dev`. Une base
  // choisie par l'utilisateur est migrée comme en prod, sinon l'app l'ouvrirait
  // dans un schéma qui ne correspond pas au code
  if (IS_DEV && !IS_TEST && !IS_CUSTOM_DB) {
    Logger.info('Mode dev : pas de migration automatique, utilisez `prisma migrate dev`')
    return
  }

  // Premier lancement : base créée à l'emplacement par défaut. Une base choisie
  // par l'utilisateur n'est jamais recréée vide (cf. ensureDatabaseAvailable)
  if (!fs.existsSync(DB_PATH)) {
    if (IS_CUSTOM_DB) throw new Error(`Base introuvable : ${DB_PATH}`)
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

    const folders = knownMigrations()

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
