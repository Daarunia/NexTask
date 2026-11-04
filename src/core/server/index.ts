import Fastify, { type FastifyInstance } from 'fastify'
import taskRoutes from './routes/task.routes.js'
import stageRoutes from './routes/stage.routes.js'
import boardRoutes from './routes/board.routes.js'
import tagRoutes from './routes/tag.routes.js'
import checklistTemplateRoutes from './routes/checklistTemplate.routes.js'
import recurrenceRoutes from './routes/recurrence.routes.js'
import dataRoutes from './routes/data.routes.js'
import testRoutes from './routes/test.routes.js'
import fastifyCors from '@fastify/cors'
import { applyDatabasePragmas } from './prismaClient.js'
import type { AddressInfo } from 'node:net'
import { config } from '../config.js'
import Logger from '../logger.js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Lit un asset de la marque, en tolérant son absence (build de développement
 * sans copie des fichiers statiques).
 *
 * @param name Nom du fichier dans le dossier des assets (cf. CoreConfig.staticDir)
 * @returns Contenu du fichier, ou `null`
 */
function readBrandAsset(name: string): Buffer | null {
  const { staticDir } = config()
  const filePath = staticDir ? path.join(staticDir, name) : null
  return filePath && existsSync(filePath) ? readFileSync(filePath) : null
}

/**
 * Enregistre Swagger et sa page de documentation sur `/docs`. Plugins chargés
 * dynamiquement, ce sont des dépendances de dev absentes de l'app packagée.
 */
async function registerApiDocs(fastify: FastifyInstance) {
  const { default: swagger } = await import('@fastify/swagger')
  const { default: swaggerUI } = await import('@fastify/swagger-ui')

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'NexTask API',
        description: 'API pour gérer les tâches',
        version: config().appVersion,
      },
    },
  })

  // Marque appliquée à la documentation (onglet + bandeau).
  const logo = readBrandAsset('icon.svg')
  const favicons = [
    { name: 'favicon-32.png', sizes: '32x32' },
    { name: 'favicon-16.png', sizes: '16x16' },
  ]
    .map(({ name, sizes }) => ({ name, sizes, content: readBrandAsset(name) }))
    .filter((icon): icon is { name: string; sizes: string; content: Buffer } => icon.content !== null)
    .map(({ name, sizes, content }) => ({ filename: name, rel: 'icon', type: 'image/png', sizes, content }))

  // ---- point d'accés Swagger ----
  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    theme: {
      title: 'NexTask — API',
      favicon: favicons,
    },
    ...(logo ? { logo: { type: 'image/svg+xml', content: logo, href: '/docs' } } : {}),
    staticCSP: true,
    transformStaticCSP: (header) => header,
  })
}

// URL du serveur une fois à l'écoute (port choisi par le système en prod)
let apiUrl: string | null = null

/** Vrai une fois le serveur à l'écoute. */
export function isServerStarted(): boolean {
  return apiUrl !== null
}

/**
 * URL du serveur Fastify, pour les appels faits depuis le main et pour le
 * renderer (transmise par le preload).
 *
 * @throws Si le serveur n'a pas encore démarré
 */
export function getApiUrl(): string {
  if (!apiUrl) throw new Error('Serveur Fastify pas encore démarré')
  return apiUrl
}

/** Options d'écoute du serveur, propres à celui qui le démarre. */
export interface ServerOptions {
  /** Port d'écoute, 0 pour un port choisi par le système. */
  port: number
  /** Origines autorisées à appeler l'API, en plus des requêtes sans en-tête Origin. */
  corsOrigins: string[]
}

/**
 * Démarre le serveur Fastify.
 *
 * @param options Port d'écoute et origines autorisées
 * @throws Si le serveur n'a pas pu démarrer (port déjà pris en dev ou en test)
 */
export async function startServer({ port, corsOrigins }: ServerOptions) {
  const { isDev, isTest } = config()
  const fastify = Fastify({ logger: isDev ? true : { level: 'error' } })

  // Pragmas SQLite (WAL, etc.) avant de servir les premières requêtes.
  await applyDatabasePragmas()

  // Enregistrer le plugin CORS
  //
  // Origine restreinte aux clients connus (pour le desktop : pas d'en-tête
  // Origin en prod, le renderer étant chargé en file://; serveur Vite en dev)
  // afin qu'une page web tierce ne puisse pas interroger l'API locale.
  const allowedOrigins = new Set(corsOrigins)
  fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // Documentation de l'API, en dev seulement : en prod le port est choisi par
  // le système, la page n'est donc pas joignable et ses dépendances ne sont pas
  // embarquées dans l'app
  if (isDev) {
    await registerApiDocs(fastify)
  }

  // Routes
  await fastify.register(taskRoutes)
  await fastify.register(stageRoutes)
  await fastify.register(boardRoutes)
  await fastify.register(tagRoutes)
  await fastify.register(checklistTemplateRoutes)
  await fastify.register(recurrenceRoutes)
  await fastify.register(dataRoutes)

  // Route de reset réservée aux tests E2E
  if (isTest) {
    await fastify.register(testRoutes)
  }

  try {
    await fastify.listen({ port })
    const address = fastify.server.address() as AddressInfo
    apiUrl = `http://localhost:${address.port}`
    Logger.info(`Fastify API -> ${apiUrl}`)
    if (isDev) Logger.info(`Swagger UI -> ${apiUrl}/docs`)
  } catch (err) {
    fastify.log.error(err)
    throw err
  }
}
