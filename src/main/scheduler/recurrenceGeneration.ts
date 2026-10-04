import Logger from 'electron-log'
import { Prisma } from '../prisma/generated/prisma/client.js'
import { prisma } from '../server/prismaClient.js'
import { bottomPosition, makeRoomAt, taskInclude } from '../server/helpers/task.helper.js'
import { occurrenceVersion } from '../server/helpers/recurrence.helper.js'
import { settingsStore } from '../stores/settings.js'
import {
  countReached,
  dueOccurrence,
  nextAfterCompletion,
  nextOccurrence,
  occurrenceCreationDate,
  toRecurrenceRule,
  type RecurrenceRule,
} from '../shared/recurrence.helper.js'
import { RECURRENCE_LEAD_DAYS_MAX } from '../shared/recurrence.constants.js'

/**
 * Génération des occurrences des séries récurrentes.
 *
 * Appelée à chaque tick du planificateur de notifications, avant la recherche
 * des tâches échues (l'occurrence créée est ainsi rappelée dans la foulée),
 * et une fois au démarrage. Chaque série active dont l'heure de création de
 * la prochaine date est passée crée sa tâche, puis avance à la date suivante
 * (calendrier) ou attend l'archivage de cette tâche (après archivage :
 * `nextRunAt` reste null jusqu'à l'archivage, cf. server/helpers/recurrence.helper) :
 * - création anticipée (`leadDays`) : la tâche est créée N jours avant sa
 *   date, à l'heure de la série ; sa date de début reste celle de
 *   l'occurrence, son rappel part donc à cette date ;
 * - app fermée pendant plusieurs dates : seule la plus récente des dates dont
 *   l'heure de création est passée est créée, les autres sont sautées
 *   (journalisées, sans compter dans le nombre d'occurrences) ;
 * - « Ne pas empiler » (calendrier) : la date est sautée si une occurrence de
 *   la série est encore au tableau (non archivée) ; après archivage, une
 *   occurrence remise au tableau entre-temps fait de nouveau attendre la série ;
 * - occurrence déjà créée pour cette date (série reprise juste après une
 *   création anticipée) : la date est sautée, sans doublon ;
 * - aucune colonne au tableau : rien n'est créé et la série n'avance pas, elle
 *   reprendra au prochain passage.
 *
 * Les séries en pause ou terminées ne génèrent rien. Une série reprise ne
 * rattrape rien : elle repart de maintenant selon le calendrier, ou crée au
 * plus l'occurrence calculée à l'archivage (cf. setSeriesStatus).
 *
 * Les tâches créées sont transmises à la fenêtre principale (cf. main.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Écart maximal entre la date d'une occurrence et sa création : le délai
 * maximal, plus un jour pour couvrir un changement d'heure entre les deux.
 */
const LEAD_HORIZON_MS = (RECURRENCE_LEAD_DAYS_MAX + 1) * DAY_MS

// Motifs journalisés d'une date sautée
const BLOCKER_LABELS = { existing: 'occurrence déjà créée', pending: 'une occurrence est encore au tableau' } as const

/** Tâche créée, telle que renvoyée par l'API (tags et résumé de la série). */
export type GeneratedTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

