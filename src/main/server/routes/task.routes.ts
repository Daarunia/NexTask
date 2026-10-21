import { prisma } from '../prismaClient.js'
import { Prisma, type Task as PrismaTask } from '../../prisma/generated/prisma/client.js'
import { taskSchema } from '../schemas/taskSchema.js'
import { tagNameSchema } from '../schemas/tagSchema.js'
import { idParam, errorResponse, messageResponse, requiredLabel } from '../schemas/common.js'
import { nullableRecurrenceInputSchema, recurrenceInputSchema } from '../schemas/recurrenceSchema.js'
import { taskChecklistItemsSchema } from '../schemas/checklistSchema.js'
import { resolveTagIds } from '../helpers/tag.helper.js'
import {
  sameChecklistTexts,
  setTaskChecklistItemChecked,
  syncTaskChecklist,
  templateChecklistInput,
  taskChecklistTexts,
} from '../helpers/checklist.helper.js'
import { bottomPosition, makeRoomAt, taskInclude } from '../helpers/task.helper.js'
import { stagePlacement, withStageBoard } from '../helpers/board.helper.js'
import {
  createSeries,
  onArchiveStatesChanged,
  onOccurrenceDeleted,
  onOccurrenceRestored,
  onTaskUpdated,
  recurrenceInputProblem,
} from '../helpers/recurrence.helper.js'
import { settingsStore } from '../../stores/settings.js'
import type { RecurrenceInput } from '../../shared/recurrence.constants.js'
import type { ChecklistItemInput } from '../../shared/checklist.constants.js'
import Logger from 'electron-log'

// Noms des tags d'une tâche, rapprochés ou créés par le serveur (cf. tag.helper)
const taskTagsBody = {
  type: 'array',
  items: tagNameSchema,
}

/** Corps de POST /tasks, une fois validé par Fastify. */
type TaskCreateBody = Omit<Prisma.TaskUncheckedCreateInput, 'tags' | 'checklist'> & {
  tags?: string[]
  recurrence?: RecurrenceInput
  checklistItems?: ChecklistItemInput[]
}

/**
 * Réponse de POST /tasks/:id/restore : la tâche restaurée, et l'id de
 * l'occurrence retirée avec l'annulation de son archivage (série « après
 * archivage », cf. onOccurrenceRestored), null sinon.
 */
const restoreResponse = {
  ...taskSchema,
  properties: { ...taskSchema.properties, removedOccurrenceId: { type: ['integer', 'null'] } },
}

/**
 * Données d'une mise à jour qui archive la tâche (`isHistorized: true`) alors
 * qu'elle ne l'était pas : sans date d'archivage fournie, c'est maintenant,
 * comme pour PUT /tasks/:id (la purge des archives et les séries « après
 * archivage » s'en servent).
 *
 * @param data Données de la mise à jour
 * @param wasArchived Tâche déjà archivée avant la mise à jour
 * @param now Maintenant
 */
function withArchiveDate<T extends { isHistorized?: unknown; historizationDate?: unknown }>(
  data: T,
  wasArchived: boolean,
  now: Date,
): T {
  if (data.isHistorized !== true || wasArchived || data.historizationDate) return data
  return { ...data, historizationDate: now }
}

/** Corps de PATCH /tasks/:id, une fois validé par Fastify. */
type TaskUpdateBody = Omit<Prisma.TaskUncheckedUpdateInput, 'tags' | 'checklist'> & {
  tags?: string[]
  recurrence?: RecurrenceInput | null
  applyToSeries?: boolean
  checklistItems?: ChecklistItemInput[]
}

/**
 * Met à jour plusieurs tâches dans la transaction de PATCH /tasks/batch, puis
 * fait suivre leurs séries (archivage ou restauration, cf. onArchiveStatesChanged).
 * Le tableau d'une tâche suit la colonne envoyée, et reste le même pour une
 * tâche archivée (`stageId` null). Une colonne inconnue annule tout le lot.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param tasks Tâches à mettre à jour (id requis)
 * @param now Horodatage de référence
 * @returns Tâches mises à jour, dans l'ordre reçu, avec le résumé de leur série à jour
 */
