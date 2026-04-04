import path from "node:path";
import { app } from "electron";

// En dev ?
export const IS_DEV = process.env.NODE_ENV === "development";

// Chemin de base pour dev / prod
export const CURRENT_PATH = IS_DEV ? process.cwd() : app.getPath("userData");

// Chemin vers la base de données
export const DB_PATH = path.join(CURRENT_PATH, IS_DEV ? "dev.db" : "app.db");

// Chemin vers les ressources (process.resourcesPath en prod, current en dev)
export const RESOURCES_PATH = IS_DEV ? CURRENT_PATH : process.resourcesPath;

// Chemin vers les seeds
export const SEEDS_PATH = path.join(
  RESOURCES_PATH,
  IS_DEV ? "src/main/prisma/seeds" : "prisma/seeds",
);

// Chemin vers les migrations
export const MIGRATIONS_PATH = path.join(
  RESOURCES_PATH,
  IS_DEV ? "src/main/prisma/migrations" : "prisma/migrations",
);
