import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../prismaClient.js'
import { SEEDS_PATH } from '../../constants.js'
import Logger from 'electron-log'

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * l'app tourne avec `--test`).
 *
 * Fournit un endpoint de remise à zéro de la base pour isoler chaque test :
 * - POST /test/reset → vide les tâches et les colonnes puis rejoue les seeds
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function testRoutes(fastify) {
  /**
   * POST /test/reset
   *
   * Remet la base dans un état propre et déterministe : suppression de toutes
   * les tâches puis de toutes les colonnes, et réapplication des seeds initiaux
   * (source unique de vérité : les fichiers .sql du dossier seeds).
   *
   * @returns {Promise<{message: string}>} Confirmation du reset
   */
  fastify.post(
    '/test/reset',
    {
      schema: {
        description: 'Remet la base de test à zéro (tests E2E uniquement)',
        tags: ['Test'],
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async () => {
      // Ordre important : les tâches référencent les colonnes (clé étrangère)
      await prisma.task.deleteMany()
      await prisma.stage.deleteMany()

      // Rejoue les seeds initiaux (mêmes fichiers .sql que le boot)
      const seedFiles = fs.existsSync(SEEDS_PATH)
        ? fs
            .readdirSync(SEEDS_PATH)
            .filter((f) => f.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b))
        : []

      for (const file of seedFiles) {
        const sql = fs.readFileSync(path.join(SEEDS_PATH, file), 'utf8')
        // Exécute chaque instruction du fichier SQL individuellement
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        for (const statement of statements) {
          await prisma.$executeRawUnsafe(statement)
        }
      }

      Logger.info('Base de test réinitialisée')
      return { message: 'Base de test réinitialisée' }
    },
  )
}
