import type { TestResetHooks } from '../../core/server/routes/test.routes.js'
import { UPDATE_STATES, type UpdateStatus } from '../../core/shared/update.constants.js'
import { handleNotificationClick, runNotificationCheck } from '../scheduler/notificationScheduler.js'
import { settingsStore } from '../stores/settings.js'
import { clearOpenedFolders, FOLDER_KINDS, getOpenedFolders } from './folders.js'
import { clearOpenedDocumentCopies, clearOpenedDocuments, getOpenedDocuments } from './documents.js'
import { getDatabaseLocationForTest, resetDatabaseLocationForTest } from './databaseLocation.js'
import { ABOUT_LINK_KINDS, clearOpenedLinks, getOpenedLinks } from './about.js'
import { clearOpenedUrls, getOpenedUrls } from './externalLinks.js'
import { closeQuickAdd, openQuickAdd } from './quickAdd.js'
import { trayMenuLabels } from './systemIntegration.js'
import { resetUpdateForTest, simulateUpdateStatus, wasInstallRequested } from './updater.js'

/**
 * Remise à zéro propre à l'app desktop, branchée sur POST /test/reset de core
 * (cf. core/server/routes/test.routes.ts).
 */
export const desktopTestResetHooks: TestResetHooks = {
  // Paramètres remis à leurs valeurs par défaut (fichier config.test dédié),
  // relus par le renderer au rechargement qui suit le reset. Avant les seeds,
  // pour qu'elles suivent la langue par défaut et non celle d'un test précédent
  beforeSeeds: () => settingsStore.clear(),
  afterReset: async () => {
    // Ouvertures de dossiers et de liens des tests précédents oubliées
    clearOpenedFolders()
    clearOpenedDocuments()
    await clearOpenedDocumentCopies()
    clearOpenedLinks()
    clearOpenedUrls()

    // Fenêtre d'ajout rapide laissée ouverte par un test précédent
    closeQuickAdd()

    // Mise à jour simulée par un test précédent
    resetUpdateForTest()

    // Emplacement de la base enregistré par un test précédent
    resetDatabaseLocationForTest()
  },
}

/**
 * Plugin de routes Fastify réservé aux tests E2E, propre à l'app desktop
 * (enregistré uniquement quand l'app tourne avec `--test`, à côté des routes
 * de test de core).
 *
 * Fournit des endpoints utilitaires pour piloter ce que le desktop ajoute à core :
 * - POST /test/run-notifications  → déclenche un passage du planificateur de notifications
 * - POST /test/click-notification → simule le clic sur une notification de rappel (tâches annoncées en corps)
 * - GET  /test/opened-folders     → dossiers dont l'ouverture a été demandée (simulée en test)
 * - GET  /test/opened-documents   → documents dont l'ouverture a été demandée (copie écrite, rien ne s'ouvre en test)
 * - GET  /test/database-location  → emplacement de la base enregistré et redémarrage demandé (simulé en test)
 * - GET  /test/opened-links       → liens « À propos » dont l'ouverture a été demandée (simulée en test)
 * - GET  /test/opened-urls        → liens cliqués dans une page, envoyés au navigateur par défaut (simulé en test)
 * - POST /test/open-quick-add     → ouvre la fenêtre d'ajout rapide (le raccourci global n'est pas enregistré en test)
 * - POST /test/update-status      → impose un état de la mise à jour automatique (désactivée en test)
 * - GET  /test/update-install     → indique si l'installation de la mise à jour a été demandée (simulée en test)
 * - GET  /test/tray-menu          → libellés du menu de l'icône de la zone de notification (non créée en test)
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function desktopTestRoutes(fastify) {
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
   * GET /test/opened-folders
   *
   * Dossiers dont l'ouverture a été demandée depuis le dernier reset, dans
   * l'ordre. En mode test, l'IPC `folders:open` ne fait que les noter, sans
   * ouvrir l'explorateur de fichiers.
   *
   * @returns {Promise<Array<{kind: string, path: string}>>} Dossier (`data`, `database` ou `logs`) et son chemin absolu
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
   * GET /test/opened-documents
   *
   * Documents dont l'ouverture a été demandée depuis le dernier reset, dans
   * l'ordre. En mode test, l'IPC `documents:open` écrit la copie temporaire
   * mais ne la confie pas à l'application par défaut.
   *
   * @returns {Promise<Array<{name: string, path: string}>>} Nom du document et chemin de sa copie
   */
  fastify.get(
    '/test/opened-documents',
    {
      schema: {
        description: "Documents dont l'ouverture a été demandée (tests E2E uniquement)",
        tags: ['Test'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                path: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => getOpenedDocuments(),
  )

  /**
   * GET /test/database-location
   *
   * Emplacement de la base enregistré depuis le dernier reset, et redémarrage
   * demandé ou non. En mode test, un changement d'emplacement est enregistré
   * mais l'app ne redémarre pas : elle garde sa base de test.
   *
   * @returns {Promise<{storedPath: string|null, relaunchRequested: boolean}>} Chemin enregistré
   *   (null pour l'emplacement par défaut) et demande de redémarrage
   */
  fastify.get(
    '/test/database-location',
    {
      schema: {
        description: 'Emplacement de la base enregistré et redémarrage demandé (tests E2E uniquement)',
        tags: ['Test'],
        response: {
          200: {
            type: 'object',
            properties: {
              storedPath: { type: ['string', 'null'] },
              relaunchRequested: { type: 'boolean' },
            },
          },
        },
      },
    },
    async () => getDatabaseLocationForTest(),
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
