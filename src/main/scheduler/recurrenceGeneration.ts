import Logger from 'electron-log'
import { Prisma } from '../prisma/generated/prisma/client.js'
import { prisma } from '../server/prismaClient.js'
import { bottomPosition, makeRoomAt, taskInclude } from '../server/helpers/task.helper.js'
import { settingsStore } from '../stores/settings.js'
import { dueOccurrence, nextOccurrence, occurrenceCreationDate, toRecurrenceRule } from '../shared/recurrence.helper.js'
import { RECURRENCE_LEAD_DAYS_MAX } from '../shared/recurrence.constants.js'

/**
 * Génération des occurrences des séries récurrentes.
 *
 * Appelée à chaque tick du planificateur de notifications, avant la recherche
 * des tâches échues (l'occurrence créée est ainsi rappelée dans la foulée),
 * et une fois au démarrage. Chaque série active dont l'heure de création de
 * la prochaine date est passée crée sa tâche, puis avance à la date suivante :
 * - création anticipée (`leadDays`) : la tâche est créée N jours avant sa
 *   date, à l'heure de la série ; sa date de début reste celle de
 *   l'occurrence, son rappel part donc à cette date ;
 * - app fermée pendant plusieurs dates : seule la plus récente des dates dont
 *   l'heure de création est passée est créée, les autres sont sautées
 *   (journalisées, sans compter dans le nombre d'occurrences) ;
 * - « Ne pas empiler » : la date est sautée si une occurrence de la série est
 *   encore au tableau (non archivée) ;
 * - occurrence déjà créée pour cette date (série reprise juste après une
 *   création anticipée) : la date est sautée, sans doublon ;
 * - aucune colonne au tableau : rien n'est créé et la série n'avance pas, elle
 *   reprendra au prochain passage.
 *
 * Les séries en pause ou terminées ne génèrent rien. Une série reprise repart
 * de maintenant, sans rattrapage (cf. setSeriesStatus).
 *
 * Les tâches créées sont transmises à la fenêtre principale (cf. main.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Écart maximal entre la date d'une occurrence et sa création : le délai
 * maximal, plus un jour pour couvrir un changement d'heure entre les deux.
 */
const LEAD_HORIZON_MS = (RECURRENCE_LEAD_DAYS_MAX + 1) * DAY_MS

/** Tâche créée, telle que renvoyée par l'API (tags et résumé de la série). */
export type GeneratedTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

/** Résultat d'un passage de la génération. */
export interface RecurrenceGenerationResult {
  created: number // occurrences créées
  skipped: number // dates sautées (rattrapage ou « Ne pas empiler »)
  ended: number // séries terminées par ce passage
  waiting: number // séries en attente d'une colonne (aucune au tableau)
}

/** Issue de la génération d'une série. */
interface SeriesOutcome {
  task: GeneratedTask | null
  skipped: number
  ended: boolean
  waiting: boolean
}

// Destinataire des tâches créées (fenêtre principale), branché par main.ts
let createdListener: ((tasks: GeneratedTask[]) => void) | null = null

/**
 * Branche le destinataire des tâches créées à chaque passage.
 *
 * @param listener Reçoit les tâches créées par un passage (jamais vide)
 */
export function onOccurrencesCreated(listener: (tasks: GeneratedTask[]) => void): void {
  createdListener = listener
}

/**
 * Génère l'occurrence échue d'une série, dans une transaction : la série est
 * relue (un passage concurrent a pu la faire avancer), la tâche créée et la
 * série avancée ensemble.
 *
 * @param id Id de la série
 * @param now Horodatage de référence
 * @returns Issue de la génération, `null` si la série n'est plus à générer
 */
