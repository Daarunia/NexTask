import { prisma } from '../prismaClient.js'
import { tagSchema } from '../schemas/tagSchema.js'

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
}
