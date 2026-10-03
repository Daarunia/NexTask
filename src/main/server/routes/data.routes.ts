import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { tagKey } from '../helpers/tag.helper.js'
import { APP_VERSION } from '../../constants.js'
import { type DataCounts, EXPORT_FORMAT, EXPORT_VERSION } from '../../shared/data.constants.js'
import { exportedRecurrenceSchema } from '../schemas/recurrenceSchema.js'

// Taille maximale d'un fichier importé (Fastify limite les corps à 1 Mo par défaut)
const IMPORT_BODY_LIMIT = 100 * 1024 * 1024

// Date optionnelle d'un export (null = absente)
const nullableDate = { type: ['string', 'null'], format: 'date-time' }

/** Colonne exportée. */
const exportedStageSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    position: { type: 'integer' },
  },
  required: ['id', 'name', 'position'],
}

/** Tag exporté. */
const exportedTagSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', pattern: String.raw`\S` },
    // nom de couleur de la palette (ex. "sky")
    color: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'color'],
}

/** Tâche exportée, archivée ou non, ses tags désignés par leur id. */
const exportedTaskSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    position: { type: 'integer' },
    isHistorized: { type: 'boolean' },
    historizationDate: nullableDate,
    // null pour une tâche archivée (détachée de sa colonne)
    stageId: { type: ['integer', 'null'] },
    startDate: nullableDate,
    notifiedAt: nullableDate,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    tagIds: { type: 'array', items: { type: 'integer' } },
    // Série dont la tâche est une occurrence (absente des exports antérieurs aux séries)
    recurrenceId: { type: ['integer', 'null'] },
    occurrenceDate: nullableDate,
  },
  required: ['id', 'title', 'description', 'version', 'position', 'isHistorized', 'stageId', 'tagIds'],
}

/**
 * Fichier d'export complet. Format et version sont contrôlés par la route
 * d'import elle-même, pour un message d'erreur explicite.
 */
const exportSchema = {
  type: 'object',
  properties: {
    format: { type: 'string' },
    version: { type: 'integer' },
    appVersion: { type: 'string' },
    exportedAt: { type: 'string', format: 'date-time' },
    stages: { type: 'array', items: exportedStageSchema },
    tags: { type: 'array', items: exportedTagSchema },
    tasks: { type: 'array', items: exportedTaskSchema },
    // Séries récurrentes, facultatives : un export antérieur aux séries reste importable
    recurrences: { type: 'array', items: exportedRecurrenceSchema },
  },
  required: ['format', 'version', 'stages', 'tags', 'tasks'],
}

/** Nombre d'éléments importés. */
const countsSchema = {
  type: 'object',
  properties: {
    stages: { type: 'integer' },
    tags: { type: 'integer' },
    tasks: { type: 'integer' },
  },
}

/**
 * Fichier refusé : même forme que les erreurs de validation de Fastify, le
 * détail étant dans `message`.
 */
const importErrorSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
}

/** Fichier d'import, une fois validé par Fastify. */
interface DataImportBody {
  format: string
  version: number
  stages: { id: number; name: string; position: number }[]
  tags: { id: number; name: string; color: string; createdAt?: string }[]
  tasks: {
    id: number
    title: string
    description: string
    version: string
    position: number
    isHistorized: boolean
    historizationDate?: string | null
    stageId: number | null
    startDate?: string | null
    notifiedAt?: string | null
    createdAt?: string
    updatedAt?: string
    tagIds: number[]
    recurrenceId?: number | null
    occurrenceDate?: string | null
  }[]
  recurrences?: {
    id: number
    frequency: string
    interval: number
    weekdays?: string | null
    monthlyMode?: string | null
    time: string
    startsAt: string
    endType: string
    endsOn?: string | null
    maxCount?: number | null
    generatedCount?: number
    skipIfPending?: boolean
    status: string
    nextRunAt?: string | null
    title: string
    description: string
    version: string
    stageId?: number | null
    createdAt?: string
    updatedAt?: string
    tagIds?: number[]
  }[]
}

/**
 * Premier doublon d'une liste de clés, ou `undefined`.
 *
 * @param keys Clés à contrôler
 */
function firstDuplicate<T>(keys: T[]): T | undefined {
  const seen = new Set<T>()
  for (const key of keys) {
    if (seen.has(key)) return key
    seen.add(key)
  }
  return undefined
}

/**
 * Contrôle du fichier au-delà de sa structure (déjà validée par le schéma) :
 * format, version, ids uniques, noms de tags uniques sans tenir compte de la
 * casse, références des tâches et des séries vers des colonnes, des tags et
 * des séries du fichier, et une seule occurrence par date dans chaque série.
 *
 * @param data Fichier reçu
 * @returns Le motif du refus, ou `null` si le fichier est importable
 */
