import Fastify from 'fastify'
import taskRoutes from './routes/task.routes.js'
import stageRoutes from './routes/stage.routes.js'
import testRoutes from './routes/test.routes.js'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import fastifyCors from '@fastify/cors'
import { applyDatabasePragmas } from './prismaClient.js'
import { IS_DEV, IS_TEST, staticAsset } from '../constants.js'
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

export async function startServer() {
  const fastify = Fastify({ logger: IS_DEV ? true : { level: 'error' } })

  // Pragmas SQLite (WAL, etc.) avant de servir les premières requêtes.
  await applyDatabasePragmas()

  // Enregistrer le plugin CORS
  fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // ---- Swagger ----
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'NexTask API',
        description: 'API pour gérer les tâches',
        version: '1.0.2',
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

  // Routes
  await fastify.register(taskRoutes)
  await fastify.register(stageRoutes)

  // Route de reset réservée aux tests E2E
  if (IS_TEST) {
    await fastify.register(testRoutes)
  }

  try {
    await fastify.listen({ port: 3000 })
    Logger.info('Fastify API -> http://localhost:3000')
    Logger.info('Swagger UI -> http://localhost:3000/docs')
  } catch (err) {
    fastify.log.error(err)
    throw err
  }
}
