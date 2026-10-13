import fs from 'node:fs'
import { prisma } from '../prismaClient.js'
import { BACKUPS_PATH } from '../../constants.js'
import { readSeedFiles } from '../../seedDatabase.js'
import { getLocale } from '../../i18n.js'
import { handleNotificationClick, runNotificationCheck } from '../../scheduler/notificationScheduler.js'
import { runRecurrenceGeneration } from '../../scheduler/recurrenceGeneration.js'
import { runArchivePurge } from '../../scheduler/archivePurge.js'
import { runDatabaseBackup } from '../../scheduler/databaseBackup.js'
import { clearOpenedFolders, FOLDER_KINDS, getOpenedFolders } from '../../system/folders.js'
import { ABOUT_LINK_KINDS, clearOpenedLinks, getOpenedLinks } from '../../system/about.js'
import { clearOpenedUrls, getOpenedUrls } from '../../system/externalLinks.js'
import { settingsStore } from '../../stores/settings.js'
import { closeQuickAdd, openQuickAdd } from '../../system/quickAdd.js'
import { trayMenuLabels } from '../../system/systemIntegration.js'
import { resetUpdateForTest, simulateUpdateStatus, wasInstallRequested } from '../../system/updater.js'
import { UPDATE_STATES, type UpdateStatus } from '../../shared/update.constants.js'
import Logger from 'electron-log'

