import { prisma } from '../prismaClient.js'
import { Prisma, type Task as PrismaTask } from '../../prisma/generated/prisma/client.js'
import { taskSchema } from '../schemas/taskSchema.js'
import { tagNameSchema } from '../schemas/tagSchema.js'
import { idParam, errorResponse, messageResponse, requiredLabel } from '../schemas/common.js'
import { resolveTagIds } from '../helpers/tag.helper.js'
import Logger from 'electron-log'

// Relations renvoyées avec chaque tâche : ses tags, triés par nom.
const taskInclude = { tags: { orderBy: { name: 'asc' } } } as const

// Noms des tags d'une tâche, rapprochés ou créés par le serveur (cf. tag.helper)
const taskTagsBody = {
  type: 'array',
  items: tagNameSchema,
}

/** Corps de POST /tasks, une fois validé par Fastify. */
type TaskCreateBody = Omit<Prisma.TaskUncheckedCreateInput, 'tags'> & { tags?: string[] }

/** Corps de PATCH /tasks/:id, une fois validé par Fastify. */
type TaskUpdateBody = Omit<Prisma.TaskUncheckedUpdateInput, 'tags'> & { tags?: string[] }

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
 * - POST   /tasks/:id/restore → Restaure une tâche archivée en bas de la première colonne
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
   * de la casse) sont réutilisés, les autres créés. Tags et tâche sont écrits
   * dans une même transaction.
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
   * @returns {Promise<Object>} Objet Task créé, avec ses tags
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
          },
          required: ['stageId', 'position', 'title', 'version', 'description'],
        },
        response: { 200: taskSchema },
      },
    },
    async (req) => {
      const { tags, ...data } = req.body as TaskCreateBody

      return prisma.$transaction(async (tx) => {
        const tagIds = tags ? await resolveTagIds(tx, tags) : []
        return tx.task.create({
          data: { ...data, tags: { connect: tagIds.map((tagId) => ({ id: tagId })) } },
          include: taskInclude,
        })
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
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {Object} req.body - Données à mettre à jour
   * @param {string[]} [req.body.tags] - Noms des tags de la tâche (remplacent les actuels)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task mis à jour avec ses tags,
   *   404 si la tâche n'existe pas, 500 pour toute autre erreur
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
          },
        },
        response: {
          200: taskSchema,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { tags, ...data } = req.body as TaskUpdateBody

      // Si la startDate est repoussée dans le futur, on réarme la notification.
      if (data.startDate && new Date(data.startDate as string) > new Date()) {
        data.notifiedAt = null
      }

      try {
        // Transaction : si la tâche n'existe pas, aucun tag n'est créé
        return await prisma.$transaction(async (tx) => {
          const tagIds = tags === undefined ? undefined : await resolveTagIds(tx, tags)

          return tx.task.update({
            where: { id },
            data: {
              ...data,
              ...(tagIds && { tags: { set: tagIds.map((tagId) => ({ id: tagId })) } }),
            },
            include: taskInclude,
          })
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
   * DELETE /tasks/:id
   *
   * Supprime une tâche par son ID.
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
        await prisma.task.delete({ where: { id } })
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
   * Met à jour une tâche en la marquant comme historisée.
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
      try {
        // Mise à jour de la tâche pour la marquer comme historisée
        const updatedTask = await prisma.task.update({
          where: { id },
          data: {
            isHistorized: true,
            historizationDate: new Date(),
            stageId: null,
          },
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
   * Restaure une tâche archivée : elle quitte les archives et reprend place en
   * bas de la première colonne du tableau (plus petite position). Ses tags
   * sont conservés.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID de la tâche
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Objet Task restauré avec ses tags, 404 si la
   *   tâche n'existe pas, 409 si elle n'est pas archivée ou s'il n'y a aucune colonne
   */
  fastify.post(
    '/tasks/:id/restore',
    {
      schema: {
        description: 'Restaure une tâche archivée en bas de la première colonne',
        tags: ['Task'],
        params: idParam,
        response: {
          200: taskSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)

      // Transaction : la position calculée reste la dernière au moment de l'écriture
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

        const firstStage = await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] })
        if (!firstStage) {
          reply.code(409)
          return { error: 'Aucune colonne pour restaurer la tâche' }
        }

        // En bas de la colonne : après la plus grande position de ses tâches actives
        const { _max } = await tx.task.aggregate({
          where: { stageId: firstStage.id, isHistorized: false },
          _max: { position: true },
        })

        const restored = await tx.task.update({
          where: { id },
          data: {
            isHistorized: false,
            historizationDate: null,
            stageId: firstStage.id,
            position: (_max.position ?? -1) + 1,
          },
          include: taskInclude,
        })

        Logger.info(`Tâche ${id} restaurée dans la colonne ${firstStage.id}`)
        return restored
      })
    },
  )

  /**
   * PATCH /tasks/batch
   *
   * Met à jour plusieurs tâches en une seule requête.
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
            // Les tags ne se modifient pas en batch : 400 plutôt qu'une erreur Prisma (500)
            not: { required: ['tags'] },
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
        const updatedTasks = await prisma.$transaction(
          tasks.map((t) => {
            const data = { ...t }

            // startDate repoussée dans le futur → on réarme la notification.
            if (data.startDate && new Date(data.startDate) > now) {
              data.notifiedAt = null
            }

            return prisma.task.update({
              where: { id: t.id },
              data,
              include: taskInclude,
            })
          }),
        )

        Logger.info(`Batch : ${updatedTasks.length} tâche(s) mise(s) à jour`)
        return updatedTasks
      } catch (error) {
        Logger.error(`Erreur lors de la mise à jour batch de ${tasks.length} tâche(s) :`, error)
        return reply.status(500).send({ error: 'Impossible de mettre à jour les tâches' })
      }
    },
  )
}
