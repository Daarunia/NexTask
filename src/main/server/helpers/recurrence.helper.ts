import type { Prisma, Recurrence, Task } from '../../prisma/generated/prisma/client.js'
import type { RecurrenceInput } from '../../shared/recurrence.constants.js'
import { formatWeekdays, localTime, nextRunAfter, toRecurrenceRule } from '../../shared/recurrence.helper.js'
import Logger from 'electron-log'

/**
 * Helpers des séries récurrentes, partagés par les routes des tâches et des
 * séries : contrôle d'une règle saisie, création d'une série depuis sa tâche
 * d'origine, modification de sa règle, de son modèle ou de son état.
 *
 * Le calcul des dates est dans shared/recurrence.helper (fonctions pures).
 */

/** Client Prisma utilisable dans une transaction interactive. */
type TransactionClient = Prisma.TransactionClient

/** Champs de la règle d'une série, tels qu'écrits en base. */
type RuleData = Pick<
  Recurrence,
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
>

// Champs du calendrier d'une série : les modifier recale la série sur la tâche modifiée
const SCHEDULE_FIELDS = ['frequency', 'interval', 'weekdays', 'monthlyMode', 'endType', 'maxCount'] as const

/**
 * Début de la journée locale d'une date.
 *
 * @param date Date
 */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Contrôle d'une règle saisie au-delà de sa structure (déjà validée par le
 * schéma) : date de début de la tâche, jours de la semaine, date ou nombre de fin.
 *
 * @param input Règle saisie
 * @param startDate Date de début de la tâche, une fois modifiée
 * @returns Le motif du refus, ou `null` si la règle est valable
 */
export function recurrenceInputProblem(input: RecurrenceInput, startDate: Date | null): string | null {
  if (!startDate) return 'Une tâche récurrente doit avoir une date de début'
  if (input.frequency === 'weekly' && !input.weekdays?.length) return 'Choisis au moins un jour de la semaine'

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
 * Règle à écrire en base : champs propres à la fréquence et à la fin choisies
 * (les autres à null), heure et début tirés de la date de début de la tâche.
 *
 * @param input Règle saisie, déjà contrôlée
 * @param startDate Date de début de la tâche
 */
function toRuleData(input: RecurrenceInput, startDate: Date): RuleData {
  return {
    frequency: input.frequency,
    interval: input.interval,
    weekdays: input.frequency === 'weekly' ? formatWeekdays(input.weekdays) : null,
    monthlyMode: input.frequency === 'monthly' ? 'dayOfMonth' : null,
    time: localTime(startDate),
    startsAt: startDate,
    endType: input.endType,
    endsOn: input.endType === 'onDate' && input.endsOn ? startOfLocalDay(new Date(input.endsOn)) : null,
    maxCount: input.endType === 'afterCount' ? (input.maxCount ?? null) : null,
    skipIfPending: input.skipIfPending ?? true,
  }
}

/**
 * Règle actuelle d'une série, sans son modèle ni son état.
 *
 * @param series Série
 */
function ruleOf(series: Recurrence): RuleData {
  const { frequency, interval, weekdays, monthlyMode, time, startsAt, endType, endsOn, maxCount, skipIfPending } =
    series
  return { frequency, interval, weekdays, monthlyMode, time, startsAt, endType, endsOn, maxCount, skipIfPending }
}

/**
 * Vrai si le calendrier de la série change (fréquence, intervalle, jours, fin).
 * La seule date de début de l'occurrence modifiée ne le change pas.
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
 * Prochaine date et état d'une série qui (re)démarre maintenant, sans
 * rattrapage : terminée si sa règle ne donne plus aucune date.
 *
 * @param series Règle de la série (et nombre d'occurrences déjà créées)
 * @param now Maintenant
 */
function restartFields(series: RuleData & Pick<Recurrence, 'generatedCount'>, now: Date) {
  const nextRunAt = nextRunAfter(toRecurrenceRule(series), now)
  return { nextRunAt, status: nextRunAt ? 'active' : 'ended' }
}

/**
 * Crée une série depuis sa tâche d'origine, première occurrence : le modèle
 * des occurrences reprend son contenu, sa colonne et ses tags.
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
      ...restartFields({ ...rule, generatedCount: 1 }, now),
      generatedCount: 1,
      title: task.title,
      description: task.description,
      version: task.version,
      stageId: task.stageId,
      tags: { connect: tagIds.map((id) => ({ id })) },
    },
  })

  await tx.task.update({ where: { id: task.id }, data: { recurrenceId: series.id, occurrenceDate: startDate } })

  Logger.info(`[recurrence] Série ${series.id} créée depuis la tâche ${task.id}, prochaine : ${series.nextRunAt}`)
  return series.id
}

/**
 * Modifie la règle d'une série depuis l'une de ses occurrences. Un calendrier
 * modifié est recalé sur la date de début de cette occurrence, et une série
 * arrêtée est relancée. Dans les deux cas, la prochaine date est recalculée
 * depuis maintenant, sans rattrapage. Une règle inchangée sur une série active
 * ne modifie rien.
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
  const skipChanged = series.skipIfPending !== rule.skipIfPending

  if (!rescheduled && !skipChanged && series.status === 'active') return

  // Sans changement de calendrier, la série garde son début (et son jour du mois)
  const nextRule: RuleData = rescheduled ? rule : { ...ruleOf(series), skipIfPending: rule.skipIfPending }
  const restart = rescheduled || series.status !== 'active'

  await tx.recurrence.update({
    where: { id: series.id },
    data: {
      ...nextRule,
      ...(restart && restartFields({ ...nextRule, generatedCount: series.generatedCount }, now)),
    },
  })

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
 * Change l'état d'une série. Une série réactivée repart de maintenant, sans
 * rattrapage ; une série mise en pause garde sa prochaine date ; une série
 * arrêtée n'en a plus.
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
    data = restartFields(series, now)
  } else if (status === 'ended') {
    data = { status, nextRunAt: null }
  } else {
    data = { status }
  }

  const updated = await tx.recurrence.update({ where: { id: series.id }, data })
  Logger.info(`[recurrence] Série ${series.id} : ${series.status} → ${updated.status}`)
  return updated
}
