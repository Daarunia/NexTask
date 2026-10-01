import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../prismaClient.js'
import { BACKUPS_PATH, SEEDS_PATH } from '../../constants.js'
import { runNotificationCheck } from '../../scheduler/notificationScheduler.js'
import { runArchivePurge } from '../../scheduler/archivePurge.js'
import { runDatabaseBackup } from '../../scheduler/databaseBackup.js'
import { clearOpenedFolders, FOLDER_KINDS, getOpenedFolders } from '../../system/folders.js'
import { settingsStore } from '../../stores/settings.js'
import Logger from 'electron-log'

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * l'app tourne avec `--test`).
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les tâches, les tags et les colonnes puis rejoue les seeds (sans les tags par défaut),
 *                                    remet les paramètres à leurs valeurs par défaut, vide le dossier des sauvegardes
 *                                    et oublie les dossiers ouverts
 * - POST /test/run-notifications  → déclenche un passage du planificateur de notifications
 * - POST /test/run-archive-purge  → déclenche un passage de la purge des tâches archivées
 * - POST /test/run-backup         → déclenche un passage de la sauvegarde automatique de la base
 * - GET  /test/opened-folders     → dossiers dont l'ouverture a été demandée (simulée en test)
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

      // Sauvegardes des tests précédents retirées (dossier propre au mode test)
      fs.rmSync(BACKUPS_PATH, { recursive: true, force: true })

      // Ouvertures de dossiers des tests précédents oubliées
      clearOpenedFolders()

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

  /**
   * POST /test/run-archive-purge
   *
   * Déclenche manuellement un passage de la purge des tâches archivées
   * (`runArchivePurge`), la maintenance quotidienne étant désactivée en mode
   * `--test`.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO (défaut : maintenant)
   * @returns {Promise<{enabled: boolean, count: number}>} Purge activée ou non, nombre de tâches supprimées
   */
  fastify.post(
    '/test/run-archive-purge',
    {
      schema: {
        description: 'Déclenche un passage de la purge des tâches archivées (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              count: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      const now = body.now ? new Date(body.now) : new Date()
      return runArchivePurge(now)
    },
  )

  /**
   * POST /test/run-backup
   *
   * Déclenche manuellement un passage de la sauvegarde automatique de la base
   * (`runDatabaseBackup`), la maintenance quotidienne étant désactivée en mode
   * `--test`.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO, qui date la sauvegarde (défaut : maintenant)
   * @returns {Promise<{enabled: boolean, created: string|null, backups: string[], directory: string}>}
   *   Sauvegarde activée ou non, fichier écrit par ce passage, sauvegardes présentes (de la plus
   *   récente à la plus ancienne) et dossier des sauvegardes
   */
  fastify.post(
    '/test/run-backup',
    {
      schema: {
        description: 'Déclenche un passage de la sauvegarde automatique de la base (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              created: { type: ['string', 'null'] },
              backups: { type: 'array', items: { type: 'string' } },
              directory: { type: 'string' },
            },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      const now = body.now ? new Date(body.now) : new Date()
      return runDatabaseBackup(now)
    },
  )

  /**
   * GET /test/opened-folders
   *
   * Dossiers dont l'ouverture a été demandée depuis le dernier reset, dans
   * l'ordre. En mode test, l'IPC `folders:open` ne fait que les noter, sans
   * ouvrir l'explorateur de fichiers.
   *
   * @returns {Promise<Array<{kind: string, path: string}>>} Dossier (`data` ou `logs`) et son chemin absolu
   */
  fastify.get(
    '/test/opened-folders',
    {
      schema: {
        description: "Dossiers dont l'ouverture a été demandée (tests E2E uniquement)",
        tags: ['Test'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: [...FOLDER_KINDS] },
                path: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => getOpenedFolders(),
  )
}
