import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { idParam, errorResponse } from '../schemas/common.js'
import { recurrenceStatusBody, recurrenceSummarySchema } from '../schemas/recurrenceSchema.js'
import { recurrenceSummarySelect } from '../helpers/task.helper.js'
import { setSeriesStatus } from '../helpers/recurrence.helper.js'
import type { RecurrenceStatus } from '../../shared/recurrence.constants.js'

/**
 * Plugin de routes Fastify pour les séries récurrentes (Recurrence)
 *
 * Une série naît et change de règle depuis l'une de ses tâches (POST et PATCH
 * /tasks). Ces routes ne portent que sur la série elle-même :
 * - PATCH /recurrences/:id → Change l'état d'une série (active, en pause, terminée)
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function recurrenceRoutes(fastify) {
  /**
   * PATCH /recurrences/:id
   *
   * Change l'état d'une série. Réactivée, elle repart de maintenant : sa
   * prochaine date est recalculée sans rattrapage (et la série reste terminée
   * si sa règle n'en donne plus). Arrêtée, ses occurrences sont conservées.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la série
   * @param {Object} req.body - Corps de la requête
   * @param {string} req.body.status - Nouvel état (`active`, `paused` ou `ended`)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Résumé de la série, 404 si elle n'existe pas
   */
  fastify.patch(
    '/recurrences/:id',
    {
      schema: {
        description: "Change l'état d'une série récurrente (réactivée sans rattrapage)",
        tags: ['Recurrence'],
        params: idParam,
        body: recurrenceStatusBody,
        response: {
          200: recurrenceSummarySchema,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { status } = req.body as { status: RecurrenceStatus }

      return prisma.$transaction(async (tx) => {
        const series = await tx.recurrence.findUnique({ where: { id } })
        if (!series) {
          Logger.warn(`Changement d'état de la série ${id} impossible, série introuvable`)
          reply.code(404)
          return { error: 'Série non trouvée' }
        }

        await setSeriesStatus(tx, series, status, new Date())
        return tx.recurrence.findUniqueOrThrow({ where: { id }, select: recurrenceSummarySelect })
      })
    },
  )
}
