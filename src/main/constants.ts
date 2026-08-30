import path from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'

// Identifiant applicatif Windows : conditionne le regroupement dans la barre
// des tâches et l'expéditeur des notifications. À garder aligné sur `appId`
// dans electron-builder.json.
export const APP_ID = 'com.daarunia.nextask'

// En dev ?
export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_TEST = process.argv.includes('--test')

// Chemin de base pour dev / prod
export const CURRENT_PATH = IS_DEV ? process.cwd() : app.getPath('userData')

// Nom du fichier de base selon l'environnement (test.db isolée en mode test)
let DB_FILE = 'app.db'
if (IS_TEST) {
  DB_FILE = 'test.db'
} else if (IS_DEV) {
  DB_FILE = 'dev.db'
}

// Chemin vers la base de données
export const DB_PATH = path.join(CURRENT_PATH, DB_FILE)

// Chemin vers les ressources (process.resourcesPath en prod, current en dev)
export const RESOURCES_PATH = IS_DEV ? CURRENT_PATH : process.resourcesPath

// Chemin vers les seeds
export const SEEDS_PATH = path.join(RESOURCES_PATH, IS_DEV ? 'src/main/prisma/seeds' : 'prisma/seeds')

// Chemin vers les migrations
export const MIGRATIONS_PATH = path.join(RESOURCES_PATH, IS_DEV ? 'src/main/prisma/migrations' : 'prisma/migrations')

// Emplacements possibles des assets statiques
const STATIC_DIRS = [
  path.join(process.cwd(), 'src', 'main', 'static'),
  path.join(RESOURCES_PATH, 'static'),
  path.join(app.getAppPath(), 'static'),
]

/**
 * Chemin absolu d'un asset statique, ou `undefined` s'il est introuvable.
 *
 * @param name Nom du fichier dans `src/main/static`
 */
export function staticAsset(name: string): string | undefined {
  return STATIC_DIRS.map((directory) => path.join(directory, name)).find((filePath) => existsSync(filePath))
}
