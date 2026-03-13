import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";

// chemin vers la DB
const isDev = process.env.NODE_ENV === "development";
const dbPath = isDev
    ? path.join(process.cwd(), "dev.db")
    : path.join(app.getPath("userData"), "app.db");

// chemin vers tes migrations SQL
const migrationsPath = path.join(process.resourcesPath, "prisma", "migrations");

export function setupDatabase() {
    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
        // En dev, on ne touche pas à la DB : tu utilises déjà prisma migrate dev
        console.log("Mode dev : pas de migration automatique, utilisez `prisma migrate dev`");
        return;
    }

    // Vérifier si la DB existe
    if (!fs.existsSync(dbPath)) {
        fs.closeSync(fs.openSync(dbPath, "w")); // crée un fichier vide
        console.log("Premier lancement, DB créée :", dbPath);
    }

    const db = new Database(dbPath);

    // Créer la table _prisma_migrations si elle n'existe pas
    db.exec(`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // Appliquer les nouvelles migrations
    const appliedRows = db
        .prepare("SELECT migration_name FROM _prisma_migrations")
        .all();

    const applied = new Set(appliedRows.map((row: any) => row.migration_name));

    // Appliquer les nouvelles migrations
    const folders = fs.readdirSync(migrationsPath);

    // Appliquer les nouvelles migrations
    for (const folder of folders) {
        if (applied.has(folder)) continue; // déjà appliquée

        const sqlPath = path.join(migrationsPath, folder, "migration.sql");
        if (fs.existsSync(sqlPath)) {
            const sql = fs.readFileSync(sqlPath, "utf8");
            db.exec(sql); // exécute le SQL
            db.prepare("INSERT INTO _prisma_migrations(migration_name) VALUES(?)").run(folder);
            console.log(`Migration ${folder} appliquée`);
        }
    }

    db.close();
}