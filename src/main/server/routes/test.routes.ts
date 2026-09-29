import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../prismaClient.js'
import { SEEDS_PATH } from '../../constants.js'
import { runNotificationCheck } from '../../scheduler/notificationScheduler.js'
import Logger from 'electron-log'

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * l'app tourne avec `--test`).
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les tâches, les tags et les colonnes puis rejoue les seeds
 * - POST /test/run-notifications  → déclenche un passage du planificateur de notifications
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function testRoutes(fastify) {
  /**
   * POST /test/reset
   *
   * Remet la base dans un état propre et déterministe : suppression de toutes
   * les tâches, de tous les tags puis de toutes les colonnes, et réapplication des seeds initiaux
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
      // Lecture des seeds hors transaction (accès disque synchrone)
      const seedFiles = fs.existsSync(SEEDS_PATH)
        ? fs
            .readdirSync(SEEDS_PATH)
            .filter((f) => f.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b))
        : []

      // Exécute chaque instruction des fichiers SQL individuellement
      const statements = seedFiles.flatMap((file) =>
        fs
          .readFileSync(path.join(SEEDS_PATH, file), 'utf8')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      )

      // Transaction interactive : l'adaptateur SQLite n'ouvre qu'une connexion et ne
      // sérialise que les transactions. Sans elle, les suppressions pourraient
      // s'exécuter à l'intérieur de la transaction d'une autre requête encore en
      // cours et être annulées avec elle.
      await prisma.$transaction(async (tx) => {
        // Ordre important : les tâches référencent les colonnes (clé étrangère)
        await tx.task.deleteMany()
        // Les liens tâche-tag sont déjà partis en cascade avec les tâches
        await tx.tag.deleteMany()
        await tx.stage.deleteMany()

        // Rejoue les seeds initiaux (mêmes fichiers .sql que le boot)
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement)
        }
      })

      Logger.info('Base de test réinitialisée')
      return { message: 'Base de test réinitialisée' }
    },
  )

  /**
   * POST /test/run-notifications
   *
   * Déclenche manuellement un passage du planificateur de notifications
   * (`runNotificationCheck`) pour un comportement déterministe en test, le cron
   * automatique étant désactivé en mode `--test`.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO (défaut : maintenant)
   * @returns {Promise<{count: number}>} Nombre de tâches notifiées lors du passage
   */
  fastify.post(
    '/test/run-notifications',
    {
      schema: {
        description: 'Déclenche un passage du planificateur de notifications (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { count: { type: 'integer' } },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      const now = body.now ? new Date(body.now) : new Date()
      const count = await runNotificationCheck(now)
      return { count }
    },
  )
}
