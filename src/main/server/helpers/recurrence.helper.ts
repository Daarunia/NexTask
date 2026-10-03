import type { Prisma, Recurrence, Task } from '../../prisma/generated/prisma/client.js'
import type { RecurrenceInput } from '../../shared/recurrence.constants.js'
import {
  countReached,
  formatWeekdays,
  localTime,
  nextAfterCompletion,
  nextRunAfter,
  startOfLocalDay,
  toRecurrenceRule,
  type RecurrenceRule,
} from '../../shared/recurrence.helper.js'
import { settingsStore } from '../../stores/settings.js'
import Logger from 'electron-log'

/**
 * Helpers des séries récurrentes, partagés par les routes des tâches, des
 * colonnes, des séries et des données, et par la génération des occurrences :
 * contrôle d'une règle saisie, création d'une série depuis sa tâche
 * d'origine, modification de sa règle, de son modèle ou de son état, et suivi
 * des occurrences archivées, restaurées ou supprimées.
 *
 * Deux modes (`anchor`) :
 * - `schedule` : dates tirées du calendrier, depuis le début de la série ;
 * - `completion` : la prochaine date part de l'archivage de l'occurrence
 *   précédente. Tant qu'une occurrence est au tableau, la série l'attend
 *   (`nextRunAt` null, état `active`) ; son archivage donne la prochaine date
 *   (cf. onArchiveStatesChanged), la génération crée l'occurrence puis la
 *   série attend de nouveau.
 *
 * Le calcul des dates est dans shared/recurrence.helper (fonctions pures).
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/** Champs de la règle d'une série, tels qu'écrits en base. */
type RuleData = Pick<
  Recurrence,
  | 'anchor'
  | 'frequency'
  | 'interval'
  | 'weekdays'
  | 'monthlyMode'
  | 'time'
  | 'startsAt'
  | 'endType'
  | 'endsOn'
  | 'maxCount'
  | 'skipIfPending'
  | 'leadDays'
>

/** Série dont on calcule la prochaine date et l'état : sa règle, son nombre d'occurrences et sa prochaine date. */
type SeriesRuleState = RuleData & Pick<Recurrence, 'id' | 'generatedCount' | 'nextRunAt'>

/** Prochaine date et état d'une série qui (re)démarre. */
interface SeriesState {
  nextRunAt: Date | null
  status: 'active' | 'ended'
}

/** Occurrence avec les ids de ses tags. */
type TaskWithTagIds = Task & { tags: { id: number }[] }

// Options d'une série qui ne touchent pas à son calendrier : modifiées seules,
// la série garde son début et sa prochaine date
const OPTION_FIELDS = ['skipIfPending', 'leadDays'] as const

// Champs du calendrier d'une série : les modifier recale la série sur la tâche modifiée
const SCHEDULE_FIELDS = ['anchor', 'frequency', 'interval', 'weekdays', 'monthlyMode', 'endType', 'maxCount'] as const

// Dates successives déjà prises par une occurrence, au plus, avant de laisser la génération sauter la suivante
const MAX_TAKEN_DATES = 50

/**
 * Contrôle d'une règle saisie au-delà de sa structure (déjà validée par le
 * schéma) : date de début de la tâche, jours de la semaine (mode calendrier),
 * date ou nombre de fin.
 *
 * @param input Règle saisie
 * @param startDate Date de début de la tâche, une fois modifiée
 * @returns Le motif du refus, ou `null` si la règle est valable
 */
export function recurrenceInputProblem(input: RecurrenceInput, startDate: Date | null): string | null {
  if (!startDate) return 'Une tâche récurrente doit avoir une date de début'
  if (input.anchor !== 'completion' && input.frequency === 'weekly' && !input.weekdays?.length) {
    return 'Choisis au moins un jour de la semaine'
  }

  if (input.endType === 'onDate') {
    if (!input.endsOn) return 'Date de fin de la série manquante'
    if (startOfLocalDay(new Date(input.endsOn)) < startOfLocalDay(startDate)) {
      return 'La date de fin de la série doit suivre sa date de début'
    }
  }

  if (input.endType === 'afterCount' && !input.maxCount) return "Nombre d'occurrences de la série manquant"

  return null
}

