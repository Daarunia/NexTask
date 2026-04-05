import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH, SEEDS_PATH } from "./constants.js";

/**
 * Applications des seeds
 * @param db Database session
 * @param seedsPath Chemin vers les fichiers sql de seed
 */
export function applySeeds() {
  const db = new Database(DB_PATH);
  console.log(SEEDS_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS _seeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      executed BOOLEAN DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Récupérer les seeds déjà appliquées
  const appliedSeedsRows = db
    .prepare("SELECT name FROM _seeds WHERE executed = 1")
    .all();
  const appliedSeeds = new Set(appliedSeedsRows.map((r: any) => r.name));

  // Lire les fichiers SQL dans le dossier seeds
  const seedFiles = fs.existsSync(SEEDS_PATH)
    ? fs.readdirSync(SEEDS_PATH)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

  for (const file of seedFiles) {
    if (appliedSeeds.has(file)) {
      console.info(`Seed ${file} déjà appliquée`);
      continue;
    }

    const sqlPath = path.join(SEEDS_PATH, file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`Fichier seed introuvable: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf8");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _seeds(name, executed) VALUES(?, 1)").run(file);
      console.info(`Seed ${file} appliquée`);
    } catch (err) {
      console.error(`Erreur lors de la seed ${file}:`, err);
      process.exit(1);
    }
  }
}
