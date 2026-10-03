import Logger from 'electron-log'
import { Prisma } from '../prisma/generated/prisma/client.js'
import { prisma } from '../server/prismaClient.js'
import { bottomPosition, makeRoomAt, taskInclude } from '../server/helpers/task.helper.js'
import { settingsStore } from '../stores/settings.js'
import { nextOccurrence, toRecurrenceRule } from '../shared/recurrence.helper.js'

/**
 * Génération des occurrences des séries récurrentes.
 *
 * Appelée à chaque tick du planificateur de notifications, avant la recherche
 * des tâches échues (l'occurrence créée est ainsi rappelée dans la foulée),
 * et une fois au démarrage. Chaque série active dont la prochaine date est
 * passée crée sa tâche, puis avance à la première date après maintenant :
 * - app fermée pendant plusieurs dates : seule la plus récente est créée, les
 *   autres sont sautées (journalisées, sans compter dans le nombre d'occurrences) ;
 * - « Ne pas empiler » : la date est sautée si une occurrence de la série est
 *   encore au tableau (non archivée) ;
 * - aucune colonne au tableau : rien n'est créé et la série n'avance pas, elle
 *   reprendra au prochain passage.
 *
 * Les tâches créées sont transmises à la fenêtre principale (cf. main.ts).
 */

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
    if (!series || series.status !== 'active' || !series.nextRunAt || series.nextRunAt > now) return null

    // Colonne du modèle, ou la première si elle a été supprimée
    const stage =
      (series.stageId === null ? null : await tx.stage.findUnique({ where: { id: series.stageId } })) ??
      (await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }))
    if (!stage) {
      Logger.warn(`[recurrence] Série ${id} : aucune colonne pour créer l'occurrence, nouvel essai au prochain passage`)
      return { task: null, skipped: 0, ended: false, waiting: true }
    }

    // Rattrapage : seule la date échue la plus récente est gardée
    const rule = toRecurrenceRule(series)
    let date = series.nextRunAt
    let skipped = 0
    for (let next = nextOccurrence(rule, date); next && next <= now; next = nextOccurrence(rule, date)) {
      Logger.info(`[recurrence] Série ${id} : date du ${date.toISOString()} sautée (rattrapage)`)
      skipped++
      date = next
    }

    let createdId: number | null = null
    const pending = series.skipIfPending ? await tx.task.count({ where: { recurrenceId: id, isHistorized: false } }) : 0

    if (pending > 0) {
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

    // La série avance toujours : première date après maintenant, ou fin de série
    const generatedCount = series.generatedCount + (createdId === null ? 0 : 1)
    const nextRunAt = nextOccurrence({ ...rule, generatedCount }, now)
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
 * Coeur métier : génère les occurrences de toutes les séries actives dont la
 * prochaine date est passée, une transaction par série (une série en échec
 * n'empêche pas les autres). Extrait pour être testable.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre d'occurrences créées, de dates sautées, de séries terminées et en attente
 */
export async function runRecurrenceGeneration(now: Date = new Date()): Promise<RecurrenceGenerationResult> {
  const dueSeries = await prisma.recurrence.findMany({
    where: { status: 'active', nextRunAt: { lte: now } },
    select: { id: true },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
  })

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