/**
 * Règle à écrire en base : champs propres au mode, à la fréquence et à la fin
 * choisis (les autres à null), heure et début tirés de la date de début de la
 * tâche. En mode « après archivage », seuls la fréquence et l'intervalle
 * comptent : jours de la semaine et mode du mensuel sont retirés, « Ne pas
 * empiler » reste à sa valeur par défaut (une seule occurrence à la fois, par
 * construction).
 *
 * @param input Règle saisie, déjà contrôlée
 * @param startDate Date de début de la tâche
 */
function toRuleData(input: RecurrenceInput, startDate: Date): RuleData {
  const calendar = input.anchor !== 'completion'
  return {
    anchor: calendar ? 'schedule' : 'completion',
    frequency: input.frequency,
    interval: input.interval,
    weekdays: calendar && input.frequency === 'weekly' ? formatWeekdays(input.weekdays) : null,
    monthlyMode: calendar && input.frequency === 'monthly' ? (input.monthlyMode ?? 'dayOfMonth') : null,
    time: localTime(startDate),
    startsAt: startDate,
    endType: input.endType,
    endsOn: input.endType === 'onDate' && input.endsOn ? startOfLocalDay(new Date(input.endsOn)) : null,
    maxCount: input.endType === 'afterCount' ? (input.maxCount ?? null) : null,
    skipIfPending: calendar ? (input.skipIfPending ?? true) : true,
    leadDays: input.leadDays ?? 0,
  }
}

/**
 * Règle actuelle d'une série, sans son modèle ni son état.
 *
 * @param series Série
 */
function ruleOf(series: Recurrence): RuleData {
  const { anchor, frequency, interval, weekdays, monthlyMode, time, startsAt } = series
  const { endType, endsOn, maxCount, skipIfPending, leadDays } = series
  return {
    anchor,
    frequency,
    interval,
    weekdays,
    monthlyMode,
    time,
    startsAt,
    endType,
    endsOn,
    maxCount,
    skipIfPending,
    leadDays,
  }
}

/**
 * Vrai si le calendrier de la série change (mode, fréquence, intervalle, jours,
 * fin). La seule date de début de l'occurrence modifiée ne le change pas.
 *
 * @param series Série actuelle
 * @param rule Règle saisie, convertie
 */
function scheduleChanged(series: Recurrence, rule: RuleData): boolean {
  return (
    SCHEDULE_FIELDS.some((field) => series[field] !== rule[field]) ||
    (series.endsOn?.getTime() ?? null) !== (rule.endsOn?.getTime() ?? null)
  )
}

/**
 * Version d'une occurrence générée : celle du modèle si elle est encore
 * proposée dans les paramètres, la version par défaut sinon.
 *
 * @param version Version du modèle de la série
 */
export function occurrenceVersion(version: string): string {
  const { taskVersions, defaultTaskVersion } = settingsStore.store
  return taskVersions.includes(version) ? version : defaultTaskVersion
}

/**
 * Date de la dernière occurrence d'une série, créée peut-être en avance
 * (création anticipée), ou null si elle n'en a plus aucune.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param seriesId Id de la série
 */
async function latestOccurrenceDate(tx: TransactionClient, seriesId: number): Promise<Date | null> {
  const latest = await tx.task.findFirst({
    where: { recurrenceId: seriesId, occurrenceDate: { not: null } },
    orderBy: { occurrenceDate: 'desc' },
    select: { occurrenceDate: true },
  })
  return latest?.occurrenceDate ?? null
}

/**
 * Date du dernier archivage d'une occurrence de la série, ou null.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param seriesId Id de la série
 */
