import fs from 'node:fs'
import { prisma } from '../prismaClient.js'
import { config } from '../../config.js'
import { coreLocale } from '../../i18n.js'
import { readSeedFiles } from '../../database/seedDatabase.js'
import { runRecurrenceGeneration } from '../../scheduler/recurrenceGeneration.js'
import { runArchivePurge } from '../../scheduler/archivePurge.js'
import { runDatabaseBackup } from '../../scheduler/databaseBackup.js'
import Logger from '../../logger.js'

/**
 * Remise à zéro propre à celui qui démarre core (réglages, fenêtres, liens
 * ouverts…), appelée par POST /test/reset autour de la remise à zéro de la base.
 */
export interface TestResetHooks {
  /** Avant les seeds : les réglages remis à zéro donnent la langue des seeds. */
  beforeSeeds?: () => void | Promise<void>
  /** Une fois la base remise à zéro. */
  afterReset?: () => void | Promise<void>
}

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * core tourne en mode test). Routes propres aux données ; celles de l'app
 * desktop (notifications, dossiers, liens, mise à jour…) vivent dans
 * src/main/system/test.routes.ts.
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les checklists, les tâches, les séries, les tags, les colonnes et les tableaux
 *                                    puis rejoue les seeds (un seul tableau, sans les tags ni les modèles de checklist par défaut)
 *                                    et vide le dossier des sauvegardes ; le reste revient aux points d'accroche (TestResetHooks)
 * - POST /test/run-recurrences    → déclenche un passage de la génération des tâches récurrentes
 * - POST /test/run-archive-purge  → déclenche un passage de la purge des tâches archivées
 * - POST /test/run-backup         → déclenche un passage de la sauvegarde automatique de la base
 * - GET  /test/task-checklists    → nombre de checklists de tâches et de leurs points en base (contrôle de la cascade)
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 * @param {TestResetHooks} hooks Remise à zéro propre à celui qui démarre core
 */
export default async function testRoutes(fastify, hooks: TestResetHooks = {}) {
  /**
   * POST /test/reset
   *
   * Remet la base dans un état propre et déterministe : suppression de toutes
   * les checklists (modèles compris), de toutes les tâches, de tous les tags, de
   * toutes les colonnes puis de tous les tableaux, et réapplication des seeds
   * initiaux (source unique de vérité : les fichiers .sql du dossier seeds). La
   * seed du tableau par défaut en recrée un seul, d'un nouvel id à chaque reset.
   *
   * Les tags et les modèles de checklist par défaut sont retirés ensuite, les
   * tests partant de listes vides, sauf si `seedTags` ou `seedTemplates` est demandé.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.query - Paramètres de requête
   * @param {boolean} [req.query.seedTags] - Conserve les tags par défaut (défaut : false)
   * @param {boolean} [req.query.seedTemplates] - Conserve les modèles de checklist par défaut (défaut : false)
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
          properties: {
            seedTags: { type: 'boolean' },
            seedTemplates: { type: 'boolean' },
          },
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
      const { seedTags, seedTemplates } = req.query as { seedTags?: boolean; seedTemplates?: boolean }

      // Ordre important, car les checklists référencent les tâches, les tâches
      // les séries et les colonnes, les séries les colonnes (clés étrangères).
      // Les checklists des tâches partiraient en cascade, pas les modèles (sans
      // tâche), d'où leur suppression explicite. Les points suivent en cascade
      await prisma.checklist.deleteMany()
      await prisma.task.deleteMany()
      await prisma.recurrence.deleteMany()
      // Les liens tâche-tag sont déjà partis en cascade avec les tâches
      await prisma.tag.deleteMany()
      await prisma.stage.deleteMany()
      // Tableaux en dernier, car les colonnes les référencent
      await prisma.board.deleteMany()

      // Remise à zéro de celui qui démarre core avant les seeds (réglages dans
      // l'app desktop), pour qu'elles suivent la langue par défaut et non celle
      // d'un test précédent
      await hooks.beforeSeeds?.()

      // Rejoue les seeds initiaux (mêmes fichiers .sql que le boot)
      for (const { sql } of readSeedFiles(coreLocale())) {
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
      // De même pour les modèles de checklist, leurs points suivant en cascade.
      // Aucune checklist de tâche n'existe encore à ce stade
      if (!seedTemplates) await prisma.checklist.deleteMany({ where: { taskId: null } })

      // Sauvegardes des tests précédents retirées (dossier propre au mode test)
      fs.rmSync(config().backupsPath, { recursive: true, force: true })

      // Le reste de l'état laissé par un test précédent (fenêtres, liens, mise à jour…)
      await hooks.afterReset?.()

      Logger.info('Base de test réinitialisée')
      return { message: 'Base de test réinitialisée' }
    },
  )

  /**
   * POST /test/run-recurrences
   *
   * Déclenche manuellement un passage de la génération des tâches récurrentes
   * (`runRecurrenceGeneration`), le planificateur étant désactivé en mode
   * `--test`. Les tâches créées sont transmises à la fenêtre principale, comme
   * en temps normal.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO (défaut : maintenant)
   * @returns {Promise<{created: number, skipped: number, ended: number, waiting: number}>} Occurrences
   *   créées, dates sautées, séries terminées et séries en attente d'une colonne
   */
  fastify.post(
    '/test/run-recurrences',
    {
      schema: {
        description: 'Déclenche un passage de la génération des tâches récurrentes (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              created: { type: 'integer' },
              skipped: { type: 'integer' },
              ended: { type: 'integer' },
              waiting: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      const now = body.now ? new Date(body.now) : new Date()
      return runRecurrenceGeneration(now)
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
   * GET /test/task-checklists
   *
   * Compte les checklists de tâches (modèles exclus) et leurs points en base,
   * orphelins compris. Aucune route ne liste les checklists sans leur tâche,
   * c'est donc le seul moyen de vérifier que la suppression d'une tâche les
   * emporte (cascade, clés étrangères actives).
   *
   * @returns {Promise<{checklists: number, items: number}>} Nombre de checklists de tâches et de leurs points
   */
  fastify.get(
    '/test/task-checklists',
    {
      schema: {
        description: 'Nombre de checklists de tâches et de leurs points en base (tests E2E uniquement)',
        tags: ['Test'],
        response: {
          200: {
            type: 'object',
            properties: {
              checklists: { type: 'integer' },
              items: { type: 'integer' },
            },
          },
        },
      },
    },
    async () => {
      const taskChecklist = { taskId: { not: null } }
      const [checklists, items] = await prisma.$transaction([
        prisma.checklist.count({ where: taskChecklist }),
        prisma.checklistItem.count({ where: { checklist: taskChecklist } }),
      ])
      return { checklists, items }
    },
  )
}
