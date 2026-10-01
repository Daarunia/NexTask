import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../prismaClient.js'
import { SEEDS_PATH } from '../../constants.js'
import { runNotificationCheck } from '../../scheduler/notificationScheduler.js'
import { settingsStore } from '../../stores/settings.js'
import Logger from 'electron-log'

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * l'app tourne avec `--test`).
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les tâches, les tags et les colonnes puis rejoue les seeds (sans les tags par défaut),
 *                                    et remet les paramètres à leurs valeurs par défaut
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
   * Les tags par défaut sont retirés ensuite, les tests partant d'une liste de
   * tags vide, sauf si `seedTags` est demandé.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.query - Paramètres de requête
   * @param {boolean} [req.query.seedTags] - Conserve les tags par défaut (défaut : false)
   * @returns {Promise<{message: string}>} Confirmation du reset
   */
  fastify.post(
    '/test/reset',
    {
      schema: {
        description: 'Remet la base de test à zéro (tests E2E uniquement)',
        tags: ['Test'],
        // En query plutôt qu'en corps : le reset est le plus souvent appelé sans corps
        querystring: {
          type: 'object',
          properties: { seedTags: { type: 'boolean' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (req) => {
      const { seedTags } = req.query as { seedTags?: boolean }

      // Ordre important : les tâches référencent les colonnes (clé étrangère)
      await prisma.task.deleteMany()
      // Les liens tâche-tag sont déjà partis en cascade avec les tâches
      await prisma.tag.deleteMany()
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

      // Les tests partent d'une liste de tags vide, sauf demande explicite
      if (!seedTags) await prisma.tag.deleteMany()

      // Paramètres remis à leurs valeurs par défaut (fichier config.test dédié),
      // relus par le renderer au rechargement qui suit le reset
      settingsStore.clear()

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
   * @returns {Promise<{count: number, shown: boolean, style: string|null}>} Nombre de tâches notifiées, envoi ou non
   *   de la notification OS et son style (`reminder` ou `default`, null sans envoi)
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
            properties: {
              count: { type: 'integer' },
              shown: { type: 'boolean' },
              style: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      const now = body.now ? new Date(body.now) : new Date()
      return runNotificationCheck(now)
    },
  )
}