function findImportProblem(data: DataImportBody): string | null {
  if (data.format !== EXPORT_FORMAT) return "Ce fichier n'est pas un export NexTask"
  if (data.version !== EXPORT_VERSION) {
    return `Version de format ${data.version} non prise en charge (version attendue : ${EXPORT_VERSION})`
  }

  const duplicateStage = firstDuplicate(data.stages.map((stage) => stage.id))
  if (duplicateStage !== undefined) return `Colonne ${duplicateStage} présente plusieurs fois`

  const duplicateTag = firstDuplicate(data.tags.map((tag) => tag.id))
  if (duplicateTag !== undefined) return `Tag ${duplicateTag} présent plusieurs fois`

  const duplicateName = firstDuplicate(data.tags.map((tag) => tagKey(tag.name.trim())))
  if (duplicateName !== undefined) return `Plusieurs tags portent le nom « ${duplicateName} »`

  const duplicateTask = firstDuplicate(data.tasks.map((task) => task.id))
  if (duplicateTask !== undefined) return `Tâche ${duplicateTask} présente plusieurs fois`

  const recurrences = data.recurrences ?? []
  const duplicateRecurrence = firstDuplicate(recurrences.map((recurrence) => recurrence.id))
  if (duplicateRecurrence !== undefined) return `Série ${duplicateRecurrence} présente plusieurs fois`

  const stageIds = new Set(data.stages.map((stage) => stage.id))
  const tagIds = new Set(data.tags.map((tag) => tag.id))
  const recurrenceIds = new Set(recurrences.map((recurrence) => recurrence.id))

  for (const recurrence of recurrences) {
    if (recurrence.stageId != null && !stageIds.has(recurrence.stageId)) {
      return `La série ${recurrence.id} référence une colonne absente du fichier (${recurrence.stageId})`
    }
    const unknownTag = (recurrence.tagIds ?? []).find((id) => !tagIds.has(id))
    if (unknownTag !== undefined) return `La série ${recurrence.id} référence un tag absent du fichier (${unknownTag})`
  }

  for (const task of data.tasks) {
    if (task.stageId !== null && !stageIds.has(task.stageId)) {
      return `La tâche ${task.id} référence une colonne absente du fichier (${task.stageId})`
    }
    const unknownTag = task.tagIds.find((id) => !tagIds.has(id))
    if (unknownTag !== undefined) return `La tâche ${task.id} référence un tag absent du fichier (${unknownTag})`
    if (task.recurrenceId != null && !recurrenceIds.has(task.recurrenceId)) {
      return `La tâche ${task.id} référence une série absente du fichier (${task.recurrenceId})`
    }
  }

  // Une seule occurrence par date dans chaque série (contrainte d'unicité en base)
  const occurrences = data.tasks
    .filter((task) => task.recurrenceId != null && task.occurrenceDate)
    .map((task) => `${task.recurrenceId}|${new Date(task.occurrenceDate as string).getTime()}`)
  const duplicateOccurrence = firstDuplicate(occurrences)
  if (duplicateOccurrence !== undefined) {
    return `Plusieurs tâches de la série ${duplicateOccurrence.split('|')[0]} sont prévues à la même date`
  }

  return null
}

