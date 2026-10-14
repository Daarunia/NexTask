import Logger from 'electron-log'
import { prisma } from '../prismaClient.js'
import { tagKey } from '../helpers/tag.helper.js'
import { APP_VERSION } from '../../constants.js'
import { type DataCounts, EXPORT_FORMAT, EXPORT_VERSION, type ImportProblem } from '../../shared/data.constants.js'
import { translate } from '../../i18n.js'
import { exportedRecurrenceSchema } from '../schemas/recurrenceSchema.js'
import { normalizeImportedSeries, seriesChecklistTexts } from '../helpers/recurrence.helper.js'
import { templateInclude, templateWhere } from '../helpers/checklist.helper.js'
import {
  type ExportedChecklistItem,
  type ExportedChecklistTemplate,
  importedSeriesChecklist,
  importedTaskChecklist,
  planTemplateImport,
} from '../helpers/dataImport.helper.js'

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

/**
 * Point de la checklist d'une tâche exporté. Pas de limite de longueur ici,
 * un texte trop long est raccourci à l'import plutôt que de refuser le fichier.
 */
const exportedChecklistItemSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    isChecked: { type: 'boolean' },
    checkedAt: nullableDate,
  },
  required: ['text'],
}

/**
 * Modèle de checklist exporté, ses points réduits à leurs textes (jamais
 * cochés). Comme pour les points, ni le nom ni les textes ne sont bornés ici.
 */
const exportedChecklistTemplateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', pattern: String.raw`\S` },
    position: { type: 'integer' },
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['name'],
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
    // Points de la checklist dans l'ordre, absents des exports antérieurs aux checklists
    checklistItems: { type: 'array', items: exportedChecklistItemSchema },
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
    // Modèles de checklist, facultatifs : un export antérieur aux checklists reste importable
    checklistTemplates: { type: 'array', items: exportedChecklistTemplateSchema },
  },
  required: ['format', 'version', 'stages', 'tags', 'tasks'],
}

/** Motif de refus ou anomalie d'un import (cf. ImportProblem). */
const importProblemSchema = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    params: { type: 'object', additionalProperties: { type: ['string', 'number'] } },
  },
}

/** Nombre d'éléments importés, et anomalies corrigées en chemin. */
const countsSchema = {
  type: 'object',
  properties: {
    stages: { type: 'integer' },
    tags: { type: 'integer' },
    tasks: { type: 'integer' },
    // Modèles réellement créés, sans ceux du fichier dont le nom était déjà pris
    checklistTemplates: { type: 'integer' },
    // Textes raccourcis, points en trop, modèles en double, importés quand même une fois corrigés
    warnings: { type: 'array', items: importProblemSchema },
  },
}

/**
 * Fichier refusé : même forme que les erreurs de validation de Fastify, le
 * détail étant dans `message` (en français), et le motif à traduire dans
 * `problem` pour un refus après validation de la structure.
 */
const importErrorSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
    problem: importProblemSchema,
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
    checklistItems?: ExportedChecklistItem[]
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
    anchor?: string
    leadDays?: number
    status: string
    nextRunAt?: string | null
    title: string
    description: string
    version: string
    stageId?: number | null
    createdAt?: string
    updatedAt?: string
    tagIds?: number[]
    checklistItems?: string[]
  }[]
  checklistTemplates?: ExportedChecklistTemplate[]
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
 * Premier id (ou nom de tag) en double dans le fichier.
 *
 * @param data Fichier reçu
 * @returns Le motif du refus, ou `null` sans doublon
 */