async function updateTaskBatch(
  tx: Prisma.TransactionClient,
  tasks: Array<Partial<PrismaTask> & { id: number }>,
  now: Date,
): Promise<Prisma.TaskGetPayload<{ include: typeof taskInclude }>[]> {
  const archived = await tx.task.findMany({
    where: { id: { in: tasks.map((t) => t.id) }, isHistorized: true },
    select: { id: true },
  })
  const wasArchived = new Set(archived.map((task) => task.id))

  const updated: Prisma.TaskGetPayload<{ include: typeof taskInclude }>[] = []
  for (const t of tasks) {
    // Le tableau suit la colonne, même celle d'un autre tableau (la série, elle,
    // ne suit pas, c'est le rôle d'un déplacement de tâche entre tableaux)
    const fields = await withStageBoard(tx, t)
    if (!fields) throw new Error(`Colonne ${t.stageId} introuvable pour la tâche ${t.id}`)
    const data = withArchiveDate(fields, wasArchived.has(t.id), now)

    // startDate repoussée dans le futur → on réarme la notification.
    if (data.startDate && new Date(data.startDate) > now) {
      data.notifiedAt = null
    }

    updated.push(await tx.task.update({ where: { id: t.id }, data, include: taskInclude }))
  }

  await onArchiveStatesChanged(
    tx,
    updated.map((task) => ({ wasArchived: wasArchived.has(task.id), task })),
    now,
  )

  // Relues dans l'ordre reçu : le résumé de leur série est à jour
  const fresh = await tx.task.findMany({
    where: { id: { in: updated.map((task) => task.id) } },
    include: taskInclude,
  })
  const freshById = new Map(fresh.map((task) => [task.id, task]))
  return updated.map((task) => freshById.get(task.id) ?? task)
}

