import fs from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import Logger from '../core/logger.js'
import { config, initCore } from '../core/config.js'
import { setSettingsProvider } from '../core/settings.js'
import { setLocaleProvider } from '../core/i18n.js'
import { setupDatabase } from '../core/database/setupDatabase.js'
import { applySeeds } from '../core/database/seedDatabase.js'
import { acquireLock, findForeignLock } from '../core/database/lock.js'
import { dataSettings, loadDataSettings } from '../core/database/serverSettings.js'
import { buildServer, type BuildOptions } from '../core/server/index.js'
import settingsRoutes from '../core/server/routes/settings.routes.js'
import type { Locale } from '../core/shared/settings.constants.js'
import { createTokenCheck, PUBLIC_PATHS, requestPath } from './auth.js'
import { localeFromAcceptLanguage, type ServerEnv } from './env.js'

/**
 * Branchement de core pour le serveur autonome, sans Electron : configuration
 * tirée de l'environnement, réglages en base, langue par requête, jeton.
 *
 * Séparé de main.ts (process, signaux, écoute) pour que les tests construisent
 * le même serveur et l'interrogent par `inject()`.
 */

// Racine du dépôt (ou de /app dans l'image) : ce fichier est dans src/server ou build/server
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Nom du fichier de la base dans le dossier des données. */
export const DATABASE_FILE_NAME = 'nextask.db'

// Langue de la requête en cours, lue par le fournisseur de langue de core
const requestLocale = new AsyncLocalStorage<Locale>()

/** Version du serveur, celle du package.json de l'app. */
function readAppVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }
  return pkg.version
}

/**
 * Initialise core pour le serveur : chemins dans le dossier des données,
 * réglages lus en base (une fois chargés), langue de la requête en cours.
 *
 * @param env Configuration du serveur
 */
export function initServerCore(env: ServerEnv): void {
  const prisma = path.join(ROOT, 'src', 'core', 'prisma')

  initCore({
    appVersion: readAppVersion(),
    isDev: false,
    isTest: false,
    dbPath: path.join(env.dataDir, DATABASE_FILE_NAME),
    isCustomDb: false,
    backupsPath: path.join(env.dataDir, 'backups'),
    migrationsPath: path.join(prisma, 'migrations'),
    seedsPath: path.join(prisma, 'seeds'),
  })

  // Pas de dernier tableau côté serveur : chaque client a le sien (phase 3),
  // l'ajout rapide se replie sur le premier tableau
  setSettingsProvider(() => ({ ...dataSettings(), lastBoardId: null }))

  // Langue de la requête (Accept-Language), sinon celle du serveur (seeds, schedulers)
  setLocaleProvider(() => requestLocale.getStore() ?? env.locale)
}

/**
 * Prépare la base : dossier des données, verrou, migrations, seeds dans la
 * langue du serveur, réglages chargés.
 *
 * Un verrou d'un autre process est seulement signalé : le nom d'hôte changeant
 * à chaque conteneur, il bloquerait chaque redémarrage de l'image.
 *
 * @param env Configuration du serveur
 */
export async function prepareDatabase(env: ServerEnv): Promise<void> {
  const { dbPath } = config()
  fs.mkdirSync(env.dataDir, { recursive: true })

  const lock = findForeignLock(dbPath)
  if (lock) {
    Logger.warn(`[base] Verrou d'un autre process repris (${lock.hostname}, pid ${lock.pid}, ${lock.openedAt})`)
  }
  acquireLock(dbPath)

  setupDatabase()
  applySeeds(env.locale)
  await loadDataSettings()
  Logger.info(`[base] Base prête : ${dbPath}`)
}

/**
 * Options de construction du serveur Fastify : origines web autorisées, routes
 * des réglages, puis jeton et langue vérifiés avant toute route.
 *
 * @param env Configuration du serveur
 */
export function serverBuildOptions(env: ServerEnv): BuildOptions {
  const isAuthorized = createTokenCheck(env.token)

  return {
    corsOrigins: env.corsOrigins,
    plugins: [settingsRoutes],
    setup: (fastify: FastifyInstance) => {
      // Sonde de santé, sans jeton
      fastify.get('/health', async () => ({ status: 'ok', version: config().appVersion }))

      // Jeton exigé partout ailleurs ; les requêtes préalables CORS (OPTIONS)
      // passent, le navigateur n'y joignant jamais d'en-tête Authorization
      fastify.addHook('onRequest', async (req, reply) => {
        if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(requestPath(req.url))) return
        if (!isAuthorized(req.headers.authorization)) {
          return reply.code(401).send({ error: 'Jeton absent ou invalide' })
        }
      })

      // Langue de la requête, vue par toute la suite de son traitement
      fastify.addHook('onRequest', (req, _reply, done) => {
        requestLocale.run(localeFromAcceptLanguage(req.headers['accept-language']) ?? env.locale, done)
      })
    },
  }
}

/**
 * Construit le serveur complet, base prête, sans le mettre à l'écoute.
 *
 * @param env Configuration du serveur
 */
export async function createServerApp(env: ServerEnv): Promise<FastifyInstance> {
  initServerCore(env)
  await prepareDatabase(env)
  return buildServer(serverBuildOptions(env))
}
