import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { Prisma } from '../../prisma/generated/prisma/client.js'
import {
  checklistTemplateItemsSchema,
  checklistTemplateNameSchema,
  checklistTemplateSchema,
} from '../schemas/checklistSchema.js'
import { idParam, errorResponse, messageResponse } from '../schemas/common.js'
import { t } from '../../i18n.js'
import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } from '../../shared/checklist.constants.js'
import {
  duplicateName,
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
 * Nom de la copie d'un modèle, « Nom (copie) » dans la langue de l'app. Le nom
 * d'origine est raccourci si besoin pour que le suffixe tienne dans la
 * longueur maximale.
 *
 * @param name Nom du modèle copié
 */
function copyBaseName(name: string): string {
  const room = CHECKLIST_TEMPLATE_NAME_MAX_LENGTH - t('checklists.copyName', { name: '' }).length
  return t('checklists.copyName', { name: name.slice(0, room).trimEnd() })
}

/**
 * Plugin de routes Fastify pour les modèles de checklist (`Checklist` sans
 * tâche). Les checklists des tâches passent par les routes des tâches, et
 * toutes les routes ci-dessous les ignorent (un id de checklist de tâche
 * répond 404).
 * - GET    /checklist-templates                → Liste les modèles dans leur ordre
 * - POST   /checklist-templates                → Crée un modèle en fin de liste
 * - PATCH  /checklist-templates/batch          → Change la position de plusieurs modèles
 * - PATCH  /checklist-templates/:id            → Renomme un modèle et/ou remplace ses points
 * - POST   /checklist-templates/:id/duplicate  → Copie un modèle sous le nom « Nom (copie) »
 * - DELETE /checklist-templates/:id            → Supprime un modèle, sans effet sur les tâches
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
   * PATCH /checklist-templates/batch
   *
   * Change la position de plusieurs modèles en une requête, dans une
   * transaction (glisser-déposer de la page Checklists). Déclarée avant
   * PATCH /checklist-templates/:id, pour que `batch` ne soit jamais lu comme
   * un id. Un id qui ne désigne pas un modèle annule tout le lot.
   *
   * @param {Object} req - Requête Fastify
   * @param {Array<Object>} req.body - Modèles à déplacer
   * @param {number} req.body[].id - ID du modèle
   * @param {number} req.body[].position - Nouvelle position
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Array<Object>|{error: string}>} Modèles mis à jour, dans l'ordre
   *   reçu, 400 si le tableau est vide ou désigne un modèle inconnu
   */
  fastify.patch(
    '/checklist-templates/batch',
    {
      schema: {
        description: 'Change la position de plusieurs modèles de checklist en une requête',
        tags: ['ChecklistTemplate'],
        body: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              position: { type: 'integer', minimum: 0 },
            },
            required: ['id', 'position'],
          },
        },
        response: {
          200: { type: 'array', items: checklistTemplateSchema },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const moves = req.body as { id: number; position: number }[]
      const ids = new Set(moves.map((move) => move.id))

      // Transaction : aucune position n'est écrite si un id du lot est inconnu
      return prisma.$transaction(async (tx) => {
        const known = await tx.checklist.count({ where: { ...templateWhere, id: { in: [...ids] } } })
        if (known !== ids.size) {
          Logger.warn(`Réordonnancement des modèles refusé, ${ids.size - known} modèle(s) inconnu(s)`)
          reply.code(400)
          return { error: 'Le lot désigne un modèle inconnu' }
        }

        const updated: Prisma.ChecklistGetPayload<{ include: typeof templateInclude }>[] = []
        for (const { id, position } of moves) {
          updated.push(await tx.checklist.update({ where: { id }, data: { position }, include: templateInclude }))
        }

        Logger.info(`Batch : ${updated.length} modèle(s) de checklist déplacé(s)`)
        return updated
      })
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
   * POST /checklist-templates/:id/duplicate
   *
   * Crée en fin de liste une copie du modèle et de ses points, nommée
   * « Nom (copie) » dans la langue de l'app, puis « Nom (copie) 2 »… si ce nom
   * est déjà pris (cf. duplicateName).
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du modèle copié
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Copie créée (201), 404 si le modèle
   *   n'existe pas
   */
  fastify.post(
    '/checklist-templates/:id/duplicate',
    {
      schema: {
        description: 'Duplique un modèle de checklist sous le nom « Nom (copie) »',
        tags: ['ChecklistTemplate'],
        params: idParam,
        response: {
          201: checklistTemplateSchema,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)

      // Transaction : les noms pris, la position et la création voient le même état
      return prisma.$transaction(async (tx) => {
        const source = await tx.checklist.findFirst({ where: { ...templateWhere, id }, include: templateInclude })
        if (!source) {
          reply.code(404)
          return { error: NOT_FOUND }
        }

        const taken = await tx.checklist.findMany({ where: templateWhere, select: { nameKey: true } })
        const takenKeys = new Set(taken.map((template) => template.nameKey).filter((key) => key !== null))
        const name = duplicateName(copyBaseName(source.name ?? ''), takenKeys)

        const created = await tx.checklist.create({
          data: {
            taskId: null,
            name,
            nameKey: templateKey(name),
            position: await nextTemplatePosition(tx),
            items: { create: templateItemRows(source.items.map((item) => item.text)) },
          },
          include: templateInclude,
        })

        Logger.info(`Modèle de checklist ${id} dupliqué en ${created.id} « ${name} »`)
        reply.code(201)
        return created
      })
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