async function generateSeries(id: number, now: Date): Promise<SeriesOutcome | null> {
  return prisma.$transaction(async (tx) => {
    const series = await tx.recurrence.findUnique({ where: { id }, include: { tags: { select: { id: true } } } })
    if (!series || series.status !== 'active' || !series.nextRunAt) return null

    // Rattrapage : seule la plus récente des dates dont l'heure de création est passée est gardée
    const rule = toRecurrenceRule(series)
    const due = dueOccurrence(rule, series.nextRunAt, now)
    if (!due) return null

    // Colonne du modèle, ou la première si elle a été supprimée
    const stage =
      (series.stageId === null ? null : await tx.stage.findUnique({ where: { id: series.stageId } })) ??
      (await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }))
    if (!stage) {
      Logger.warn(`[recurrence] Série ${id} : aucune colonne pour créer l'occurrence, nouvel essai au prochain passage`)
      return { task: null, skipped: 0, ended: false, waiting: true }
    }

    for (const date of due.skipped) {
      Logger.info(`[recurrence] Série ${id} : date du ${date.toISOString()} sautée (rattrapage)`)
    }
    const { date } = due
    let skipped = due.skipped.length

    let createdId: number | null = null
    const existing = await tx.task.findFirst({
      where: { recurrenceId: id, occurrenceDate: date },
      select: { id: true },
    })
    const pending =
      !existing && series.skipIfPending ? await tx.task.count({ where: { recurrenceId: id, isHistorized: false } }) : 0

    if (existing) {
      Logger.info(`[recurrence] Série ${id} : date du ${date.toISOString()} sautée, occurrence déjà créée`)
      skipped++
    } else if (pending > 0) {
      Logger.info(`[recurrence] Série ${id} : date du ${date.toISOString()} sautée, une occurrence est encore active`)
      skipped++
    } else {
      // Place et version comme pour l'ajout rapide (paramètres)
      const { newTaskPosition, taskVersions, defaultTaskVersion } = settingsStore.store
      let position: number
      if (newTaskPosition === 'top') {
        position = 0
        await makeRoomAt(tx, stage.id, position)
      } else {
        position = await bottomPosition(tx, stage.id)
      }

      const { id: taskId } = await tx.task.create({
        data: {
          title: series.title,
          description: series.description,
          version: taskVersions.includes(series.version) ? series.version : defaultTaskVersion,
          stageId: stage.id,
          position,
          startDate: date,
          recurrenceId: id,
          occurrenceDate: date,
          tags: { connect: series.tags.map((tag) => ({ id: tag.id })) },
        },
        select: { id: true },
      })
      createdId = taskId
    }

    // La série avance toujours : date suivante (dont la création est à venir), ou fin de série
    const generatedCount = series.generatedCount + (createdId === null ? 0 : 1)
    const nextRunAt = nextOccurrence({ ...rule, generatedCount }, date)
    await tx.recurrence.update({
      where: { id },
      data: { generatedCount, nextRunAt, ...(!nextRunAt && { status: 'ended' }) },
    })

    // Relue avec ses tags et le résumé de la série à jour
    const task =
      createdId === null ? null : await tx.task.findUniqueOrThrow({ where: { id: createdId }, include: taskInclude })
    if (task) Logger.info(`[recurrence] Série ${id} : tâche ${task.id} créée pour le ${date.toISOString()}`)
    if (!nextRunAt) Logger.info(`[recurrence] Série ${id} terminée`)

    return { task, skipped, ended: !nextRunAt, waiting: false }
  })
}

/**
 * Coeur métier : génère les occurrences de toutes les séries actives dont
 * l'heure de création de la prochaine date est passée, une transaction par
 * série (une série en échec n'empêche pas les autres). Extrait pour être testable.
 *
 * `nextRunAt` reste la date de l'occurrence : la requête, indexée sur (status,
 * nextRunAt), retient les séries dont la prochaine date tombe avant
 * maintenant + le délai maximal, puis le délai de chaque série est vérifié ici.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre d'occurrences créées, de dates sautées, de séries terminées et en attente
 */
export async function runRecurrenceGeneration(now: Date = new Date()): Promise<RecurrenceGenerationResult> {
  const candidates = await prisma.recurrence.findMany({
    where: { status: 'active', nextRunAt: { lte: new Date(now.getTime() + LEAD_HORIZON_MS) } },
    select: { id: true, nextRunAt: true, leadDays: true, time: true },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
  })
  const dueSeries = candidates.filter((series) => occurrenceCreationDate(series, series.nextRunAt as Date) <= now)

  const result: RecurrenceGenerationResult = { created: 0, skipped: 0, ended: 0, waiting: 0 }
  const tasks: GeneratedTask[] = []

  for (const { id } of dueSeries) {
    try {
      const outcome = await generateSeries(id, now)
      if (!outcome) continue

      if (outcome.task) tasks.push(outcome.task)
      result.skipped += outcome.skipped
      if (outcome.ended) result.ended++
      if (outcome.waiting) result.waiting++
    } catch (error) {
      // P2002 : occurrence déjà créée pour cette date (contrainte d'unicité), rien n'a été écrit
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        Logger.warn(`[recurrence] Série ${id} : occurrence déjà générée pour cette date, ignorée`)
      } else {
        Logger.error(`[recurrence] Échec de la génération de la série ${id} :`, error)
      }
    }
  }

  result.created = tasks.length
  if (tasks.length) createdListener?.(tasks)

  if (dueSeries.length) Logger.info(`[recurrence] ${tasks.length} occurrence(s) créée(s)`, result)
  return result
}
