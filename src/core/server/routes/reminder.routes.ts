import type { FastifyInstance } from 'fastify'
import { claimDueReminders } from '../../scheduler/reminders.js'
import { config } from '../../config.js'

/**
 * Rappels des tâches échues, pour un client qui ne tourne pas à côté de la
 * base (NexTask Client) : il les réclame chaque minute et les affiche. L'app
 * locale appelle directement `claimDueReminders()`, sans passer par HTTP.
 *
 * Une tâche réclamée est marquée notifiée : avec plusieurs clients sur le même
 * serveur, le premier qui la réclame l'affiche, les autres ne la voient pas.
 *
 * - POST /reminders/claim → réclame les rappels échus
 *
 * @param fastify Instance de Fastify
 */
export default async function reminderRoutes(fastify: FastifyInstance) {
  /**
   * POST /reminders/claim
   *
   * Tâches dont la date de début est passée, pas encore notifiées ni archivées,
   * marquées notifiées dans la foulée.
   *
   * @param {Object} [req.body] - Corps optionnel
   * @param {string} [req.body.now] - Horodatage de référence ISO, suivi en mode test seulement
   *   (les tests E2E du client rappellent des tâches datées dans le futur)
   * @returns {Promise<{id: number, title: string}[]>} Tâches réclamées, vide s'il n'y en a aucune
   */
  fastify.post(
    '/reminders/claim',
    {
      schema: {
        description: 'Réclame les rappels échus, marqués notifiés (le premier client qui les réclame les affiche)',
        tags: ['Reminder'],
        body: {
          type: ['object', 'null'],
          properties: { now: { type: 'string', format: 'date-time' } },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'integer' }, title: { type: 'string' } },
              required: ['id', 'title'],
            },
          },
        },
      },
    },
    async (req) => {
      const { now } = (req.body ?? {}) as { now?: string }
      return claimDueReminders(now && config().isTest ? new Date(now) : new Date())
    },
  )
}