/**
 * Plugin de routes Fastify pour la gestion des tâches (Task)
 *
 * Fournit les endpoints CRUD pour l'entité `Task` :
 * - GET    /tasks       → Liste toutes les tâches
 * - GET    /tasks/:id   → Récupère une tâche par son ID
 * - POST   /tasks       → Crée une nouvelle tâche
 * - PATCH  /tasks/:id   → Modifie une tâche existante
 * - DELETE /tasks/:id   → Supprime une tâche existante
 * - PUT    /tasks/:id   → Archive (historise) une tâche
 * - POST   /tasks/:id/restore → Restaure une tâche archivée (à sa place ou en bas de la première colonne)
 * - POST   /tasks/quick-add   → Crée une tâche depuis l'ajout rapide
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function taskRoutes(fastify) {
  /**
   * GET /tasks
   *
   * Récupère la liste des tâches, toutes ou filtrées sur leur historisation.
   * Les tâches sont triées par colonne puis par position, sauf les tâches
   * archivées seules (`isHistorized=true`), triées de la plus récemment
   * archivée à la plus ancienne.
   *
   * @param {Object} request - Requête Fastify
   * @param {Object} request.query - Paramètres de requête
   * @param {boolean} [request.query.isHistorized] - Seulement les tâches archivées (true) ou actives (false)
   * @returns {Promise<Array<Object>>} Tableau d'objets Task
   */
  fastify.get(
    '/tasks',
    {
      schema: {
        description: 'Récupère toutes les tâches',
        tags: ['Task'],
        querystring: {
          type: 'object',
          properties: {
            isHistorized: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: taskSchema,
          },
        },
      },
    },
    async (request) => {
      // Même nom que dans le schéma `querystring`, sinon Fastify le retire
      const { isHistorized } = request.query as { isHistorized?: boolean }

      const orderBy: Prisma.TaskOrderByWithRelationInput[] = isHistorized
        ? [{ historizationDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
        : [{ stageId: 'asc' }, { position: 'asc' }]

      return prisma.task.findMany({
        where: isHistorized === undefined ? undefined : { isHistorized },
        orderBy,
        include: taskInclude,
      })
    },
  )

  /**
   * GET /tasks/:id
   *
   * Récupère une tâche unique par son identifiant.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task ou erreur
   */
  fastify.get(
    '/tasks/:id',
    {
      schema: {
        description: 'Récupère une tâche par son ID',
        tags: ['Task'],
        params: idParam,
        response: {
          200: taskSchema,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const task = await prisma.task.findUnique({ where: { id }, include: taskInclude })
      if (!task) {
        reply.code(404)
        return { error: 'Tâche non trouvée' }
      }
      return task
    },
  )

  /**
   * POST /tasks
   *
   * Crée une nouvelle tâche avec les données fournies.
   *
   * Les tags sont transmis par leur nom : les noms connus (sans tenir compte
   * de la casse) sont réutilisés, les autres créés. Avec `recurrence`, la
   * tâche est la première occurrence d'une nouvelle série (date de début
   * obligatoire). Avec `checklistItems`, la tâche naît avec sa checklist,
   * textes nettoyés et vides retirés, les points cochés datés de maintenant
   * (cf. planChecklistSync). Tags, tâche, checklist et série sont écrits dans
   * une même transaction. Le tableau de la tâche est celui de sa colonne.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Corps de la requête
   * @param {number} req.body.stageId - ID de la colonne
   * @param {string} req.body.title - Titre
   * @param {string} req.body.version - Version associée
   * @param {string} req.body.description - Description
   * @param {number} req.body.position - Position dans la colonne
   * @param {string|null} [req.body.startDate] - Date de début
   * @param {string[]} [req.body.tags] - Noms des tags de la tâche
   * @param {Object} [req.body.recurrence] - Règle de répétition (cf. RecurrenceInput)
   * @param {Object[]} [req.body.checklistItems] - Points de la checklist, dans l'ordre (cf. ChecklistItemInput)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task créé, avec ses tags, sa checklist et sa série,
   *   400 si la règle de répétition est incohérente ou si un point est invalide,
   *   404 si la colonne n'existe pas
   */
  fastify.post(
    '/tasks',
    {
      schema: {
        description: 'Crée une nouvelle tâche',
        tags: ['Task'],
        body: {
          type: 'object',
          properties: {
            stageId: { type: 'number' },
            version: { type: 'string' },
            description: { type: 'string' },
            position: { type: 'integer' },
            title: requiredLabel,
            startDate: { type: ['string', 'null'], format: 'date-time' },
            tags: taskTagsBody,
            recurrence: recurrenceInputSchema,
            checklistItems: taskChecklistItemsSchema,
          },
          required: ['stageId', 'position', 'title', 'version', 'description'],
        },
        response: { 200: taskSchema, 400: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const { tags, recurrence, checklistItems, ...data } = req.body as TaskCreateBody

      if (recurrence) {
        const problem = recurrenceInputProblem(recurrence, data.startDate ? new Date(data.startDate) : null)
        if (problem) {
          reply.code(400)
          return { error: problem }
        }
      }

      const now = new Date()

      return prisma.$transaction(async (tx) => {
        // Avant toute écriture, car la réponse d'erreur valide la transaction
        const placement = await stagePlacement(tx, data.stageId as number)
        if (!placement) {
          Logger.warn(`Création de tâche refusée, colonne ${data.stageId} introuvable`)
          reply.code(404)
          return { error: 'Colonne non trouvée' }
        }

        const tagIds = tags ? await resolveTagIds(tx, tags) : []
        // Placement en dernier, il remplace un `boardId` envoyé par le client
        const task = await tx.task.create({
          data: { ...data, ...placement, tags: { connect: tagIds.map((tagId) => ({ id: tagId })) } },
        })

        // Checklist écrite avant la série, qui pourra en reprendre les textes
        await syncTaskChecklist(tx, task.id, checklistItems, now)
        if (recurrence) await createSeries(tx, task, recurrence, tagIds, now)

        return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude })
      })
    },
  )

  /**
   * PATCH /tasks/:id
   *
   * Met à jour les informations d'une tâche existante.
   *
   * `tags` absent laisse les tags inchangés, `tags: []` les retire tous.
   * Sinon la tâche porte exactement les tags nommés, rapprochés ou créés
   * comme pour POST /tasks, dans la même transaction que la mise à jour.
   *
   * Pour la checklist, `checklistItems` absent la laisse inchangée, `[]` la supprime
   * avec tous ses points. Sinon la liste envoyée la remplace, dans l'ordre. Un
   * point avec l'id d'un point de la tâche est modifié, un point sans id
   * (ou avec un id étranger à la tâche) est créé, un point absent est
   * supprimé. Le serveur date la coche (`checkedAt`), cf. planChecklistSync.
   *
   * Répétition :
   * - `recurrence` absent laisse la série inchangée ;
   * - un objet crée une série dont la tâche est la première occurrence, ou
   *   modifie la règle de sa série (prochaine date recalculée sans
   *   rattrapage, selon son mode, cf. updateSeriesRule) ;
   * - `null` arrête sa série, dont les occurrences sont conservées.
   * Avec `applyToSeries` (par défaut), le contenu modifié (titre, description,
   * version, tags, colonne) est aussi reporté sur le modèle des prochaines
   * occurrences. Les textes des points de la checklist le sont s'ils ont
   * changé (point ajouté, retiré, renommé ou déplacé), jamais une simple
   * coche. Les occurrences existantes ne changent pas.
   *
   * Archivage (`isHistorized: true`, daté de maintenant sans
   * `historizationDate`) et désarchivage d'une occurrence d'une série « après
   * archivage » : la série calcule sa prochaine date ou se remet en attente
   * (cf. onArchiveStatesChanged).
   *
   * Le tableau de la tâche suit `stageId` quand il désigne une colonne, et ne
   * change pas avec `stageId: null` (archivage). Le client ne l'envoie jamais.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {Object} req.body - Données à mettre à jour
   * @param {string[]} [req.body.tags] - Noms des tags de la tâche (remplacent les actuels)
   * @param {Object[]} [req.body.checklistItems] - Points de la checklist (remplacent les actuels)
   * @param {Object|null} [req.body.recurrence] - Règle de répétition, null pour arrêter la série
   * @param {boolean} [req.body.applyToSeries] - Reporter le contenu sur le modèle de la série (défaut : true)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task mis à jour avec ses tags, sa checklist
   *   et sa série, 400 si la règle de répétition est incohérente ou si un point est invalide,
   *   404 si la tâche ou la colonne n'existe pas,
   *   500 pour toute autre erreur
   */
  fastify.patch(
    '/tasks/:id',
    {
      schema: {
        description: 'Met à jour une tâche existante',
        tags: ['Task'],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            title: requiredLabel,
            version: { type: 'string' },
            description: { type: 'string' },
            position: { type: 'integer' },
            stageId: { type: ['integer', 'null'] },
            isHistorized: { type: 'boolean' },
            historizationDate: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            startDate: { type: ['string', 'null'], format: 'date-time' },
            notifiedAt: { type: ['string', 'null'], format: 'date-time' },
            tags: taskTagsBody,
            recurrence: nullableRecurrenceInputSchema,
            applyToSeries: { type: 'boolean' },
            checklistItems: taskChecklistItemsSchema,
          },
        },
        response: {
          200: taskSchema,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { tags, recurrence, applyToSeries = true, checklistItems, ...data } = req.body as TaskUpdateBody
      const now = new Date()

      // Si la startDate est repoussée dans le futur, on réarme la notification.
      if (data.startDate && new Date(data.startDate as string) > now) {
        data.notifiedAt = null
      }

      try {
        // Transaction : si la tâche n'existe pas ou si la règle est refusée, rien n'est écrit
        return await prisma.$transaction(async (tx) => {
          const current = await tx.task.findUnique({ where: { id }, include: { recurrence: true, tags: true } })
          if (!current) {
            Logger.warn(`Mise à jour de la tâche ${id} impossible, tâche introuvable`)
            reply.code(404)
            return { error: 'Tâche non trouvée' }
          }

          // Date de début une fois la modification appliquée
          let startDate = current.startDate
          if (data.startDate !== undefined) startDate = data.startDate ? new Date(data.startDate as string) : null

          if (recurrence) {
            const problem = recurrenceInputProblem(recurrence, startDate)
            if (problem) {
              reply.code(400)
              return { error: problem }
            }
          }

          // Avant toute écriture, car la réponse d'erreur valide la transaction
          const fields = await withStageBoard(tx, data)
          if (!fields) {
            Logger.warn(`Mise à jour de la tâche ${id} impossible, colonne ${data.stageId} introuvable`)
            reply.code(404)
            return { error: 'Colonne non trouvée' }
          }

          const tagIds = tags === undefined ? undefined : await resolveTagIds(tx, tags)

          const task = await tx.task.update({
            where: { id },
            data: {
              ...withArchiveDate(fields, current.isHistorized, now),
              ...(tagIds && { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } }),
            },
          })

          // Textes des points d'une occurrence avant l'enregistrement de sa checklist, car seul
          // un changement de textes part dans le modèle de la série, jamais une coche
          const previousTexts =
            checklistItems !== undefined && current.recurrence ? await taskChecklistTexts(tx, id) : undefined

          // Checklist remplacée avant la série, qui pourra en reprendre les textes
          await syncTaskChecklist(tx, id, checklistItems, now)

          // Série arrêtée, modifiée ou créée, modèle et attente d'archivage à jour
          const sent = {
            title: data.title !== undefined,
            description: data.description !== undefined,
            version: data.version !== undefined,
            checklistItems:
              previousTexts !== undefined && !sameChecklistTexts(previousTexts, await taskChecklistTexts(tx, id)),
          }
          await onTaskUpdated(tx, { current, task, recurrence, startDate, applyToSeries, sent, tagIds }, now)

          return tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude })
        })
      } catch (error) {
        // P2025 : enregistrement à mettre à jour introuvable
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          Logger.warn(`Mise à jour de la tâche ${id} impossible, tâche introuvable`)
          reply.code(404)
          return { error: 'Tâche non trouvée' }
        }

        Logger.error(`Erreur lors de la mise à jour de la tâche ${id} :`, error)
        reply.code(500)
        return { error: 'Impossible de mettre à jour la tâche' }
      }
    },
  )

  /**
   * PATCH /tasks/:id/checklist/items/:itemId
   *
   * Coche ou décoche un seul point de la checklist d'une tâche, depuis la
   * carte du tableau, sans renvoyer toute la liste. Une coche ne part jamais
   * dans le modèle d'une série (seuls les textes y vont), la série n'est donc
   * pas touchée.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {number} req.params.itemId - ID du point
   * @param {Object} req.body - Corps de la requête
   * @param {boolean} req.body.isChecked - Nouvel état du point
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task à jour avec sa checklist,
   *   404 si la tâche n'existe pas ou si le point n'est pas dans sa checklist
   */
  fastify.patch(
    '/tasks/:id/checklist/items/:itemId',
    {
      schema: {
        description: "Coche ou décoche un point de la checklist d'une tâche",
        tags: ['Task'],
        params: {
          type: 'object',
          properties: { id: { type: 'integer' }, itemId: { type: 'integer' } },
          required: ['id', 'itemId'],
        },
        body: {
          type: 'object',
          properties: { isChecked: { type: 'boolean' } },
          required: ['isChecked'],
        },
        response: {
          200: taskSchema,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { id, itemId } = req.params as { id: number; itemId: number }
      const { isChecked } = req.body as { isChecked: boolean }
      const now = new Date()

      return prisma.$transaction(async (tx) => {
        if (!(await setTaskChecklistItemChecked(tx, id, itemId, isChecked, now))) {
          Logger.warn(`Point ${itemId} introuvable dans la checklist de la tâche ${id}`)
          reply.code(404)
          return { error: 'Point de checklist non trouvé' }
        }

        // La tâche compte comme modifiée, comme après un enregistrement du dialogue
        return tx.task.update({ where: { id }, data: { updatedAt: now }, include: taskInclude })
      })
    },
  )

  /**
   * DELETE /tasks/:id
   *
   * Supprime une tâche par son ID. Supprimer l'occurrence au tableau d'une
   * série « après archivage » la libère comme un archivage (cf. onOccurrenceDeleted).
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès ou erreur
   */
  fastify.delete(
    '/tasks/:id',
    {
      schema: {
        description: 'Supprime une tâche par son ID',
        tags: ['Task'],
        params: idParam,
        response: {
          200: messageResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      try {
        await prisma.$transaction(async (tx) => {
          const deleted = await tx.task.delete({ where: { id } })
          await onOccurrenceDeleted(tx, deleted, new Date())
        })
        Logger.info(`Tâche ${id} supprimée`)
        return { message: 'Tâche supprimée' }
      } catch (error) {
        Logger.warn(`Échec de la suppression de la tâche ${id} (traitée comme introuvable) :`, error)
        reply.code(404)
        return { error: 'Tâche non trouvée' }
      }
    },
  )

  /**
   * PUT /tasks/:id
   *
   * Met à jour une tâche en la marquant comme historisée. Archiver la dernière
   * occurrence au tableau d'une série « après archivage » lui donne sa
   * prochaine date (cf. onArchiveStatesChanged), dans la même transaction.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès ou erreur (404 si la tâche n'existe pas)
   */
  fastify.put(
    '/tasks/:id',
    {
      schema: {
        description: 'Marque une tâche comme historisée par son ID',
        tags: ['Task'],
        params: idParam,
        response: {
          200: messageResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const now = new Date()
      try {
        const updatedTask = await prisma.$transaction(async (tx) => {
          const current = await tx.task.findUniqueOrThrow({ where: { id }, select: { isHistorized: true } })

          // Mise à jour de la tâche pour la marquer comme historisée
          const task = await tx.task.update({
            where: { id },
            data: { isHistorized: true, historizationDate: now, stageId: null },
          })
          await onArchiveStatesChanged(tx, [{ wasArchived: current.isHistorized, task }], now)
          return task
        })

        return { message: `Tâche ${updatedTask.id} marquée comme historisée` }
      } catch (error) {
        Logger.warn(`Échec de l'historisation de la tâche ${id} (traitée comme introuvable) :`, error)
        reply.code(404)
        return { error: 'Tâche non trouvée' }
      }
    },
  )

  /**
   * POST /tasks/:id/restore
   *
   * Restaure une tâche archivée : elle quitte les archives et reprend place au
   * tableau. Ses tags sont conservés.
   *
   * Sans paramètre, elle va en bas de la première colonne (plus petite
   * position). Avec `stageId` et `position` (annulation d'un archivage), elle
   * reprend cette place : les tâches qui l'occupent descendent d'un cran. Si
   * cette colonne n'existe plus, la place par défaut est utilisée.
   *
   * Occurrence d'une série « après archivage » : la série l'attend de
   * nouveau, et l'occurrence née de son archivage est retirée si elle n'a pas
   * été modifiée (cf. onOccurrenceRestored) ; son id est renvoyé dans
   * `removedOccurrenceId`, pour que l'interface retire sa carte.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {Object} req.query - Paramètres de requête
   * @param {number} [req.query.stageId] - Colonne où restaurer la tâche
   * @param {number} [req.query.position] - Position dans cette colonne
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task restauré avec ses tags (et
   *   `removedOccurrenceId`), 404 si la tâche n'existe pas, 409 si elle n'est pas
   *   archivée ou s'il n'y a aucune colonne
   */
  fastify.post(
    '/tasks/:id/restore',
    {
      schema: {
        description: 'Restaure une tâche archivée, à la place indiquée ou en bas de la première colonne',
        tags: ['Task'],
        params: idParam,
        // En query plutôt qu'en corps : la restauration depuis les archives n'envoie rien
        querystring: {
          type: 'object',
          properties: {
            stageId: { type: 'integer' },
            position: { type: 'integer', minimum: 0 },
          },
          // L'un ne va pas sans l'autre
          dependencies: { stageId: ['position'], position: ['stageId'] },
        },
        response: {
          200: restoreResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const place = req.query as { stageId?: number; position?: number }

      // Transaction : la position calculée reste valable au moment de l'écriture
      return prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({ where: { id } })
        if (!task) {
          reply.code(404)
          return { error: 'Tâche non trouvée' }
        }
        if (!task.isHistorized) {
          reply.code(409)
          return { error: "La tâche n'est pas archivée" }
        }

        // Place demandée, si sa colonne existe encore
        const requestedStage =
          place.stageId === undefined ? null : await tx.stage.findUnique({ where: { id: place.stageId } })

        let stageId: number
        let position: number

        if (requestedStage && place.position !== undefined) {
          stageId = requestedStage.id
          position = place.position
          await makeRoomAt(tx, stageId, position)
        } else {
          const firstStage = await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] })
          if (!firstStage) {
            reply.code(409)
            return { error: 'Aucune colonne pour restaurer la tâche' }
          }

          // En bas de la colonne : après la plus grande position de ses tâches actives
          stageId = firstStage.id
          position = await bottomPosition(tx, stageId)
        }

        await tx.task.update({
          where: { id },
          data: { isHistorized: false, historizationDate: null, stageId, position },
        })
        const removed = await onOccurrenceRestored(tx, task)

        // Relue après la série : son résumé est à jour
        const restored = await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude })
        Logger.info(`Tâche ${id} restaurée dans la colonne ${stageId}, position ${position}`)
        return { ...restored, removedOccurrenceId: removed?.id ?? null }
      })
    },
  )

  /**
   * POST /tasks/quick-add
   *
   * Crée une tâche depuis la fenêtre d'ajout rapide, avec son seul titre. Le
   * serveur complète le reste à partir des paramètres : version par défaut, et
   * place en haut ou en bas de la colonne (les autres tâches descendent d'un
   * cran pour une tâche ajoutée en haut). Avec un modèle de checklist, ses
   * points sont copiés dans la tâche, décochés ; un modèle supprimé entre-temps
   * est ignoré, la tâche est créée sans checklist.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Corps de la requête
   * @param {string} req.body.title - Titre
   * @param {number} [req.body.stageId] - Colonne (la première si absente ou supprimée)
   * @param {number} [req.body.checklistTemplateId] - Modèle de checklist à appliquer
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task créé, 409 s'il n'y a aucune colonne
   */
  fastify.post(
    '/tasks/quick-add',
    {
      schema: {
        description: "Crée une tâche depuis l'ajout rapide (version et place tirées des paramètres)",
        tags: ['Task'],
        body: {
          type: 'object',
          properties: {
            title: requiredLabel,
            stageId: { type: 'integer' },
            checklistTemplateId: { type: 'integer' },
          },
          required: ['title'],
        },
        response: {
          200: taskSchema,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { title, stageId, checklistTemplateId } = req.body as {
        title: string
        stageId?: number
        checklistTemplateId?: number
      }
      const { newTaskPosition, defaultTaskVersion } = settingsStore.store

      return prisma.$transaction(async (tx) => {
        const stage =
          (stageId === undefined ? null : await tx.stage.findUnique({ where: { id: stageId } })) ??
          (await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }))
        if (!stage) {
          reply.code(409)
          return { error: 'Aucune colonne pour ajouter la tâche' }
        }

        let position: number
        if (newTaskPosition === 'top') {
          position = 0
          await makeRoomAt(tx, stage.id, position)
        } else {
          position = await bottomPosition(tx, stage.id)
        }

        const items = checklistTemplateId === undefined ? [] : await templateChecklistInput(tx, checklistTemplateId)

        const task = await tx.task.create({
          data: { title: title.trim(), version: defaultTaskVersion, description: '', stageId: stage.id, position },
        })
        await syncTaskChecklist(tx, task.id, items, new Date())

        Logger.info(`Ajout rapide : tâche ${task.id} créée dans la colonne ${stage.id} (${items.length} point(s))`)
        return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude })
      })
    },
  )

  /**
   * POST /tasks/:id/duplicate
   *
   * Duplique une tâche du tableau juste sous l'originale, dans la même
   * colonne (les tâches suivantes descendent d'un cran). La copie reprend la
   * version, la description, la date de début (et son rappel déjà envoyé, pour
   * ne pas notifier deux fois), les tags et les textes des points de la
   * checklist, tous décochés, ainsi que son tableau. Elle ne fait partie
   * d'aucune série. Le titre est choisi par le renderer, dans la langue de
   * l'interface.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche à dupliquer
   * @param {Object} req.body - Corps de la requête
   * @param {string} req.body.title - Titre de la copie
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task créé, 404 si la tâche
   *   n'existe pas, 409 si elle est archivée
   */
  fastify.post(
    '/tasks/:id/duplicate',
    {
      schema: {
        description: 'Duplique une tâche du tableau sous l’originale',
        tags: ['Task'],
        params: idParam,
        body: {
          type: 'object',
          properties: { title: requiredLabel },
          required: ['title'],
        },
        response: {
          200: taskSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { title } = req.body as { title: string }

      return prisma.$transaction(async (tx) => {
        const source = await tx.task.findUnique({ where: { id }, include: taskInclude })
        if (!source) {
          reply.code(404)
          return { error: 'Tâche non trouvée' }
        }
        if (source.isHistorized || source.stageId === null) {
          reply.code(409)
          return { error: 'Une tâche archivée ne se duplique pas' }
        }

        const position = source.position + 1
        await makeRoomAt(tx, source.stageId, position)

        const copy = await tx.task.create({
          data: {
            title: title.trim(),
            version: source.version,
            description: source.description,
            stageId: source.stageId,
            boardId: source.boardId,
            position,
            startDate: source.startDate,
            notifiedAt: source.notifiedAt,
            tags: { connect: source.tags.map((tag) => ({ id: tag.id })) },
          },
        })
        const items = (source.checklist?.items ?? []).map((item) => ({ text: item.text, isChecked: false }))
        await syncTaskChecklist(tx, copy.id, items, new Date())

        Logger.info(`Tâche ${id} dupliquée en ${copy.id} (colonne ${source.stageId}, position ${position})`)
        return tx.task.findUniqueOrThrow({ where: { id: copy.id }, include: taskInclude })
      })
    },
  )

  /**
   * PATCH /tasks/batch
   *
   * Met à jour plusieurs tâches en une seule requête, dans une transaction.
   * Archivage et désarchivage comme pour PATCH /tasks/:id (date d'archivage,
   * séries « après archivage »). Le tableau de chaque tâche suit sa colonne,
   * même celle d'un autre tableau, sans que sa série suive. Une colonne
   * inconnue annule tout le lot (500).
   *
   * @param {Object} req - Requête Fastify
   * @param {Array<Object>} req.body - Tableau des tâches à mettre à jour
   * @param {number} req.body[].id - ID de la tâche (requis)
   * @param {string} [req.body[].title] - Titre
   * @param {string} [req.body[].version] - Version
   * @param {string} [req.body[].description] - Description
   * @param {number} [req.body[].position] - Position dans la colonne
   * @param {number|null} [req.body[].stageId] - ID de la colonne (null si archivée)
   * @param {boolean} [req.body[].isHistorized] - Tâche historisée ou non
   * @param {string|null} [req.body[].historizationDate] - Date d'historisation
   * @param {string|null} [req.body[].startDate] - Date de début
   * @param {string|null} [req.body[].notifiedAt] - Date d'envoi du rappel
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Array<Object>|{error: string}>} Tableau des tâches complètes mises à jour ou message d'erreur
   */
  fastify.patch(
    '/tasks/batch',
    {
      schema: {
        description: 'Met à jour plusieurs tâches en une seule requête',
        tags: ['Task'],
        body: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              title: requiredLabel,
              version: { type: 'string' },
              description: { type: 'string' },
              position: { type: 'integer' },
              stageId: { type: ['integer', 'null'] },
              isHistorized: { type: 'boolean' },
              historizationDate: {
                type: ['string', 'null'],
                format: 'date-time',
              },
              startDate: { type: ['string', 'null'], format: 'date-time' },
              notifiedAt: { type: ['string', 'null'], format: 'date-time' },
            },
            required: ['id'],
            // Ni les tags ni la checklist ne se modifient en batch, d'où un 400 plutôt
            // qu'une erreur Prisma (500)
            not: { anyOf: [{ required: ['tags'] }, { required: ['checklistItems'] }] },
          },
        },
        response: {
          // Tâches complètes : le store remplace ses entrées de cache par ces objets
          200: {
            type: 'array',
            items: taskSchema,
          },
        },
      },
    },
    async (req, reply) => {
      const tasks = req.body as Array<Partial<PrismaTask> & { id: number }>

      if (!tasks.length) {
        return reply.status(400).send({ error: 'Le tableau de tâches est vide' })
      }

      const now = new Date()

      try {
        // On fait un update pour chaque tâche, dans une transaction
        const updatedTasks = await prisma.$transaction((tx) => updateTaskBatch(tx, tasks, now))

        Logger.info(`Batch : ${updatedTasks.length} tâche(s) mise(s) à jour`)
        return updatedTasks
      } catch (error) {
        Logger.error(`Erreur lors de la mise à jour batch de ${tasks.length} tâche(s) :`, error)
        return reply.status(500).send({ error: 'Impossible de mettre à jour les tâches' })
      }
    },
  )
}