function findDuplicateProblem(data: DataImportBody): ImportProblem | null {
  const duplicateStage = firstDuplicate(data.stages.map((stage) => stage.id))
  if (duplicateStage !== undefined) return { code: 'duplicateStage', params: { id: duplicateStage } }

  const duplicateTag = firstDuplicate(data.tags.map((tag) => tag.id))
  if (duplicateTag !== undefined) return { code: 'duplicateTag', params: { id: duplicateTag } }

  const duplicateName = firstDuplicate(data.tags.map((tag) => tagKey(tag.name.trim())))
  if (duplicateName !== undefined) return { code: 'duplicateTagName', params: { name: duplicateName } }

  const duplicateTask = firstDuplicate(data.tasks.map((task) => task.id))
  if (duplicateTask !== undefined) return { code: 'duplicateTask', params: { id: duplicateTask } }

  const duplicateRecurrence = firstDuplicate((data.recurrences ?? []).map((recurrence) => recurrence.id))
  if (duplicateRecurrence !== undefined) return { code: 'duplicateRecurrence', params: { id: duplicateRecurrence } }

  return null
}

/**
 * Première référence d'une série ou d'une tâche vers une colonne, un tag ou
 * une série absents du fichier.
 *
 * @param data Fichier reçu
 * @returns Le motif du refus, ou `null` si toutes les références sont connues
 */
