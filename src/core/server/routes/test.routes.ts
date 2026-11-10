import fs from 'node:fs'
import { prisma } from '../prismaClient.js'
import { config } from '../../config.js'
import { coreLocale } from '../../i18n.js'
import { readSeedFiles } from '../../database/seedDatabase.js'
import {
  clearDocumentFiles,
  clearStaleDocumentUploads,
  documentsPath,
  documentUploadsPath,
} from '../../database/documentStore.js'
import { runRecurrenceGeneration } from '../../scheduler/recurrenceGeneration.js'
import { runArchivePurge } from '../../scheduler/archivePurge.js'
import { runDatabaseBackup } from '../../scheduler/databaseBackup.js'
import Logger from '../../logger.js'
import { FILE_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../helpers/rateLimit.helper.js'

/**
 * Remise à zéro propre à celui qui démarre core, appelée par POST /test/reset
 * (réglages en base du serveur autonome). L'app desktop remet son propre état
 * à zéro par son pont de test (cf. src/main/system/testBridge.ts), avant
 * d'appeler cette route.
 */
export interface TestResetHooks {
  /** Avant les seeds, une fois les données retirées. */
  beforeSeeds?: () => void | Promise<void>
}

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * core tourne en mode test). Routes propres aux données ; l'état de l'app
 * desktop (notifications, dossiers, liens, mise à jour…) se pilote par son pont
 * de test (cf. src/main/system/testBridge.ts). Les seeds suivent la langue de la
 * requête (serveur autonome) ou celle de l'interface (app desktop).
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les checklists, les tâches, les séries, les tags, les colonnes et les tableaux
 *                                    puis rejoue les seeds (un seul tableau, sans les tags ni les modèles de checklist par défaut)
 *                                    et vide le dossier des sauvegardes ; le reste revient aux points d'accroche (TestResetHooks)
 * - POST /test/run-recurrences    → déclenche un passage de la génération des tâches récurrentes
 * - POST /test/run-archive-purge  → déclenche un passage de la purge des tâches archivées
 * - POST /test/run-backup         → déclenche un passage de la sauvegarde automatique de la base
 * - GET  /test/task-checklists    → nombre de checklists de tâches et de leurs points en base (contrôle de la cascade)
 * - GET  /test/task-documents     → lignes de documents, fichiers et envois en cours du dossier des documents
 * - POST /test/document-row       → crée une ligne de document sans fichier ni limite
 * - POST /test/clear-document-uploads → retire les envois de documents interrompus, comme au démarrage
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
      config: { rateLimit: { max: FILE_RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_WINDOW } },
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

      // Remise à zéro de celui qui démarre core avant les seeds (réglages en
      // base du serveur autonome)
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

      // Fichiers des documents des tests précédents, leurs lignes étant parties avec les tâches
      await clearDocumentFiles()

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

  /**
   * GET /test/task-documents
   *
   * Compte les lignes de documents et les fichiers du dossier des documents :
   * c'est le seul moyen de vérifier qu'une suppression emporte bien le fichier.
   *
   * @returns {Promise<{documents: number, files: number, uploads: number, directory: string}>} Lignes,
   *   fichiers, envois en cours et dossier des documents
   */
  fastify.get(
    '/test/task-documents',
    {
      config: { rateLimit: { max: FILE_RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_WINDOW } },
      schema: {
        description: 'Lignes et fichiers des documents (tests E2E uniquement)',
        tags: ['Test'],
        response: {
          200: {
            type: 'object',
            properties: {
              documents: { type: 'integer' },
              files: { type: 'integer' },
              uploads: { type: 'integer' },
              directory: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      const entries = fs.existsSync(documentsPath())
        ? fs.readdirSync(documentsPath(), { recursive: true, withFileTypes: true })
        : []
      const stored = entries.filter((entry) => entry.isFile())
      const uploads = stored.filter((entry) => entry.parentPath === documentUploadsPath()).length
      return {
        documents: await prisma.document.count(),
        files: stored.length - uploads,
        uploads,
        directory: documentsPath(),
      }
    },
  )

  /**
   * POST /test/document-row
   *
   * Crée une ligne de document sans fichier ni limite : tailles impossibles à
   * écrire dans un test (somme au-delà de 2 Go), ou empreinte hors format.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Tâche, taille et empreinte du document
   * @returns {Promise<{id: number}>} Id du document
   */
  fastify.post(
    '/test/document-row',
    {
      schema: {
        description: 'Crée une ligne de document sans fichier (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: {
            taskId: { type: 'integer' },
            size: { type: 'integer' },
            sha256: { type: 'string' },
          },
          required: ['taskId', 'size', 'sha256'],
        },
        response: { 200: { type: 'object', properties: { id: { type: 'integer' } } } },
      },
    },
    async (req) => {
      const { taskId, size, sha256 } = req.body as { taskId: number; size: number; sha256: string }
      return prisma.document.create({ data: { taskId, size, sha256, name: 'ligne.bin' }, select: { id: true } })
    },
  )

  /**
   * POST /test/clear-document-uploads
   *
   * Déclenche le retrait des envois interrompus, fait au démarrage de l'app.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO (défaut : maintenant)
   * @returns {Promise<{removed: number}>} Nombre de fichiers temporaires retirés
   */
  fastify.post(
    '/test/clear-document-uploads',
    {
      schema: {
        description: 'Retire les envois de documents interrompus (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: { 200: { type: 'object', properties: { removed: { type: 'integer' } } } },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as { now?: string }
      return { removed: await clearStaleDocumentUploads(body.now ? new Date(body.now) : new Date()) }
    },
  )
}
