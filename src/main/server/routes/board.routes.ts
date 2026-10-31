import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { Prisma, type Board } from '../../prisma/generated/prisma/client.js'
import {
  boardColorSchema,
  boardColumnsSchema,
  boardNameSchema,
  boardSchema,
  createdBoardSchema,
} from '../schemas/boardSchema.js'
import { errorResponse, idParam } from '../schemas/common.js'
import { taskInclude } from '../helpers/task.helper.js'
import { endSeries, onArchiveStatesChanged } from '../helpers/recurrence.helper.js'
import { DEFAULT_STAGE_KEYS, POSITION_ORDER, findBoardByName, nextBoardPosition } from '../helpers/board.helper.js'
import { boardKey } from '../../shared/board.helper.js'
import type { BoardColumnsMode } from '../../shared/board.constants.js'
import type { TagColor } from '../../shared/tag.constants.js'
import { t } from '../../i18n.js'

const NAME_TAKEN = 'Un tableau porte déjà ce nom'
const NOT_FOUND = 'Tableau non trouvé'

/**
 * Vrai pour une violation de contrainte unique (code Prisma `P2002`), filet
 * du contrôle d'unicité du nom fait avant l'écriture.
 *
 * @param error Erreur levée par Prisma
 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Colonnes d'un nouveau tableau, telles que reçues par POST /boards. */
interface BoardColumns {
  mode: BoardColumnsMode
  fromBoardId?: number
}

/** Colonne à créer dans un nouveau tableau. */
interface StageRow {
  name: string
  position: number
  color: string | null
}

/**
 * Colonnes à créer pour un nouveau tableau. `default` donne les quatre
 * colonnes par défaut dans la langue de l'app, `copy` reprend les noms,
 * couleurs et ordre des colonnes de `fromBoardId` sans leurs tâches, `empty`
 * n'en donne aucune.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param columns Mode reçu, et tableau à copier
 * @returns Colonnes à créer, null si le tableau à copier n'existe pas
 */
async function stageRowsFor(tx: Prisma.TransactionClient, columns: BoardColumns): Promise<StageRow[] | null> {
  if (columns.mode === 'empty') return []
  if (columns.mode === 'default') {
    return DEFAULT_STAGE_KEYS.map((key, position) => ({
      name: t(`boards.defaultStages.${key}`),
      position,
      color: null,
    }))
  }

  const source = await tx.board.findUnique({
    where: { id: columns.fromBoardId as number },
    include: { stages: { orderBy: POSITION_ORDER } },
  })
  if (!source) return null
  // Positions renumérotées dans l'ordre d'affichage, deux positions égales gardant leur ordre
  return source.stages.map((stage, position) => ({ name: stage.name, position, color: stage.color }))
}

