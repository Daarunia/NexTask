import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { Prisma } from '../../prisma/generated/prisma/client.js'
import {
  checklistTemplateItemsSchema,
  checklistTemplateNameSchema,
  checklistTemplateSchema,
} from '../schemas/checklistSchema.js'
import { errorResponse } from '../schemas/common.js'
import {
  findTemplateByName,
  nextTemplatePosition,
  templateInclude,
  templateItemRows,
  templateKey,
  templateWhere,
} from '../helpers/checklist.helper.js'

const NAME_TAKEN = 'Un modèle porte déjà ce nom'

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
 * - GET    /checklist-templates   → Liste les modèles dans leur ordre
 * - POST   /checklist-templates   → Crée un modèle en fin de liste
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
}