async function latestArchiveDate(tx: TransactionClient, seriesId: number): Promise<Date | null> {
  const latest = await tx.task.findFirst({
    where: { recurrenceId: seriesId, isHistorized: true, historizationDate: { not: null } },
    orderBy: { historizationDate: 'desc' },
    select: { historizationDate: true },
  })
  return latest?.historizationDate ?? null
}

/**
 * Prochaine date et état d'une série calendaire qui (re)démarre maintenant,
 * sans rattrapage : terminée si sa règle ne donne plus aucune date. Une
 * occurrence déjà créée en avance (création anticipée) n'est pas recréée : la
 * prochaine date la suit.
 *
 * @param series Règle de la série (et nombre d'occurrences déjà créées)
 * @param now Maintenant
 * @param latest Date de la dernière occurrence existante de la série
 */
function scheduleState(series: SeriesRuleState, now: Date, latest: Date | null): SeriesState {
  const nextRunAt = nextRunAfter(toRecurrenceRule(series), latest && latest > now ? latest : now)
  return { nextRunAt, status: nextRunAt ? 'active' : 'ended' }
}

/**
 * Prochaine date « après archivage » libre : une date déjà prise par une
 * occurrence de la série (archivée avant sa date, après une création
 * anticipée) est sautée, la suivante partant de cette date.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param seriesId Id de la série
 * @param rule Règle de la série
 * @param from Date de l'archivage
 */
async function freeCompletionDate(
  tx: TransactionClient,
  seriesId: number,
  rule: RecurrenceRule,
  from: Date,
): Promise<Date | null> {
  let next = nextAfterCompletion(rule, from)
  for (let attempt = 0; next && attempt < MAX_TAKEN_DATES; attempt++) {
    const taken = await tx.task.findFirst({
      where: { recurrenceId: seriesId, occurrenceDate: next },
      select: { id: true },
    })
    if (!taken) return next
    next = nextAfterCompletion(rule, next)
  }
  return next
}

/**
 * Prochaine date et état d'une série « après archivage » :
 * - terminée si son nombre d'occurrences est atteint ;
 * - en attente (`nextRunAt` null) tant qu'une de ses occurrences est au tableau ;
 * - sinon, prochaine date depuis `since` (archivage, suppression, passage au
 *   mode) ; à défaut, la prochaine date déjà calculée est gardée (reprise,
 *   sans rattrapage), ou calculée depuis le dernier archivage (ou maintenant).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série
 * @param now Maintenant
 * @param since Point de départ imposé
 */
async function completionState(
  tx: TransactionClient,
  series: SeriesRuleState,
  now: Date,
  since?: Date,
): Promise<SeriesState> {
  const rule = toRecurrenceRule(series)
  if (countReached(rule)) return { nextRunAt: null, status: 'ended' }

  const active = await tx.task.count({ where: { recurrenceId: series.id, isHistorized: false } })
  if (active > 0) return { nextRunAt: null, status: 'active' }

  if (!since && series.nextRunAt) return { nextRunAt: series.nextRunAt, status: 'active' }

  const from = since ?? (await latestArchiveDate(tx, series.id)) ?? now
  const nextRunAt = await freeCompletionDate(tx, series.id, rule, from)
  return { nextRunAt, status: nextRunAt ? 'active' : 'ended' }
}

/**
 * Prochaine date et état d'une série qui (re)démarre, selon son mode : depuis
 * maintenant ou sa dernière occurrence (calendrier), ou selon ses occurrences
 * au tableau et leur archivage (après archivage, cf. completionState).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série
 * @param now Maintenant
 * @param since Point de départ imposé d'une série « après archivage »
 */
async function restartState(
  tx: TransactionClient,
  series: SeriesRuleState,
  now: Date,
  since?: Date,
): Promise<SeriesState> {
  if (series.anchor === 'completion') return completionState(tx, series, now, since)
  return scheduleState(series, now, await latestOccurrenceDate(tx, series.id))
}