/**
 * Plugin de routes Fastify pour les tableaux (Board), chacun regroupant des
 * colonnes et leurs tâches :
 * - GET    /boards        → Liste les tableaux dans leur ordre
 * - POST   /boards        → Crée un tableau en dernier, avec ses colonnes
 * - PATCH  /boards/batch  → Change la position de plusieurs tableaux
 * - PATCH  /boards/:id    → Renomme et/ou recolore un tableau
 * - DELETE /boards/:id    → Supprime un tableau, archive ses tâches et termine ses séries
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function boardRoutes(fastify) {
  /**
   * GET /boards
   *
   * Récupère tous les tableaux, triés par position puis par id. Leurs colonnes
   * se lisent par GET /stages, qui les renvoie toutes avec leur `boardId`.
   *
   * @returns {Promise<Array<Object>>} Tableau d'objets Board
   */
  fastify.get(
    '/boards',
    {
      schema: {
        description: 'Récupère tous les tableaux, triés par position',
        tags: ['Board'],
        response: { 200: { type: 'array', items: boardSchema } },
      },
    },
    async () => {
      return prisma.board.findMany({ orderBy: POSITION_ORDER })
    },
  )

  /**
   * POST /boards
   *
   * Crée un tableau, placé après les autres, et ses colonnes dans la même
   * transaction. Le nom est nettoyé (trim) et doit être unique sans tenir
   * compte de la casse. Les colonnes suivent `columns.mode` (cf. stageRowsFor).
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Données du tableau
   * @param {string} req.body.name - Nom du tableau
   * @param {string|null} [req.body.color] - Couleur parmi TAG_COLORS, null ou absente sans couleur
   * @param {Object} req.body.columns - Colonnes du tableau
   * @param {string} req.body.columns.mode - `default`, `copy` ou `empty`
   * @param {number} [req.body.columns.fromBoardId] - Tableau dont copier les colonnes (mode `copy`)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Tableau créé (201) avec ses colonnes vides,
   *   404 si le tableau à copier n'existe pas, 409 si le nom est déjà pris
   */
  fastify.post(
    '/boards',
    {
      schema: {
        description: 'Crée un tableau en dernier, avec ses colonnes par défaut, copiées ou aucune',
        tags: ['Board'],
        body: {
          type: 'object',
          properties: {
            name: boardNameSchema,
            color: boardColorSchema,
            columns: boardColumnsSchema,
          },
          required: ['name', 'columns'],
        },
        response: {
          201: createdBoardSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      // Champs repris un par un, Fastify laissant passer une propriété non déclarée du corps
      const body = req.body as { name: string; color?: TagColor | null; columns: BoardColumns }
      const name = body.name.trim()
      const color = body.color ?? null
      const columns: BoardColumns = { mode: body.columns.mode, fromBoardId: body.columns.fromBoardId }

      try {
        // Transaction : le contrôle d'unicité, la position et la création voient le même état
        return await prisma.$transaction(async (tx) => {
          if (await findBoardByName(tx, name)) {
            reply.code(409)
            return { error: NAME_TAKEN }
          }

          const stages = await stageRowsFor(tx, columns)
          if (!stages) {
            Logger.warn(`Création du tableau « ${name} » refusée, tableau à copier ${columns.fromBoardId} introuvable`)
            reply.code(404)
            return { error: NOT_FOUND }
          }

          const created = await tx.board.create({
            data: {
              name,
              nameKey: boardKey(name),
              color,
              position: await nextBoardPosition(tx),
              stages: { create: stages },
            },
            include: { stages: { orderBy: POSITION_ORDER, include: { tasks: { include: taskInclude } } } },
          })

          Logger.info(
            `Tableau ${created.id} « ${name} » créé (colonnes ${columns.mode}, ${created.stages.length} colonne(s))`,
          )
          reply.code(201)
          return created
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          Logger.warn(`Création du tableau « ${name} » refusée, nom déjà pris`)
          reply.code(409)
          return { error: NAME_TAKEN }
        }
        throw error
      }
    },
  )

  /**
   * PATCH /boards/batch
   *
   * Change la position de plusieurs tableaux en une requête, dans une
   * transaction (glisser-déposer du sélecteur). Déclarée avant
   * PATCH /boards/:id, pour que `batch` ne soit jamais lu comme un id. Un id
   * inconnu annule tout le lot.
   *
   * @param {Object} req - Requête Fastify
   * @param {Array<Object>} req.body - Tableaux à déplacer
   * @param {number} req.body[].id - ID du tableau
   * @param {number} req.body[].position - Nouvelle position
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Array<Object>|{error: string}>} Tableaux mis à jour, dans l'ordre
   *   reçu, 400 si le lot est vide ou désigne un tableau inconnu
   */
  fastify.patch(
    '/boards/batch',
    {
      schema: {
        description: 'Change la position de plusieurs tableaux en une requête',
        tags: ['Board'],
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
          200: { type: 'array', items: boardSchema },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      // Champs repris un par un, Fastify laissant passer une propriété non déclarée du corps
      const moves = (req.body as { id: number; position: number }[]).map(({ id, position }) => ({ id, position }))
      const ids = new Set(moves.map((move) => move.id))

      // Transaction : aucune position n'est écrite si un id du lot est inconnu
      return prisma.$transaction(async (tx) => {
        const known = await tx.board.count({ where: { id: { in: [...ids] } } })
        if (known !== ids.size) {
          Logger.warn(`Réordonnancement des tableaux refusé, ${ids.size - known} tableau(x) inconnu(s)`)
          reply.code(400)
          return { error: 'Le lot désigne un tableau inconnu' }
        }

        const updated: Board[] = []
        for (const { id, position } of moves) {
          updated.push(await tx.board.update({ where: { id }, data: { position } }))
        }

        Logger.info(`Batch : ${updated.length} tableau(x) déplacé(s)`)
        return updated
      })
    },
  )

  /**
   * PATCH /boards/:id
   *
   * Renomme et/ou recolore un tableau. Le nouveau nom est nettoyé (trim) et
   * doit rester unique sans tenir compte de la casse, changer seulement la
   * casse de son propre nom est autorisé.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du tableau
   * @param {Object} req.body - Données à mettre à jour (au moins une)
   * @param {string} [req.body.name] - Nouveau nom
   * @param {string|null} [req.body.color] - Couleur parmi TAG_COLORS, null pour la retirer
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object|{error: string}>} Tableau mis à jour, 404 si le tableau
   *   n'existe pas, 409 si le nom est déjà pris
   */
  fastify.patch(
    '/boards/:id',
    {
      schema: {
        description: 'Renomme et/ou recolore un tableau',
        tags: ['Board'],
        params: idParam,
        body: {
          type: 'object',
          properties: {
            name: boardNameSchema,
            color: boardColorSchema,
          },
          minProperties: 1,
        },
        response: {
          200: boardSchema,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      // Champs repris un par un, Fastify laissant passer une propriété non déclarée du corps
      const { name, color } = req.body as { name?: string; color?: TagColor | null }
      const cleanName = name?.trim()

      try {
        // Transaction : le contrôle d'unicité et l'écriture voient le même état
        return await prisma.$transaction(async (tx) => {
          const board = await tx.board.findUnique({ where: { id }, select: { id: true } })
          if (!board) {
            reply.code(404)
            return { error: NOT_FOUND }
          }

          if (cleanName !== undefined) {
            const homonym = await findBoardByName(tx, cleanName)
            if (homonym && homonym.id !== id) {
              reply.code(409)
              return { error: NAME_TAKEN }
            }
          }

          const updated = await tx.board.update({
            where: { id },
            data: {
              name: cleanName,
              nameKey: cleanName === undefined ? undefined : boardKey(cleanName),
              color,
            },
          })

          Logger.info(`Tableau ${id} mis à jour`)
          return updated
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          Logger.warn(`Renommage du tableau ${id} refusé, nom déjà pris`)
          reply.code(409)
          return { error: NAME_TAKEN }
        }
        throw error
      }
    },
  )

  /**
   * DELETE /boards/:id
   *
   * Supprime un tableau, dans une transaction. Ses tâches actives sont
   * archivées (sans colonne, datées de maintenant), et les séries « après
   * archivage » ainsi libérées suivent (cf. onArchiveStatesChanged), comme
   * pour DELETE /stages/:id. Ses séries en cours sont ensuite terminées, puis
   * le tableau est supprimé. Ses colonnes partent en cascade, ses tâches
   * archivées et ses séries gardent leur place dans les archives et la liste
   * des séries, avec `boardId` à null. Le dernier tableau ne se supprime pas,
   * l'app en exige au moins un.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.params - Paramètres de la requête
   * @param {number} req.params.id - ID du tableau
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string, archived: number}|{error: string}>} Message de succès et
   *   nombre de tâches archivées, 404 si le tableau n'existe pas, 409 s'il est le dernier
   */
  fastify.delete(
    '/boards/:id',
    {
      schema: {
        description: 'Supprime un tableau, archive ses tâches actives et termine ses séries',
        tags: ['Board'],
        params: idParam,
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              // Nombre de tâches actives archivées avec le tableau
              archived: { type: 'integer' },
            },
          },
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const now = new Date()

      // Transaction : si la suppression échoue, aucune tâche n'est archivée et aucune série terminée
      const result = await prisma.$transaction(async (tx) => {
        const board = await tx.board.findUnique({ where: { id }, select: { id: true } })
        if (!board) return { error: 404 as const }
        if ((await tx.board.count()) <= 1) return { error: 409 as const }

        // Tâches de ses colonnes, et tâches actives qui le désignent (filet de la règle d'or)
        const where = { OR: [{ stage: { boardId: id } }, { boardId: id, isHistorized: false }] }
        const tasks = await tx.task.findMany({ where, select: { id: true, recurrenceId: true, isHistorized: true } })
        await tx.task.updateMany({ where, data: { isHistorized: true, historizationDate: now, stageId: null } })

        // Occurrences archivées avec leur tableau, séries « après archivage » libérées
        await onArchiveStatesChanged(
          tx,
          tasks.map((task) => ({
            wasArchived: task.isHistorized,
            task: { recurrenceId: task.recurrenceId, isHistorized: true, historizationDate: now },
          })),
          now,
        )

        // Séries du tableau, ou dont le modèle vise l'une de ses colonnes
        const series = await tx.recurrence.findMany({
          where: { status: { not: 'ended' }, OR: [{ boardId: id }, { stage: { boardId: id } }] },
        })
        for (const item of series) await endSeries(tx, item)

        await tx.board.delete({ where: { id } })
        return { archived: tasks.length, ended: series.length }
      })

      if ('error' in result) {
        if (result.error === 404) {
          Logger.warn(`Suppression du tableau ${id} impossible, tableau introuvable`)
          reply.code(404)
          return { error: NOT_FOUND }
        }
        Logger.warn(`Suppression du tableau ${id} refusée, c'est le dernier tableau`)
        reply.code(409)
        return { error: 'Le dernier tableau ne peut pas être supprimé' }
      }

      Logger.info(
        `Tableau ${id} supprimé, ${result.archived} tâche(s) archivée(s), ${result.ended} série(s) terminée(s)`,
      )
      return { message: 'Tableau supprimé', archived: result.archived }
    },
  )
}
