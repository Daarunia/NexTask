import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { Prisma } from '../../prisma/generated/prisma/client.js'
import { tagSchema, tagNameSchema } from '../schemas/tagSchema.js'
import { idParam, errorResponse, messageResponse } from '../schemas/common.js'
import { findTagByName } from '../helpers/tag.helper.js'
import { TAG_COLORS, type TagColor } from '../../constants.js'

// Nombre de tâches (actives et historisées) qui portent le tag
const taskCountInclude = { _count: { select: { tasks: true } } } as const

/**
 * Met un tag Prisma accompagné de `_count` à la forme de la réponse API.
 *
 * @param tag Tag Prisma avec son compteur de tâches
 * @returns Tag avec `taskCount` à la place de `_count`
 */
function toTagResponse(tag: { id: number; name: string; color: string; _count: { tasks: number } }) {
  return { id: tag.id, name: tag.name, color: tag.color, taskCount: tag._count.tasks }
}

/**
 * Plugin de routes Fastify pour la gestion des tags (Tag)
 *
 * Les tags sont créés à la volée par les routes des tâches (POST / PATCH
 * /tasks), il n'y a donc pas d'endpoint de création :
 * - GET    /tags       → Liste tous les tags avec leur nombre de tâches
 * - PATCH  /tags/:id   → Renomme et/ou recolore un tag
 * - DELETE /tags/:id   → Supprime un tag et le retire de toutes les tâches
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function tagRoutes(fastify) {
  /**
   * GET /tags
   *
   * Récupère la liste complète des tags, triés par nom, avec le nombre de
   * tâches qui les portent (`taskCount`).
   *
   * @returns {Promise<Array<Object>>} Tableau d'objets Tag
   */
  fastify.get(
    '/tags',
    {
      schema: {
        description: 'Récupère tous les tags triés par nom, avec leur nombre de tâches',
        tags: ['Tag'],
        response: { 200: { type: 'array', items: tagSchema } },
      },
    },
    async () => {
      const tags = await prisma.tag.findMany({
        include: taskCountInclude,
        orderBy: { name: 'asc' },
      })
      return tags.map(toTagResponse)
    },
  )

  /**
   * PATCH /tags/:id
   *
   * Renomme et/ou recolore un tag. Le nouveau nom est nettoyé (trim) et doit
   * rester unique sans tenir compte de la casse : changer uniquement la casse
   * de son propre nom est autorisé, reprendre le nom d'un autre tag ne l'est pas.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du tag
   * @param {Object} req.body - Données à mettre à jour (au moins une)
   * @param {string} [req.body.name] - Nouveau nom
   * @param {string} [req.body.color] - Nouvelle couleur, parmi TAG_COLORS
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Tag mis à jour avec `taskCount`,
   *   404 si le tag n'existe pas, 409 si le nom est déjà pris
   */
  fastify.patch(
    '/tags/:id',
    {
      schema: {
        description: 'Renomme et/ou recolore un tag',
        tags: ['Tag'],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            name: tagNameSchema,
            color: { type: 'string', enum: [...TAG_COLORS] },
          },
          minProperties: 1,
        },
        response: {
          200: tagSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const { name, color } = req.body as { name?: string; color?: TagColor }
      const cleanName = name?.trim()

      // Transaction : le contrôle d'unicité et l'écriture voient le même état
      return prisma.$transaction(async (tx) => {
        const tag = await tx.tag.findUnique({ where: { id } })
        if (!tag) {
          reply.code(404)
          return { error: 'Tag non trouvé' }
        }

        if (cleanName !== undefined) {
          const homonym = await findTagByName(tx, cleanName)
          if (homonym && homonym.id !== id) {
            reply.code(409)
            return { error: 'Un tag porte déjà ce nom' }
          }
        }

        const updated = await tx.tag.update({
          where: { id },
          data: { name: cleanName, color },
          include: taskCountInclude,
        })

        Logger.info(`Tag ${id} mis à jour`)
        return toTagResponse(updated)
      })
    },
  )

  /**
   * DELETE /tags/:id
   *
   * Supprime un tag. Ses liens avec les tâches, actives comme historisées,
   * partent en cascade.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du tag
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}|{error: string}>} Message de succès, 404 si
   *   le tag n'existe pas, 500 pour toute autre erreur
   */
  fastify.delete(
    '/tags/:id',
    {
      schema: {
        description: 'Supprime un tag et le retire de toutes les tâches',
        tags: ['Tag'],
        params: idParam,
        response: {
          200: messageResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      try {
        await prisma.tag.delete({ where: { id } })
        Logger.info(`Tag ${id} supprimé`)
        return { message: 'Tag supprimé' }
      } catch (error) {
        // P2025 : enregistrement à supprimer introuvable
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          Logger.warn(`Suppression du tag ${id} impossible, tag introuvable`)
          reply.code(404)
          return { error: 'Tag non trouvé' }
        }

        Logger.error(`Erreur lors de la suppression du tag ${id} :`, error)
        reply.code(500)
        return { error: 'Impossible de supprimer le tag' }
      }
    },
  )
}
