import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { app } from 'electron'
import { DEV_API_PORT, testApiPort } from './shared/api.constants.js'
import { TEST_INDEX_ARG, testFileSuffix } from './shared/test.constants.js'

// Identifiant applicatif Windows : conditionne le regroupement dans la barre
// des tâches et l'expéditeur des notifications. À garder aligné sur `appId`
// dans electron-builder.json.
export const APP_ID = 'com.daarunia.nextask'

// En dev ?
export const IS_DEV = process.env.NODE_ENV === 'development'
export const IS_TEST = process.argv.includes('--test')

// Index du worker Playwright qui a lancé l'app (`--test-index=N`, 0 par défaut) :
// les instances de test lancées en parallèle ont chacune leurs fichiers, leur
// port et leur place à l'écran, cf. test.constants.ts
const testIndexArg = process.argv.find((arg) => arg.startsWith(TEST_INDEX_ARG))
export const TEST_INDEX = testIndexArg ? Number(testIndexArg.slice(TEST_INDEX_ARG.length)) : 0
const TEST_SUFFIX = testFileSuffix(TEST_INDEX)

// Version de l'app.
export const APP_VERSION: string = app.isPackaged
  ? app.getVersion()
  : JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version

// Chemin de base pour dev / prod
export const CURRENT_PATH = IS_DEV ? process.cwd() : app.getPath('userData')

// Nom du fichier de base selon l'environnement (test.db isolée en mode test)
let DB_FILE = 'app.db'
if (IS_TEST) {
  DB_FILE = `test${TEST_SUFFIX}.db`
} else if (IS_DEV) {
  DB_FILE = 'dev.db'
}

// Dossier des données de l'app : base, sauvegardes (userData en prod, racine
// du projet en dev et en test)
export const DATA_PATH = CURRENT_PATH

// Chemin vers la base de données
export const DB_PATH = path.join(DATA_PATH, DB_FILE)

// Sauvegardes automatiques de la base, dans un dossier à part en test pour ne
// jamais toucher à celles du dev (le reset de test le vide)
export const BACKUPS_PATH = path.join(DATA_PATH, IS_TEST ? `backups-test${TEST_SUFFIX}` : 'backups')

// Nom du fichier de paramètres (electron-store, dans userData), isolé comme la
// base en test et en dev pour ne jamais toucher aux paramètres réels
let SETTINGS_NAME = 'config'
if (IS_TEST) {
  SETTINGS_NAME = `config.test${TEST_SUFFIX}`
} else if (IS_DEV) {
  SETTINGS_NAME = 'config.dev'
}
export const SETTINGS_FILE = SETTINGS_NAME

// Port du serveur Fastify : fixe en test et en dev, libre (0, choisi par le
// système) en prod, cf. api.constants.ts
let SERVER_PORT = 0
if (IS_TEST) {
  SERVER_PORT = testApiPort(TEST_INDEX)
} else if (IS_DEV) {
  SERVER_PORT = DEV_API_PORT
}
export const API_PORT = SERVER_PORT

// Renderer chargé depuis un serveur en dev (Vite) et en test (serveur statique des
// tests), sur le port passé par le script de lancement. Null en prod, le renderer
// étant chargé en file://.
export const DEV_RENDERER_URL = IS_DEV ? `http://localhost:${process.argv[2]}` : null

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
