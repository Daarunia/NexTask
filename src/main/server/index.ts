import Fastify, { type FastifyInstance } from 'fastify'
import taskRoutes from './routes/task.routes.js'
import stageRoutes from './routes/stage.routes.js'
import tagRoutes from './routes/tag.routes.js'
import recurrenceRoutes from './routes/recurrence.routes.js'
import dataRoutes from './routes/data.routes.js'
import testRoutes from './routes/test.routes.js'
import fastifyCors from '@fastify/cors'
import { applyDatabasePragmas } from './prismaClient.js'
import type { AddressInfo } from 'node:net'
import { API_PORT, APP_VERSION, DEV_RENDERER_URL, IS_DEV, IS_TEST, staticAsset } from '../constants.js'
import Logger from 'electron-log'
import { readFileSync } from 'node:fs'

/**
 * Lit un asset de la marque, en tolérant son absence (build de développement
 * sans copie des fichiers statiques).
 *
 * @param name Nom du fichier dans `src/main/static`
 * @returns Contenu du fichier, ou `null`
 */
function readBrandAsset(name: string): Buffer | null {
  const filePath = staticAsset(name)
  return filePath ? readFileSync(filePath) : null
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
        version: APP_VERSION,
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

/**
 * Démarre le serveur Fastify sur le port de l'environnement (cf. API_PORT).
 *
 * @throws Si le serveur n'a pas pu démarrer (port déjà pris en dev ou en test)
 */
export async function startServer() {
  const fastify = Fastify({ logger: IS_DEV ? true : { level: 'error' } })

  // Pragmas SQLite (WAL, etc.) avant de servir les premières requêtes.
  await applyDatabasePragmas()

  // Enregistrer le plugin CORS
  //
  // Origine restreinte au renderer de l'app (pas d'en-tête Origin en prod,
  // le renderer étant chargé en file://; serveur Vite en dev) afin qu'une page
  // web tierce ne puisse pas interroger l'API locale.
  const allowedOrigins = new Set(DEV_RENDERER_URL ? [DEV_RENDERER_URL] : [])
  fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // Documentation de l'API, en dev seulement : en prod le port est choisi par
  // le système, la page n'est donc pas joignable et ses dépendances ne sont pas
  // embarquées dans l'app
  if (IS_DEV) {
    await registerApiDocs(fastify)
  }

  // Routes
  await fastify.register(taskRoutes)
  await fastify.register(stageRoutes)
  await fastify.register(tagRoutes)
  await fastify.register(recurrenceRoutes)
  await fastify.register(dataRoutes)

  // Route de reset réservée aux tests E2E
  if (IS_TEST) {
    await fastify.register(testRoutes)
  }

  try {
    await fastify.listen({ port: API_PORT })
    const { port } = fastify.server.address() as AddressInfo
    apiUrl = `http://localhost:${port}`
    Logger.info(`Fastify API -> ${apiUrl}`)
    if (IS_DEV) Logger.info(`Swagger UI -> ${apiUrl}/docs`)
  } catch (err) {
    fastify.log.error(err)
    throw err
  }
}