/**
 * Crée une série depuis sa tâche d'origine, première occurrence : le modèle
 * des occurrences reprend son contenu, sa colonne et ses tags. En mode
 * « après archivage », la série attend l'archivage de cette tâche.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param task Tâche d'origine, déjà enregistrée
 * @param input Règle saisie, déjà contrôlée
 * @param tagIds Ids des tags de la tâche
 * @param now Maintenant
 * @returns Id de la série créée
 */
export async function createSeries(
  tx: TransactionClient,
  task: Task,
  input: RecurrenceInput,
  tagIds: number[],
  now: Date,
): Promise<number> {
  const startDate = task.startDate as Date
  const rule = toRuleData(input, startDate)

  const series = await tx.recurrence.create({
    data: {
      ...rule,
      generatedCount: 1,
      nextRunAt: null,
      title: task.title,
      description: task.description,
      version: task.version,
      stageId: task.stageId,
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  })

  // Tâche rattachée d'abord : elle compte comme occurrence (dernière date, attente d'archivage)
  await tx.task.update({ where: { id: task.id }, data: { recurrenceId: series.id, occurrenceDate: startDate } })
  const state = await restartState(tx, series, now)
  await tx.recurrence.update({ where: { id: series.id }, data: state })

  Logger.info(`[recurrence] Série ${series.id} créée depuis la tâche ${task.id}, prochaine : ${state.nextRunAt}`)
  return series.id
}

/**
 * Modifie la règle d'une série depuis l'une de ses occurrences. Un calendrier
 * modifié est recalé sur la date de début de cette occurrence, et une série
 * arrêtée est relancée. Dans les deux cas, la prochaine date est recalculée
 * sans rattrapage : depuis maintenant ou la dernière occurrence en mode
 * calendrier ; en mode « après archivage », la série attend l'occurrence au
 * tableau, sinon part du dernier archivage (de maintenant si elle vient de
 * changer de mode). Une série en pause le reste (sa reprise recalculera de
 * nouveau sa prochaine date). Une règle inchangée sur une série en cours ne
 * modifie rien.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série actuelle
 * @param input Règle saisie, déjà contrôlée
 * @param startDate Date de début de l'occurrence modifiée
 * @param now Maintenant
 */
export async function updateSeriesRule(
  tx: TransactionClient,
  series: Recurrence,
  input: RecurrenceInput,
  startDate: Date,
  now: Date,
): Promise<void> {
  const rule = toRuleData(input, startDate)
  const rescheduled = scheduleChanged(series, rule)
  const optionsChanged = OPTION_FIELDS.some((field) => series[field] !== rule[field])

  if (!rescheduled && !optionsChanged && series.status !== 'ended') return

  // Sans changement de calendrier, la série garde son début (et son jour du mois)
  const nextRule: RuleData = rescheduled
    ? rule
    : { ...ruleOf(series), skipIfPending: rule.skipIfPending, leadDays: rule.leadDays }
  const restart = rescheduled || series.status === 'ended'

  let restarted: { nextRunAt: Date | null; status: string } | null = null
  if (restart) {
    // Passage au mode « après archivage » : la série part de maintenant, pas d'un ancien archivage
    const since = nextRule.anchor === 'completion' && series.anchor !== 'completion' ? now : undefined
    restarted = await restartState(
      tx,
      { ...nextRule, id: series.id, generatedCount: series.generatedCount, nextRunAt: null },
      now,
      since,
    )
    // Une série en pause n'est pas relancée par une modification de sa règle
    if (series.status === 'paused' && restarted.status === 'active') restarted = { ...restarted, status: 'paused' }
  }

  await tx.recurrence.update({ where: { id: series.id }, data: { ...nextRule, ...restarted } })

  Logger.info(`[recurrence] Règle de la série ${series.id} modifiée${restart ? ', prochaine date recalculée' : ''}`)
}

/**
 * Reporte le contenu modifié d'une occurrence sur le modèle de sa série
 * (« Appliquer aux prochaines occurrences ») : seuls les champs envoyés sont
 * repris. La colonne ne l'est que si la modification la change, un simple
 * déplacement de carte ne passant pas par ici.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param seriesId Id de la série
 * @param task Occurrence, une fois modifiée
 * @param changed Champs envoyés, et colonne de l'occurrence avant la modification
 * @param tagIds Ids des tags de l'occurrence, s'ils ont été envoyés
 */
export async function applyToSeriesTemplate(
  tx: TransactionClient,
  seriesId: number,
  task: Task,
  changed: { title: boolean; description: boolean; version: boolean; previousStageId: number | null },
  tagIds: number[] | undefined,
): Promise<void> {
  const stageChanged = task.stageId !== null && task.stageId !== changed.previousStageId

  await tx.recurrence.update({
    where: { id: seriesId },
    data: {
      ...(changed.title && { title: task.title }),
      ...(changed.description && { description: task.description }),
      ...(changed.version && { version: task.version }),
      ...(stageChanged && { stageId: task.stageId }),
      ...(tagIds && { tags: { set: tagIds.map((id) => ({ id })) } }),
    },
  })
}

/**
 * Arrête une série (arrêt doux) : elle ne génère plus rien, ses occurrences
 * sont conservées. Sans effet sur une série déjà terminée.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série à arrêter
 */
export async function endSeries(tx: TransactionClient, series: Recurrence): Promise<void> {
  if (series.status === 'ended') return

  await tx.recurrence.update({ where: { id: series.id }, data: { status: 'ended', nextRunAt: null } })
  Logger.info(`[recurrence] Série ${series.id} arrêtée`)
}

/**
 * Change l'état d'une série. Une série réactivée ou reprise repart sans
 * rattrapage : de maintenant (après sa dernière occurrence si elle a été
 * créée en avance) en mode calendrier ; en mode « après archivage », elle
 * attend l'occurrence au tableau, sinon garde la prochaine date calculée à
 * l'archivage (au plus une occurrence créée, même si elle est passée). Une
 * série mise en pause garde sa prochaine date ; une série arrêtée n'en a plus.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param series Série actuelle
 * @param status Nouvel état
 * @param now Maintenant
 * @returns La série modifiée
 */
export async function setSeriesStatus(
  tx: TransactionClient,
  series: Recurrence,
  status: string,
  now: Date,
): Promise<Recurrence> {
  if (series.status === status) return series

  let data: Prisma.RecurrenceUpdateInput
  if (status === 'active') {
    data = await restartState(tx, series, now)
  } else if (status === 'ended') {
    data = { status, nextRunAt: null }
  } else {
    data = { status }
  }

  const updated = await tx.recurrence.update({ where: { id: series.id }, data })
  Logger.info(`[recurrence] Série ${series.id} : ${series.status} → ${updated.status}`)
  return updated
}

/**
 * Recalcule l'attente des séries « après archivage » en cours (actives ou en
 * pause) : prochaine date depuis `since` une fois leur dernière occurrence au
 * tableau partie, attente sinon. Une série en pause reste en pause (sa
 * prochaine date servira à sa reprise).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param seriesIds Ids des séries concernées (doublons et null ignorés)
 * @param now Maintenant
 * @param since Point de départ de la prochaine date (archivage, suppression)
 */
async function settleCompletionSeries(
  tx: TransactionClient,
  seriesIds: (number | null)[],
  now: Date,
  since?: Date,
): Promise<void> {
  const ids = [...new Set(seriesIds.filter((id): id is number => id !== null))]
  if (!ids.length) return

  const seriesList = await tx.recurrence.findMany({
    where: { id: { in: ids }, anchor: 'completion', status: { not: 'ended' } },
  })

  for (const series of seriesList) {
    const state = await completionState(tx, series, now, since)
    const status = series.status === 'paused' ? 'paused' : state.status
    if (state.nextRunAt?.getTime() === series.nextRunAt?.getTime() && status === series.status) continue

    await tx.recurrence.update({ where: { id: series.id }, data: { nextRunAt: state.nextRunAt, status } })
    Logger.info(
      `[recurrence] Série ${series.id} (après archivage) : prochaine ${state.nextRunAt?.toISOString() ?? 'en attente'}, ${status}`,
    )
  }
}

/**
 * Tâches archivées ou désarchivées par une route (PUT et PATCH /tasks/:id,
 * PATCH /tasks/batch, suppression d'une colonne) : une série « après
 * archivage » dont la dernière occurrence au tableau vient d'être archivée
 * calcule sa prochaine date depuis cet archivage (ou se termine) ; une
 * occurrence remise au tableau la remet en attente. À appeler dans la
 * transaction de l'écriture, une fois les tâches à jour.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param changes Tâches avant et après l'écriture (seules les occurrences d'une série comptent)
 * @param now Maintenant (date d'archivage d'une tâche qui n'en a pas)
 */
export async function onArchiveStatesChanged(
  tx: TransactionClient,
  changes: { wasArchived: boolean; task: Pick<Task, 'recurrenceId' | 'isHistorized' | 'historizationDate'> }[],
  now: Date,
): Promise<void> {
  const changed = changes.filter(
    ({ wasArchived, task }) => task.recurrenceId !== null && wasArchived !== task.isHistorized,
  )

  // Plus récent archivage de chaque série : point de départ de sa prochaine date
  const archivedAt = new Map<number, Date>()
  for (const { task } of changed) {
    if (!task.isHistorized) continue
    const date = task.historizationDate ?? now
    const previous = archivedAt.get(task.recurrenceId as number)
    if (!previous || date > previous) archivedAt.set(task.recurrenceId as number, date)
  }

  for (const seriesId of new Set(changed.map(({ task }) => task.recurrenceId as number))) {
    await settleCompletionSeries(tx, [seriesId], now, archivedAt.get(seriesId))
  }
}

/**
 * Occurrence supprimée (DELETE /tasks/:id) : supprimer l'occurrence au
 * tableau d'une série « après archivage » la libère comme un archivage fait
 * maintenant, plutôt que de la laisser attendre une occurrence qui n'existe
 * plus. Une occurrence archivée supprimée ne change rien.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param task Tâche supprimée
 * @param now Maintenant
 */
export async function onOccurrenceDeleted(
  tx: TransactionClient,
  task: Pick<Task, 'recurrenceId' | 'isHistorized'>,
  now: Date,
): Promise<void> {
  if (task.recurrenceId === null || task.isHistorized) return
  await settleCompletionSeries(tx, [task.recurrenceId], now, now)
}

/**
 * Vrai si les deux listes de tags portent les mêmes ids.
 *
 * @param a Tags
 * @param b Tags
 */
function sameTagIds(a: { id: number }[], b: { id: number }[]): boolean {
  const ids = new Set(a.map((tag) => tag.id))
  return a.length === b.length && b.every((tag) => ids.has(tag.id))
}

/**
 * Vrai si une occurrence générée n'a pas été modifiée depuis sa création :
 * toujours au tableau, avec le contenu, la version, la date et les tags du
 * modèle de sa série, et dans la colonne du modèle. `updatedAt` ne suffit
 * pas : le rappel (`notifiedAt`) et les décalages de position des autres
 * cartes le changent aussi.
 *
 * @param task Occurrence, avec ses tags
 * @param series Série, avec les tags de son modèle
 */
function isUntouchedOccurrence(task: TaskWithTagIds, series: Recurrence & { tags: { id: number }[] }): boolean {
  return (
    !task.isHistorized &&
    task.title === series.title &&
    task.description === series.description &&
    task.version === occurrenceVersion(series.version) &&
    (series.stageId === null || task.stageId === series.stageId) &&
    task.startDate?.getTime() === task.occurrenceDate?.getTime() &&
    sameTagIds(task.tags, series.tags)
  )
}

/**
 * Restauration d'une occurrence d'une série « après archivage » (POST
 * /tasks/:id/restore, qui sert aussi à annuler un archivage) :
 * - l'occurrence née de cet archivage (seule occurrence de la série créée
 *   depuis) est retirée si elle n'a pas été modifiée (cf.
 *   isUntouchedOccurrence), et ne compte plus dans le nombre d'occurrences ;
 *   modifiée (contenu, colonne, archivage…), elle est gardée ;
 * - la série attend de nouveau l'occurrence restaurée (`nextRunAt` null) ;
 * - une série terminée par sa règle à cause de cet archivage (date de fin
 *   dépassée, ou dernière occurrence retirée) reprend son attente. Une série
 *   arrêtée à la main le reste.
 * À appeler dans la transaction de la restauration. Sans effet en mode calendrier.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param task Occurrence telle qu'avant sa restauration (archivée)
 * @returns L'occurrence retirée, ou null
 */
export async function onOccurrenceRestored(tx: TransactionClient, task: Task): Promise<TaskWithTagIds | null> {
  if (task.recurrenceId === null) return null

  const series = await tx.recurrence.findUnique({
    where: { id: task.recurrenceId },
    include: { tags: { select: { id: true } } },
  })
  if (series?.anchor !== 'completion') return null

  // Occurrences créées depuis cet archivage : une seule, c'est celle qu'il a fait naître
  const archivedAt = task.historizationDate
  const born = archivedAt
    ? await tx.task.findMany({
        where: { recurrenceId: series.id, id: { not: task.id }, createdAt: { gte: archivedAt } },
        include: { tags: { select: { id: true } } },
      })
    : []
  const removed = born.length === 1 && isUntouchedOccurrence(born[0], series) ? born[0] : null
  if (removed) await tx.task.delete({ where: { id: removed.id } })

  const generatedCount = series.generatedCount - (removed ? 1 : 0)
  const rule = toRecurrenceRule({ ...series, generatedCount })
  const endedByRule =
    series.status === 'ended' &&
    !countReached(rule) &&
    (removed !== null || (archivedAt !== null && nextAfterCompletion(rule, archivedAt) === null))
  const status = endedByRule ? 'active' : series.status

  await tx.recurrence.update({
    where: { id: series.id },
    data: { generatedCount, status, nextRunAt: null },
  })

  Logger.info(
    `[recurrence] Série ${series.id} : occurrence ${task.id} restaurée, série en attente` +
      (removed ? `, occurrence ${removed.id} née de son archivage retirée` : ''),
  )
  return removed
}

/**
 * Remet en cohérence la prochaine date et l'état des séries importées
 * (POST /data/import), quel que soit le fichier : une série terminée n'a plus
 * de prochaine date, une série « après archivage » attend son occurrence au
 * tableau ou part de son dernier archivage, une série calendaire active sans
 * prochaine date repart de maintenant.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param now Maintenant
 */
export async function normalizeImportedSeries(tx: TransactionClient, now: Date): Promise<void> {
  const seriesList = await tx.recurrence.findMany()

  for (const series of seriesList) {
    let data: { nextRunAt?: Date | null; status?: string } | null = null
    if (series.status === 'ended') {
      if (series.nextRunAt) data = { nextRunAt: null }
    } else if (series.anchor === 'completion') {
      const state = await completionState(tx, series, now)
      data = { nextRunAt: state.nextRunAt, status: series.status === 'paused' ? 'paused' : state.status }
    } else if (series.status === 'active' && !series.nextRunAt) {
      data = scheduleState(series, now, await latestOccurrenceDate(tx, series.id))
    }

    if (data) await tx.recurrence.update({ where: { id: series.id }, data })
  }
}
