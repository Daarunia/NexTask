import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { Prisma } from '../../prisma/generated/prisma/client.js'
import {
  checklistTemplateItemsSchema,
  checklistTemplateNameSchema,
  checklistTemplateSchema,
} from '../schemas/checklistSchema.js'
import { idParam, errorResponse, messageResponse } from '../schemas/common.js'
import {
  findTemplateByName,
  nextTemplatePosition,
  templateInclude,
  templateItemRows,
  templateKey,
  templateWhere,
} from '../helpers/checklist.helper.js'

const NAME_TAKEN = 'Un modèle porte déjà ce nom'
const NOT_FOUND = 'Modèle non trouvé'

/**
 * Vrai pour une violation de contrainte unique (code Prisma `P2002`), filet
 * du contrôle d'unicité du nom fait avant l'écriture.
 *
 * @param error Erreur levée par Prisma
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * Plugin de routes Fastify pour les modèles de checklist (`Checklist` sans
 * tâche). Les checklists des tâches passent par les routes des tâches, et
 * toutes les routes ci-dessous les ignorent (un id de checklist de tâche
 * répond 404).
 * - GET    /checklist-templates       → Liste les modèles dans leur ordre
 * - POST   /checklist-templates       → Crée un modèle en fin de liste
 * - PATCH  /checklist-templates/:id   → Renomme un modèle et/ou remplace ses points
 * - DELETE /checklist-templates/:id   → Supprime un modèle, sans effet sur les tâches
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function checklistTemplateRoutes(fastify) {
  /**
   * GET /checklist-templates
   *
   * Récupère tous les modèles, triés par position, avec leurs points dans
   * l'ordre.
   *
   * @returns {Promise<Array<Object>>} Tableau de modèles
   */
  fastify.get(
    '/checklist-templates',
    {
      schema: {
        description: 'Récupère tous les modèles de checklist, triés par position, avec leurs points',
        tags: ['ChecklistTemplate'],
        response: { 200: { type: 'array', items: checklistTemplateSchema } },
      },
    },
    async () => {
      return prisma.checklist.findMany({
        where: templateWhere,
        include: templateInclude,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      })
    },
  )

  /**
   * POST /checklist-templates
   *
   * Crée un modèle en fin de liste. Le nom est nettoyé (trim) et doit être
   * unique sans tenir compte de la casse. Les textes des points sont nettoyés,
   * les vides retirés, et aucun point n'est coché. Un modèle sans point est
   * accepté (« Nouveau modèle » de la page Checklists).
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Données du modèle
   * @param {string} req.body.name - Nom du modèle
   * @param {string[]} [req.body.items] - Textes des points, dans l'ordre (aucun par défaut)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Modèle créé (201), 409 si le nom est déjà pris
   */
  fastify.post(
    '/checklist-templates',
    {
      schema: {
        description: 'Crée un modèle de checklist en fin de liste',
        tags: ['ChecklistTemplate'],
        body: {
          type: 'object',
          properties: {
            name: checklistTemplateNameSchema,
            items: checklistTemplateItemsSchema,
          },
          required: ['name'],
        },
        response: {
          201: checklistTemplateSchema,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { name: rawName, items = [] } = req.body as { name: string; items?: string[] }
      const name = rawName.trim()

      try {
        // Transaction : le contrôle d'unicité, la position et la création voient le même état
        return await prisma.$transaction(async (tx) => {
          if (await findTemplateByName(tx, name)) {
            reply.code(409)
            return { error: NAME_TAKEN }
          }

          const created = await tx.checklist.create({
            data: {
              taskId: null,
              name,
              nameKey: templateKey(name),
              position: await nextTemplatePosition(tx),
              items: { create: templateItemRows(items) },
            },
            include: templateInclude,
          })

          Logger.info(`Modèle de checklist ${created.id} « ${name} » créé (${created.items.length} point(s))`)
          reply.code(201)
          return created
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          Logger.warn(`Création du modèle « ${name} » refusée, nom déjà pris`)
          reply.code(409)
          return { error: NAME_TAKEN }
        }
        throw error
      }
    },
  )

  /**
   * PATCH /checklist-templates/:id
   *
   * Renomme un modèle et/ou remplace la liste complète de ses points. Le
   * nouveau nom est nettoyé (trim) et doit rester unique sans tenir compte de
   * la casse, changer seulement la casse de son propre nom est autorisé. Les
   * points envoyés remplacent tous les anciens, dans l'ordre du tableau, sans
   * aucun point coché.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du modèle
   * @param {Object} req.body - Données à mettre à jour (au moins une)
   * @param {string} [req.body.name] - Nouveau nom
   * @param {string[]} [req.body.items] - Textes des points, dans l'ordre
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Modèle mis à jour, 404 si le modèle
   *   n'existe pas, 409 si le nom est déjà pris
   */
  fastify.patch(
    '/checklist-templates/:id',
    {
      schema: {
        description: 'Renomme un modèle de checklist et/ou remplace ses points',
        tags: ['ChecklistTemplate'],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            name: checklistTemplateNameSchema,
            items: checklistTemplateItemsSchema,
          },
          minProperties: 1,
        },
        response: {
          200: checklistTemplateSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { name, items } = req.body as { name?: string; items?: string[] }
      const cleanName = name?.trim()

      try {
        // Transaction : le contrôle d'unicité et le remplacement des points voient le même état
        return await prisma.$transaction(async (tx) => {
          const template = await tx.checklist.findFirst({ where: { ...templateWhere, id } })
          if (!template) {
            reply.code(404)
            return { error: NOT_FOUND }
          }

          if (cleanName !== undefined) {
            const homonym = await findTemplateByName(tx, cleanName)
            if (homonym && homonym.id !== id) {
              reply.code(409)
              return { error: NAME_TAKEN }
            }
          }

          if (items !== undefined) {
            await tx.checklistItem.deleteMany({ where: { checklistId: id } })
            await tx.checklistItem.createMany({
              data: templateItemRows(items).map((row) => ({ ...row, checklistId: id })),
            })
          }

          const updated = await tx.checklist.update({
            where: { id },
            data: {
              name: cleanName,
              nameKey: cleanName === undefined ? undefined : templateKey(cleanName),
            },
            include: templateInclude,
          })

          Logger.info(`Modèle de checklist ${id} mis à jour`)
          return updated
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          Logger.warn(`Renommage du modèle ${id} refusé, nom déjà pris`)
          reply.code(409)
          return { error: NAME_TAKEN }
        }
        throw error
      }
    },
  )

  /**
   * DELETE /checklist-templates/:id
   *
   * Supprime un modèle et ses points (cascade). Les tâches ne sont pas
   * touchées, les points qu'il leur a donnés étant des copies.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du modèle
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès, 404 si
   *   le modèle n'existe pas
   */
  fastify.delete(
    '/checklist-templates/:id',
    {
      schema: {
        description: 'Supprime un modèle de checklist, sans effet sur les tâches',
        tags: ['ChecklistTemplate'],
        params: idParam,
        response: {
          200: messageResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)

      // deleteMany pour filtrer sur taskId, une checklist de tâche n'est jamais supprimée ici
      const { count } = await prisma.checklist.deleteMany({ where: { ...templateWhere, id } })
      if (!count) {
        Logger.warn(`Suppression du modèle de checklist ${id} impossible, modèle introuvable`)
        reply.code(404)
        return { error: NOT_FOUND }
      }

      Logger.info(`Modèle de checklist ${id} supprimé`)
      return { message: 'Modèle supprimé' }
    },
  )
}