/** Résultat d'un passage de la génération. */
export interface RecurrenceGenerationResult {
  created: number // occurrences créées
  skipped: number // dates sautées (rattrapage, « Ne pas empiler », occurrence déjà là ou encore au tableau)
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

/** Série relue dans la transaction de sa génération, avec les tags de son modèle. */
type SeriesWithTags = Prisma.RecurrenceGetPayload<{ include: { tags: { select: { id: true } } } }>

/** Ce qui empêche de créer l'occurrence d'une date : elle existe déjà, ou une occurrence est encore au tableau. */
type Blocker = 'existing' | 'pending' | null

/**
 * Colonne de l'occurrence : celle du modèle, ou la première si elle a été
 * supprimée. Null s'il n'y a aucune colonne au tableau.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série
 */
async function occurrenceStage(tx: Prisma.TransactionClient, series: SeriesWithTags) {
  return (
    (series.stageId === null ? null : await tx.stage.findUnique({ where: { id: series.stageId } })) ??
    (await tx.stage.findFirst({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }))
  )
}

/**
 * Ce qui empêche de créer l'occurrence d'une date, ou null :
 * - après archivage, une occurrence encore au tableau (restaurée entre le
 *   calcul de la date et ce passage) : la série l'attend ;
 * - une occurrence déjà créée pour cette date (série reprise juste après une
 *   création anticipée) : la date est sautée, sans doublon ;
 * - calendrier avec « Ne pas empiler », une occurrence encore au tableau : la
 *   date est sautée.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série
 * @param date Date de l'occurrence
 */
async function occurrenceBlocker(tx: Prisma.TransactionClient, series: SeriesWithTags, date: Date): Promise<Blocker> {
  const completion = series.anchor === 'completion'
  const pending = async () => (await tx.task.count({ where: { recurrenceId: series.id, isHistorized: false } })) > 0

  if (completion && (await pending())) return 'pending'
  if (await tx.task.findFirst({ where: { recurrenceId: series.id, occurrenceDate: date }, select: { id: true } })) {
    return 'existing'
  }
  if (!completion && series.skipIfPending && (await pending())) return 'pending'
  return null
}

/**
 * Crée l'occurrence d'une date avec le contenu du modèle, à la place et dans
 * la version choisies comme pour l'ajout rapide (paramètres).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série
 * @param stageId Colonne de l'occurrence
 * @param date Date de l'occurrence
 * @returns Id de la tâche créée
 */
async function createOccurrence(
  tx: Prisma.TransactionClient,
  series: SeriesWithTags,
  stageId: number,
  date: Date,
): Promise<number> {
  let position: number
  if (settingsStore.get('newTaskPosition') === 'top') {
    position = 0
    await makeRoomAt(tx, stageId, position)
  } else {
    position = await bottomPosition(tx, stageId)
  }

  const { id } = await tx.task.create({
    data: {
      title: series.title,
      description: series.description,
      version: occurrenceVersion(series.version),
      stageId,
      position,
      startDate: date,
      recurrenceId: series.id,
      occurrenceDate: date,
      tags: { connect: series.tags.map((tag) => ({ id: tag.id })) },
    },
    select: { id: true },
  })
  return id
}

/**
 * Suite d'une série après le passage d'une date :
 * - calendrier : la date suivante, l'occurrence ayant été créée ou non (sa
 *   création est à venir), ou la fin de la série ;
 * - après archivage : aucune date tant que l'occurrence créée (ou celle qui
 *   bloque) est au tableau, la série l'attend ; une date déjà prise est
 *   sautée, la suivante partant d'elle. Fin une fois N occurrences créées.
 *
 * @param rule Règle de la série, nombre d'occurrences à jour
 * @param date Date passée
 * @param blocker Ce qui a empêché la création, ou null si l'occurrence a été créée
 */
function seriesAfter(rule: RecurrenceRule, date: Date, blocker: Blocker): { nextRunAt: Date | null; ended: boolean } {
  if (rule.anchor !== 'completion') {
    const nextRunAt = nextOccurrence(rule, date)
    return { nextRunAt, ended: !nextRunAt }
  }
  if (blocker !== 'existing') return { nextRunAt: null, ended: countReached(rule) }

  const nextRunAt = nextAfterCompletion(rule, date)
  return { nextRunAt, ended: !nextRunAt }
}

/**
 * Génère l'occurrence échue d'une série, dans une transaction : la série est
 * relue (un passage concurrent ou une route a pu la modifier entre-temps), la
 * tâche créée et la série avancée ensemble.
 *
 * @param id Id de la série
 * @param now Horodatage de référence
 * @returns Issue de la génération, `null` si la série n'est plus à générer
 */
async function generateSeries(id: number, now: Date): Promise<SeriesOutcome | null> {
  return prisma.$transaction(async (tx) => {
    const series = await tx.recurrence.findUnique({ where: { id }, include: { tags: { select: { id: true } } } })
    if (series?.status !== 'active' || !series.nextRunAt) return null

    // Rattrapage : seule la plus récente des dates dont l'heure de création est passée est gardée
    const rule = toRecurrenceRule(series)
    const due = dueOccurrence(rule, series.nextRunAt, now)
    if (!due) return null

    const stage = await occurrenceStage(tx, series)
    if (!stage) {
      Logger.warn(`[recurrence] Série ${id} : aucune colonne pour créer l'occurrence, nouvel essai au prochain passage`)
      return { task: null, skipped: 0, ended: false, waiting: true }
    }

    // Une ligne pour tout le rattrapage : une app fermée longtemps saute des centaines de dates
    if (due.skipped.length) {
      const [first, last] = [due.skipped[0], due.skipped.at(-1) as Date].map((date) => date.toISOString())
      Logger.info(
        `[recurrence] Série ${id} : ${due.skipped.length} date(s) sautée(s) (rattrapage), du ${first} au ${last}`,
      )
    }
    const { date } = due

    const blocker = await occurrenceBlocker(tx, series, date)
    if (blocker) {
      Logger.info(`[recurrence] Série ${id} : date du ${date.toISOString()} sautée, ${BLOCKER_LABELS[blocker]}`)
    }
    const createdId = blocker ? null : await createOccurrence(tx, series, stage.id, date)

    const generatedCount = series.generatedCount + (createdId === null ? 0 : 1)
    const { nextRunAt, ended } = seriesAfter({ ...rule, generatedCount }, date, blocker)
    await tx.recurrence.update({
      where: { id },
      data: { generatedCount, nextRunAt, ...(ended && { status: 'ended' }) },
    })

    // Relue avec ses tags et le résumé de la série à jour
    const task =
      createdId === null ? null : await tx.task.findUniqueOrThrow({ where: { id: createdId }, include: taskInclude })
    if (task) Logger.info(`[recurrence] Série ${id} : tâche ${task.id} créée pour le ${date.toISOString()}`)
    if (ended) Logger.info(`[recurrence] Série ${id} terminée`)

    return { task, skipped: due.skipped.length + (blocker ? 1 : 0), ended, waiting: false }
  })
}

// Passage en cours (ou dernier passé) : les passages s'enchaînent sans se chevaucher
let lastRun: Promise<unknown> = Promise.resolve()

/**
 * Coeur métier : génère les occurrences de toutes les séries actives dont
 * l'heure de création de la prochaine date est passée, une transaction par
 * série (une série en échec n'empêche pas les autres). Extrait pour être testable.
 *
 * Les passages sont enchaînés : celui du démarrage, ceux du tick et ceux des
 * tests ne se chevauchent jamais (chaque série est de toute façon relue dans
 * sa transaction, cf. generateSeries).
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre d'occurrences créées, de dates sautées, de séries terminées et en attente
 */
export function runRecurrenceGeneration(now: Date = new Date()): Promise<RecurrenceGenerationResult> {
  const run = lastRun.then(() => generateDueSeries(now))
  lastRun = run.catch(() => undefined)
  return run
}

/**
 * Un passage de la génération (cf. runRecurrenceGeneration).
 *
 * `nextRunAt` reste la date de l'occurrence : la requête, indexée sur (status,
 * nextRunAt), retient les séries dont la prochaine date tombe avant
 * maintenant + le délai maximal, puis le délai de chaque série est vérifié ici.
 *
 * @param now Horodatage de référence
 */
async function generateDueSeries(now: Date): Promise<RecurrenceGenerationResult> {
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