/**
 * Plugin de routes Fastify réservé aux tests E2E (enregistré uniquement quand
 * l'app tourne avec `--test`).
 *
 * Fournit des endpoints utilitaires pour isoler et piloter les tests :
 * - POST /test/reset              → vide les tâches, les séries, les tags et les colonnes puis rejoue les seeds (sans les tags par défaut),
 *                                    remet les paramètres à leurs valeurs par défaut, vide le dossier des sauvegardes,
 *                                    oublie les dossiers et les liens ouverts, ferme la fenêtre d'ajout rapide
 *                                    et remet la mise à jour à son état de départ
 * - POST /test/run-notifications  → déclenche un passage du planificateur de notifications
 * - POST /test/click-notification → simule le clic sur une notification de rappel (tâches annoncées en corps)
 * - POST /test/run-recurrences    → déclenche un passage de la génération des tâches récurrentes
 * - POST /test/run-archive-purge  → déclenche un passage de la purge des tâches archivées
 * - POST /test/run-backup         → déclenche un passage de la sauvegarde automatique de la base
 * - GET  /test/opened-folders     → dossiers dont l'ouverture a été demandée (simulée en test)
 * - GET  /test/opened-links       → liens « À propos » dont l'ouverture a été demandée (simulée en test)
 * - GET  /test/opened-urls        → liens cliqués dans une page, envoyés au navigateur par défaut (simulé en test)
 * - POST /test/open-quick-add     → ouvre la fenêtre d'ajout rapide (le raccourci global n'est pas enregistré en test)
 * - POST /test/update-status      → impose un état de la mise à jour automatique (désactivée en test)
 * - GET  /test/update-install     → indique si l'installation de la mise à jour a été demandée (simulée en test)
 * - GET  /test/tray-menu          → libellés du menu de l'icône de la zone de notification (non créée en test)
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

      // Ordre important : les tâches référencent les séries et les colonnes,
      // les séries les colonnes (clés étrangères)
      await prisma.task.deleteMany()
      await prisma.recurrence.deleteMany()
      // Les liens tâche-tag sont déjà partis en cascade avec les tâches
      await prisma.tag.deleteMany()
      await prisma.stage.deleteMany()

      // Paramètres remis à leurs valeurs par défaut (fichier config.test dédié),
      // relus par le renderer au rechargement qui suit le reset. Avant les
      // seeds, pour qu'elles suivent la langue par défaut et non celle d'un test précédent
      settingsStore.clear()

      // Rejoue les seeds initiaux (mêmes fichiers .sql que le boot)
      for (const { sql } of readSeedFiles(getLocale())) {
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

      // Sauvegardes des tests précédents retirées (dossier propre au mode test)
      fs.rmSync(BACKUPS_PATH, { recursive: true, force: true })

      // Ouvertures de dossiers et de liens des tests précédents oubliées
      clearOpenedFolders()
      clearOpenedLinks()
      clearOpenedUrls()

      // Fenêtre d'ajout rapide laissée ouverte par un test précédent
      closeQuickAdd()

      // Mise à jour simulée par un test précédent
      resetUpdateForTest()

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
   * @returns {Promise<{count: number, shown: boolean, style: string|null, title: string|null}>} Nombre de tâches
   *   notifiées, envoi ou non de la notification OS, son style (`reminder` ou `default`) et son titre (null sans envoi)
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
              title: { type: ['string', 'null'] },
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
   * POST /test/click-notification
   *
   * Simule le clic sur une notification de rappel, qu'un test ne peut pas
   * cliquer : même traitement que le clic réel (fenêtre principale ramenée,
   * tâche ouverte si elle est seule annoncée).
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Corps de la requête
   * @param {number[]} req.body.taskIds - Ids des tâches annoncées par la notification
   * @returns {Promise<{message: string}>} Confirmation du clic
   */
  fastify.post(
    '/test/click-notification',
    {
      schema: {
        description: 'Simule le clic sur une notification de rappel (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: { taskIds: { type: 'array', items: { type: 'integer' } } },
          required: ['taskIds'],
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
      const { taskIds } = req.body as { taskIds: number[] }
      handleNotificationClick(taskIds)
      return { message: 'Notification cliquée' }
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

  /**
   * GET /test/opened-links
   *
   * Liens de la section « À propos » dont l'ouverture a été demandée depuis le
   * dernier reset, dans l'ordre. En mode test, l'IPC `about:open` ne fait que
   * les noter, sans ouvrir le navigateur.
   *
   * @returns {Promise<Array<{kind: string, url: string}>>} Lien (`releases` ou `notices`) et son adresse
   */
  fastify.get(
    '/test/opened-links',
    {
      schema: {
        description: "Liens « À propos » dont l'ouverture a été demandée (tests E2E uniquement)",
        tags: ['Test'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: [...ABOUT_LINK_KINDS] },
                url: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => getOpenedLinks(),
  )

  /**
   * GET /test/opened-urls
   *
   * Liens cliqués dans une page de l'app (description Markdown d'une tâche)
   * depuis le dernier reset, dans l'ordre. En mode test, ils ne sont que notés,
   * sans ouvrir le navigateur.
   *
   * @returns {Promise<string[]>} Adresses des liens
   */
  fastify.get(
    '/test/opened-urls',
    {
      schema: {
        description: "Liens cliqués dans une page dont l'ouverture a été demandée (tests E2E uniquement)",
        tags: ['Test'],
        response: {
          200: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    async () => getOpenedUrls(),
  )

  /**
   * GET /test/tray-menu
   *
   * Libellés du menu de l'icône de la zone de notification, dans la langue de
   * l'interface. L'icône n'est jamais créée en mode test.
   *
   * @returns {Promise<string[]>} Libellés, dans l'ordre du menu
   */
  fastify.get(
    '/test/tray-menu',
    {
      schema: {
        description: "Libellés du menu de l'icône de la zone de notification (tests E2E uniquement)",
        tags: ['Test'],
        response: {
          200: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    async () => trayMenuLabels(),
  )

  /**
   * POST /test/open-quick-add
   *
   * Ouvre la fenêtre d'ajout rapide, comme le raccourci global (jamais
   * enregistré en mode test, il le serait pour toute la machine).
   *
   * @returns {Promise<{message: string}>} Confirmation de l'ouverture
   */
  fastify.post(
    '/test/open-quick-add',
    {
      schema: {
        description: "Ouvre la fenêtre d'ajout rapide (tests E2E uniquement)",
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
      openQuickAdd()
      return { message: "Fenêtre d'ajout rapide ouverte" }
    },
  )

  /**
   * POST /test/update-status
   *
   * Impose un état de la mise à jour automatique, envoyé aux fenêtres comme
   * en temps normal. electron-updater n'est jamais lancé en mode test.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - État simulé (`state`, `version`, `percent`)
   * @returns {Promise<{message: string}>} Confirmation
   */
  fastify.post(
    '/test/update-status',
    {
      schema: {
        description: 'Impose un état de la mise à jour automatique (tests E2E uniquement)',
        tags: ['Test'],
        body: {
          type: 'object',
          properties: {
            state: { type: 'string', enum: [...UPDATE_STATES] },
            version: { type: 'string' },
            percent: { type: 'number' },
          },
          required: ['state'],
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
      simulateUpdateStatus(req.body as UpdateStatus)
      return { message: 'État de la mise à jour imposé' }
    },
  )

  /**
   * GET /test/update-install
   *
   * Indique si l'installation de la mise à jour a été demandée depuis le
   * dernier reset. En mode test, l'IPC `update:install` ne fait que le noter.
   *
   * @returns {Promise<{requested: boolean}>} Installation demandée
   */
  fastify.get(
    '/test/update-install',
    {
      schema: {
        description: 'Installation de la mise à jour demandée (tests E2E uniquement)',
        tags: ['Test'],
        response: {
          200: {
            type: 'object',
            properties: { requested: { type: 'boolean' } },
          },
        },
      },
    },
    async () => ({ requested: wasInstallRequested() }),
  )
}
