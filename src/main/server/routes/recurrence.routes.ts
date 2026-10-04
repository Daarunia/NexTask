import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { idParam, errorResponse } from '../schemas/common.js'
import { recurrenceListItemSchema, recurrenceStatusBody, recurrenceSummarySchema } from '../schemas/recurrenceSchema.js'
import { recurrenceSummarySelect } from '../helpers/task.helper.js'
import { setSeriesStatus } from '../helpers/recurrence.helper.js'
import type { RecurrenceStatus } from '../../shared/recurrence.constants.js'

/**
 * Plugin de routes Fastify pour les séries récurrentes (Recurrence)
 *
 * Une série naît et change de règle depuis l'une de ses tâches (POST et PATCH
 * /tasks). Ces routes ne portent que sur la série elle-même :
 * - GET   /recurrences     → Liste toutes les séries (page Paramètres)
 * - PATCH /recurrences/:id → Change l'état d'une série (active, en pause, terminée)
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function recurrenceRoutes(fastify) {
  /**
   * GET /recurrences
   *
   * Liste toutes les séries, terminées comprises, avec le titre du modèle de
   * leurs occurrences : les séries en cours (actives ou en pause) d'abord,
   * puis par titre sans tenir compte de la casse.
   *
   * @returns {Promise<Object[]>} Résumés des séries, avec leur titre
   */
  fastify.get(
    '/recurrences',
    {
      schema: {
        description: 'Liste les séries récurrentes, en cours puis terminées, avec le titre de leur modèle',
        tags: ['Recurrence'],
        response: {
          200: { type: 'array', items: recurrenceListItemSchema },
        },
      },
    },
    async () => {
      const series = await prisma.recurrence.findMany({
        select: { ...recurrenceSummarySelect, title: true },
        orderBy: { id: 'asc' },
      })

      const ended = (status: string) => (status === 'ended' ? 1 : 0)
      return series.sort(
        (a, b) =>
          ended(a.status) - ended(b.status) ||
          a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) ||
          a.id - b.id,
      )
    },
  )

  /**
   * PATCH /recurrences/:id
   *
   * Change l'état d'une série. Reprise ou réactivée, sa prochaine date est
   * recalculée sans rattrapage : depuis maintenant selon le calendrier ; après
   * archivage, elle attend son occurrence au tableau, sinon garde la date
   * calculée à l'archivage (cf. setSeriesStatus). Elle reste terminée si sa
   * règle ne donne plus de date. Arrêtée, ses occurrences sont conservées.
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
