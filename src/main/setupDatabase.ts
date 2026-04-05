import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH, IS_DEV, MIGRATIONS_PATH } from "./constants.js";
import Logger from "electron-log";

/**
 * Éxécution des scripts de migrations
 */
export function setupDatabase() {
  if (IS_DEV) {
    // En dev, on ne touche pas à la DB
    Logger.info(
      "Mode dev : pas de migration automatique, utilisez `prisma migrate dev`",
    );
    return;
  }

  // Vérifier si la DB existe
  if (!fs.existsSync(DB_PATH)) {
    fs.closeSync(fs.openSync(DB_PATH, "w"));
    Logger.info("Premier lancement, DB créée :", DB_PATH);
  }

  const db = new Database(DB_PATH);

  // Créer la table _prisma_migrations si elle n'existe pas
  db.exec(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = db
    .prepare("SELECT migration_name FROM _prisma_migrations")
    .all();

  const applied = new Set(appliedRows.map((row: any) => row.migration_name));
  const folders = fs.readdirSync(MIGRATIONS_PATH);

  // Appliquer les nouvelles migrations
  for (const folder of folders) {
    if (applied.has(folder)) continue;

    const sqlPath = path.join(MIGRATIONS_PATH, folder, "migration.sql");
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      db.exec(sql);
      db.prepare(
        "INSERT INTO _prisma_migrations(migration_name) VALUES(?)",
      ).run(folder);
      Logger.info(`Migration ${folder} appliquée`);
    }
  }

  db.close();
}