function findReferenceProblem(data: DataImportBody): ImportProblem | null {
  const recurrences = data.recurrences ?? []
  const stageIds = new Set(data.stages.map((stage) => stage.id))
  const tagIds = new Set(data.tags.map((tag) => tag.id))
  const recurrenceIds = new Set(recurrences.map((recurrence) => recurrence.id))

  for (const recurrence of recurrences) {
    if (recurrence.stageId != null && !stageIds.has(recurrence.stageId)) {
      return { code: 'recurrenceUnknownStage', params: { id: recurrence.id, ref: recurrence.stageId } }
    }
    const unknownTag = (recurrence.tagIds ?? []).find((id) => !tagIds.has(id))
    if (unknownTag !== undefined)
      return { code: 'recurrenceUnknownTag', params: { id: recurrence.id, ref: unknownTag } }
  }

  for (const task of data.tasks) {
    if (task.stageId !== null && !stageIds.has(task.stageId)) {
      return { code: 'taskUnknownStage', params: { id: task.id, ref: task.stageId } }
    }
    const unknownTag = task.tagIds.find((id) => !tagIds.has(id))
    if (unknownTag !== undefined) return { code: 'taskUnknownTag', params: { id: task.id, ref: unknownTag } }
    if (task.recurrenceId != null && !recurrenceIds.has(task.recurrenceId)) {
      return { code: 'taskUnknownRecurrence', params: { id: task.id, ref: task.recurrenceId } }
    }
  }

  return null
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
function findImportProblem(data: DataImportBody): ImportProblem | null {
  if (data.format !== EXPORT_FORMAT) return { code: 'notAnExport', params: {} }
  if (data.version !== EXPORT_VERSION) {
    return { code: 'unsupportedVersion', params: { version: data.version, expected: EXPORT_VERSION } }
  }

  const problem = findDuplicateProblem(data) ?? findReferenceProblem(data)
  if (problem) return problem

  // Une seule occurrence par date dans chaque série (contrainte d'unicité en base)
  const occurrences = data.tasks
    .filter((task) => task.recurrenceId != null && task.occurrenceDate)
    .map((task) => `${task.recurrenceId}|${new Date(task.occurrenceDate as string).getTime()}`)
  const duplicateOccurrence = firstDuplicate(occurrences)
  if (duplicateOccurrence !== undefined) {
    return { code: 'duplicateOccurrence', params: { id: duplicateOccurrence.split('|')[0] } }
  }

  return null
}

/**
 * Plugin de routes Fastify pour l'export et l'import de toutes les données
 * (colonnes, tâches archivées comprises et leurs checklists, tags, séries
 * récurrentes, modèles de checklist). Les paramètres de l'app n'en font pas
 * partie.
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
   * comprises, tags désignés par leur id, points de checklist avec leur état
   * coché), toutes les séries récurrentes (règle, état et modèle des
   * occurrences, textes des points compris) et tous les modèles de checklist
   * (nom, position, textes des points), avec l'identifiant et la version du
   * format. Les ids sont conservés, l'import les reprend tels quels, sauf ceux
   * des checklists et de leurs points, recréés à l'import.
   *
   * @returns {Promise<Object>} Données au format d'export
   */
  fastify.get(
    '/data/export',
    {
      schema: {
        description:
          'Exporte toutes les colonnes, tâches (archivées comprises, checklists comprises), tags, séries récurrentes et modèles de checklist',
        tags: ['Data'],
        response: { 200: exportSchema },
      },
    },
    async () => {
      // Lecture groupée, pour un instantané cohérent de toutes les tables
      const [stages, tags, tasks, recurrences, templates] = await prisma.$transaction([
        prisma.stage.findMany({
          select: { id: true, name: true, position: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
        prisma.tag.findMany({ select: { id: true, name: true, color: true, createdAt: true }, orderBy: { id: 'asc' } }),
        prisma.task.findMany({
          include: {
            tags: { select: { id: true } },
            checklist: { include: { items: { orderBy: { position: 'asc' } } } },
          },
          orderBy: { id: 'asc' },
        }),
        prisma.recurrence.findMany({ include: { tags: { select: { id: true } } }, orderBy: { id: 'asc' } }),
        prisma.checklist.findMany({
          where: templateWhere,
          include: templateInclude,
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
      ])

      Logger.info(
        `Export : ${stages.length} colonne(s), ${tags.length} tag(s), ${tasks.length} tâche(s), ${recurrences.length} série(s), ${templates.length} modèle(s) de checklist`,
      )

      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date(),
        stages,
        tags,
        tasks: tasks.map(({ tags: taskTags, checklist, ...task }) => ({
          ...task,
          tagIds: taskTags.map((tag) => tag.id).sort((a, b) => a - b),
          checklistItems: (checklist?.items ?? []).map(({ text, isChecked, checkedAt }) => ({
            text,
            isChecked,
            checkedAt,
          })),
        })),
        recurrences: recurrences.map(({ tags: recurrenceTags, ...recurrence }) => ({
          ...recurrence,
          tagIds: recurrenceTags.map((tag) => tag.id).sort((a, b) => a - b),
          // Valeur illisible en base exportée comme une liste vide, le schéma attend des textes
          checklistItems: seriesChecklistTexts(recurrence),
        })),
        checklistTemplates: templates.map((template) => ({
          name: template.name,
          position: template.position,
          items: template.items.map((item) => item.text),
        })),
      }
    },
  )

  /**
   * POST /data/import
   *
   * Remplace toutes les colonnes, tâches, tags, séries et modèles de checklist
   * par ceux d'un export (sans clé `recurrences`, la base n'a plus aucune
   * série ; sans `anchor`, une série suit le calendrier ; sans
   * `checklistTemplates` ni `checklistItems`, ni modèle ni checklist). Les
   * checklists sont ramenées aux limites partagées et un modèle dont le nom
   * est déjà pris par un modèle précédent du fichier n'est pas recréé, ces
   * corrections étant renvoyées dans `warnings` (cf. dataImport.helper). La
   * prochaine date et l'état des séries sont
   * remis en cohérence avec leurs occurrences (cf. normalizeImportedSeries). Le
   * fichier est entièrement contrôlé avant toute écriture (structure, format,
   * version, cohérence des références), puis l'import se fait dans une seule
   * transaction : un fichier refusé ou une erreur en cours de route ne
   * modifient rien.
   *
   * @param {Object} req - Requête Fastify
   * @param {Object} req.body - Fichier d'export (cf. GET /data/export)
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object>} Nombre de colonnes, tags, tâches et modèles importés et anomalies
   *   corrigées, 400 si le fichier est refusé (détail dans `message`), 500 si l'écriture échoue
   */
  fastify.post(
    '/data/import',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      schema: {
        description:
          'Remplace toutes les données par celles d’un export (colonnes, tâches, tags, séries, modèles de checklist)',
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
        // Message en français pour les journaux, motif traduit par le main pour l'affichage
        const message = translate('fr', `importProblems.${problem.code}`, problem.params)
        Logger.warn(`Import refusé : ${message}`)
        reply.code(400)
        return { statusCode: 400, error: 'Bad Request', message, problem }
      }

      // Corrections des checklists, prévues avant toute écriture
      const templatePlan = planTemplateImport(data.checklistTemplates)
      const seriesChecklists = (data.recurrences ?? []).map((recurrence) =>
        importedSeriesChecklist(recurrence.id, recurrence.checklistItems),
      )
      const taskChecklists = data.tasks.map((task) => importedTaskChecklist(task.id, task.checklistItems))
      const warnings: ImportProblem[] = [
        ...templatePlan.problems,
        ...seriesChecklists.flatMap(({ problem }) => (problem ? [problem] : [])),
        ...taskChecklists.flatMap(({ problem }) => (problem ? [problem] : [])),
      ]

      try {
        // Ordre des suppressions : les tâches référencent les séries et les
        // colonnes, les séries les colonnes (clés étrangères), leurs liens avec
        // les tags partent en cascade. Toutes les checklists d'abord, modèles
        // compris, leurs points partant en cascade
        await prisma.$transaction(
          async (tx) => {
            await tx.checklist.deleteMany()
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

            for (const template of templatePlan.templates) {
              await tx.checklist.create({
                data: {
                  name: template.name,
                  nameKey: template.nameKey,
                  position: template.position,
                  items: {
                    create: template.items.map((text, position) => ({
                      text,
                      position,
                      isChecked: false,
                      checkedAt: null,
                    })),
                  },
                },
              })
            }

            // Séries avant les tâches, qui les référencent
            for (const [index, recurrence] of (data.recurrences ?? []).entries()) {
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
                  anchor: recurrence.anchor ?? 'schedule',
                  leadDays: recurrence.leadDays ?? 0,
                  status: recurrence.status,
                  nextRunAt: recurrence.nextRunAt,
                  title: recurrence.title,
                  description: recurrence.description,
                  version: recurrence.version,
                  stageId: recurrence.stageId,
                  createdAt: recurrence.createdAt,
                  updatedAt: recurrence.updatedAt,
                  checklistItems: seriesChecklists[index].texts,
                  tags: { connect: (recurrence.tagIds ?? []).map((id) => ({ id })) },
                },
              })
            }

            for (const [index, task] of data.tasks.entries()) {
              const { rows } = taskChecklists[index]
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
                  // Pas de checklist sans point, comme à l'enregistrement d'une tâche
                  ...(rows.length > 0 && { checklist: { create: { items: { create: rows } } } }),
                },
              })
            }

            // Prochaine date et état cohérents avec les occurrences importées
            await normalizeImportedSeries(tx, new Date())
          },
          // Un gros fichier dépasse le délai par défaut (5 s) d'une transaction interactive
          { timeout: 120_000 },
        )
      } catch (error) {
        Logger.error("Erreur lors de l'import des données, base inchangée :", error)
        reply.code(500)
        return { statusCode: 500, error: 'Internal Server Error', message: "L'import a échoué, aucune donnée modifiée" }
      }

      for (const warning of warnings) {
        Logger.warn(`Import corrigé : ${translate('fr', `importProblems.${warning.code}`, warning.params)}`)
      }

      const counts: DataCounts = {
        stages: data.stages.length,
        tags: data.tags.length,
        tasks: data.tasks.length,
        checklistTemplates: templatePlan.templates.length,
      }
      Logger.info(
        `Import : ${counts.stages} colonne(s), ${counts.tags} tag(s), ${counts.tasks} tâche(s), ${counts.checklistTemplates} modèle(s) de checklist`,
      )
      return { ...counts, warnings }
    },
  )
}