/**
 * Plugin de routes Fastify pour l'export et l'import de toutes les données
 * (colonnes, tâches archivées comprises, tags, séries récurrentes). Les
 * paramètres de l'app n'en font pas partie.
 *
 * Appelées par le main (boîtes de dialogue d'enregistrement et d'ouverture,
 * cf. system/dataTransfer) et directement par les tests E2E :
 * - GET  /data/export  → Renvoie toutes les données au format d'export
 * - POST /data/import  → Remplace toutes les données par celles d'un export
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function dataRoutes(fastify) {
  /**
   * GET /data/export
   *
   * Renvoie toutes les colonnes, tous les tags, toutes les tâches (archivées
   * comprises, tags désignés par leur id) et toutes les séries récurrentes
   * (règle, état et modèle des occurrences), avec l'identifiant et la version
   * du format. Les ids sont conservés, l'import les reprend tels quels.
   *
   * @returns {Promise<Object>} Données au format d'export
   */
  fastify.get(
    '/data/export',
    {
      schema: {
        description: 'Exporte toutes les colonnes, tâches (archivées comprises), tags et séries récurrentes',
        tags: ['Data'],
        response: { 200: exportSchema },
      },
    },
    async () => {
      // Lecture groupée : un instantané cohérent des quatre tables
      const [stages, tags, tasks, recurrences] = await prisma.$transaction([
        prisma.stage.findMany({
          select: { id: true, name: true, position: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
        prisma.tag.findMany({ select: { id: true, name: true, color: true, createdAt: true }, orderBy: { id: 'asc' } }),
        prisma.task.findMany({ include: { tags: { select: { id: true } } }, orderBy: { id: 'asc' } }),
        prisma.recurrence.findMany({ include: { tags: { select: { id: true } } }, orderBy: { id: 'asc' } }),
      ])

      Logger.info(
        `Export : ${stages.length} colonne(s), ${tags.length} tag(s), ${tasks.length} tâche(s), ${recurrences.length} série(s)`,
      )

      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date(),
        stages,
        tags,
        tasks: tasks.map(({ tags: taskTags, ...task }) => ({
          ...task,
          tagIds: taskTags.map((tag) => tag.id).sort((a, b) => a - b),
        })),
        recurrences: recurrences.map(({ tags: recurrenceTags, ...recurrence }) => ({
          ...recurrence,
          tagIds: recurrenceTags.map((tag) => tag.id).sort((a, b) => a - b),
        })),
      }
    },
  )

  /**
   * POST /data/import
   *
   * Remplace toutes les colonnes, tâches, tags et séries par ceux d'un export
   * (sans clé `recurrences`, la base n'a plus aucune série). Le
   * fichier est entièrement contrôlé avant toute écriture (structure, format,
   * version, cohérence des références), puis l'import se fait dans une seule
   * transaction : un fichier refusé ou une erreur en cours de route ne
   * modifient rien.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Fichier d'export (cf. GET /data/export)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object>} Nombre de colonnes, tags et tâches importés, 400 si le
   *   fichier est refusé (détail dans `message`), 500 si l'écriture échoue
   */
  fastify.post(
    '/data/import',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      schema: {
        description: 'Remplace toutes les données par celles d’un export (colonnes, tâches, tags, séries)',
        tags: ['Data'],
        body: exportSchema,
        response: {
          200: countsSchema,
          400: importErrorSchema,
          500: importErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const data = req.body as DataImportBody

      const problem = findImportProblem(data)
      if (problem) {
        Logger.warn(`Import refusé : ${problem}`)
        reply.code(400)
        return { statusCode: 400, error: 'Bad Request', message: problem }
      }

      try {
        // Ordre des suppressions : les tâches référencent les séries et les
        // colonnes, les séries les colonnes (clés étrangères), leurs liens avec
        // les tags partent en cascade
        await prisma.$transaction(
          async (tx) => {
            await tx.task.deleteMany()
            await tx.recurrence.deleteMany()
            await tx.tag.deleteMany()
            await tx.stage.deleteMany()

            // Champs repris un par un : une propriété inconnue du fichier n'atteint pas Prisma
            await tx.stage.createMany({
              data: data.stages.map(({ id, name, position }) => ({ id, name, position })),
            })
            await tx.tag.createMany({
              data: data.tags.map((tag) => {
                const name = tag.name.trim()
                return { id: tag.id, name, nameKey: tagKey(name), color: tag.color, createdAt: tag.createdAt }
              }),
            })

            // Séries avant les tâches, qui les référencent
            for (const recurrence of data.recurrences ?? []) {
              await tx.recurrence.create({
                data: {
                  id: recurrence.id,
                  frequency: recurrence.frequency,
                  interval: recurrence.interval,
                  weekdays: recurrence.weekdays,
                  monthlyMode: recurrence.monthlyMode,
                  time: recurrence.time,
                  startsAt: recurrence.startsAt,
                  endType: recurrence.endType,
                  endsOn: recurrence.endsOn,
                  maxCount: recurrence.maxCount,
                  generatedCount: recurrence.generatedCount,
                  skipIfPending: recurrence.skipIfPending,
                  status: recurrence.status,
                  nextRunAt: recurrence.nextRunAt,
                  title: recurrence.title,
                  description: recurrence.description,
                  version: recurrence.version,
                  stageId: recurrence.stageId,
                  createdAt: recurrence.createdAt,
                  updatedAt: recurrence.updatedAt,
                  tags: { connect: (recurrence.tagIds ?? []).map((id) => ({ id })) },
                },
              })
            }

            for (const task of data.tasks) {
              await tx.task.create({
                data: {
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  version: task.version,
                  position: task.position,
                  isHistorized: task.isHistorized,
                  historizationDate: task.historizationDate,
                  stageId: task.stageId,
                  startDate: task.startDate,
                  notifiedAt: task.notifiedAt,
                  createdAt: task.createdAt,
                  updatedAt: task.updatedAt,
                  recurrenceId: task.recurrenceId,
                  occurrenceDate: task.occurrenceDate,
                  tags: { connect: task.tagIds.map((id) => ({ id })) },
                },
              })
            }
          },
          // Un gros fichier dépasse le délai par défaut (5 s) d'une transaction interactive
          { timeout: 120_000 },
        )
      } catch (error) {
        Logger.error("Erreur lors de l'import des données, base inchangée :", error)
        reply.code(500)
        return { statusCode: 500, error: 'Internal Server Error', message: "L'import a échoué, aucune donnée modifiée" }
      }

      const counts: DataCounts = { stages: data.stages.length, tags: data.tags.length, tasks: data.tasks.length }
      Logger.info(`Import : ${counts.stages} colonne(s), ${counts.tags} tag(s), ${counts.tasks} tâche(s)`)
      return counts
    },
  )
}
