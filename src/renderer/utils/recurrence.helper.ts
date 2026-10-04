import type {
  MonthlyMode,
  RecurrenceAnchor,
  RecurrenceInput,
  RecurrenceSummary,
} from '../../main/shared/recurrence.constants'
import {
  isoWeekday,
  localTime,
  monthlyWeekdayOf,
  nextRunAfter,
  parseWeekdays,
  type RecurrenceRule,
} from '../../main/shared/recurrence.helper'
import type { RecurrenceFormValue, RecurrencePreset } from '../schemas/task.schema'

/**
 * Libellés et conversions des tâches récurrentes côté renderer : préréglages
 * du champ « Répéter », résumé en clair d'une règle (« Toutes les 2 semaines
 * le jeudi à 14:00 », « 3 jours après l'archivage de la précédente, à
 * 09:00 »), prochaine date, et passage entre la valeur du formulaire, la
 * règle envoyée à l'API et le résumé reçu.
 *
 * Le calcul des dates est celui du main (shared/recurrence.helper).
 */

/** Jours de la semaine, du lundi (jour ISO 1) au dimanche. */
export const WEEKDAYS = [
  { value: 1, letter: 'L', name: 'lundi' },
  { value: 2, letter: 'M', name: 'mardi' },
  { value: 3, letter: 'M', name: 'mercredi' },
  { value: 4, letter: 'J', name: 'jeudi' },
  { value: 5, letter: 'V', name: 'vendredi' },
  { value: 6, letter: 'S', name: 'samedi' },
  { value: 7, letter: 'D', name: 'dimanche' },
] as const

// Jours ouvrés : du lundi au vendredi
const WORKING_DAYS = [1, 2, 3, 4, 5]

// « 3 octobre » (le 1er est corrigé par withOrdinal)
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

// « 31 déc. 2026 »
const END_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

// « jeu. 22 oct. »
const NEXT_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

// Unités de l'intervalle d'une série « après archivage », au singulier et au pluriel
const UNITS: Record<RecurrenceInput['frequency'], [string, string]> = {
  daily: ['jour', 'jours'],
  weekly: ['semaine', 'semaines'],
  monthly: ['mois', 'mois'],
  yearly: ['an', 'ans'],
}

/** Règle d'une série à décrire. */
interface RecurrenceDescription {
  anchor: RecurrenceAnchor
  frequency: RecurrenceInput['frequency']
  interval: number
  weekdays: number[]
  monthlyMode: MonthlyMode
  startsAt: Date // donne l'heure, le jour du mois et la date de l'année
  endType: RecurrenceInput['endType']
  endsOn: Date | null
  maxCount: number | null
  leadDays: number
}

/**
 * Jour du mois en toutes lettres : « 1er », puis « 2 », « 3 »…
 * @param day Jour du mois
 */
export function ordinalDay(day: number): string {
  return day === 1 ? '1er' : String(day)
}

/**
 * Rang en toutes lettres : « 1er », puis « 2e », « 3e »…
 * @param rank Rang (à partir de 1)
 */
export function ordinalRank(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`
}

/**
 * Jour du mois d'une série mensuelle, déduit de sa date de début : « le 15 »,
 * « le 3e jeudi » (« le dernier jeudi » pour un 5e jeudi) ou « le dernier jour ».
 * @param mode Mode du mensuel
 * @param startDate Date de début de la série
 */
export function monthlyDayLabel(mode: MonthlyMode, startDate: Date): string {
  switch (mode) {
    case 'nthWeekday': {
      const { rank, weekday } = monthlyWeekdayOf(startDate)
      return `le ${rank === -1 ? 'dernier' : ordinalRank(rank)} ${WEEKDAYS[weekday - 1].name}`
    }
    case 'lastDay':
      return 'le dernier jour'
    default:
      return `le ${ordinalDay(startDate.getDate())}`
  }
}

/**
 * Choix du jour du mois d'une règle mensuelle personnalisée, libellés depuis
 * la date de début.
 * @param startDate Date de début (aujourd'hui si absente)
 */
export function monthlyModeOptions(startDate: Date | null): { value: MonthlyMode; label: string }[] {
  const date = startDate ?? new Date()
  return (['dayOfMonth', 'nthWeekday', 'lastDay'] as const).map((value) => ({
    value,
    label: monthlyDayLabel(value, date),
  }))
}

/**
 * Date formatée, le 1er du mois écrit « 1er ».
 * @param format Format de date
 * @param date Date
 */
function withOrdinal(format: Intl.DateTimeFormat, date: Date): string {
  return format
    .formatToParts(date)
    .map((part) => (part.type === 'day' ? ordinalDay(Number(part.value)) : part.value))
    .join('')
}

/**
 * Énumération en français : « a », « a et b », « a, b et c ».
 * @param items Éléments
 */
function enumerate(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`
}

/**
 * Vrai si les deux listes de jours sont identiques (mêmes jours, même ordre).
 * @param a Première liste
 * @param b Seconde liste
 */
function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index])
}

/**
 * Intervalle avec son unité : « 3 jours », « 1 semaine », « 2 mois ».
 * @param frequency Fréquence
 * @param interval Intervalle
 */
export function intervalLabel(frequency: RecurrenceInput['frequency'], interval: number): string {
  const [singular, plural] = UNITS[frequency]
  return `${interval} ${interval === 1 ? singular : plural}`
}

/**
 * Fréquence en toutes lettres, sans l'heure ni la fin.
 * @param rule Règle
 */
function describeFrequency(rule: RecurrenceDescription): string {
  const n = rule.interval

  switch (rule.frequency) {
    case 'daily':
      return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`
    case 'weekly': {
      if (n === 1 && sameDays(rule.weekdays, WORKING_DAYS)) return 'Tous les jours ouvrés'
      const days = enumerate(rule.weekdays.map((day) => `le ${WEEKDAYS[day - 1].name}`))
      const every = n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`
      return `${every} ${days}`
    }
    case 'monthly': {
      const every = n === 1 ? 'Tous les mois' : `Tous les ${n} mois`
      return `${every} ${monthlyDayLabel(rule.monthlyMode, rule.startsAt)}`
    }
    case 'yearly': {
      const every = n === 1 ? 'Tous les ans' : `Tous les ${n} ans`
      return `${every} le ${withOrdinal(DAY_MONTH_FORMAT, rule.startsAt)}`
    }
  }
}

/**
 * Création anticipée en toutes lettres : « créée 2 jours avant ».
 * @param days Jours d'avance (au moins 1)
 */
function describeLeadDays(days: number): string {
  return `créée ${days} ${days === 1 ? 'jour' : 'jours'} avant`
}

/**
 * Résumé en clair d'une règle, ex. « Toutes les 2 semaines le jeudi à 14:00,
 * jusqu'au 31 déc. 2026 » ou « 3 jours après l'archivage de la précédente, à
 * 09:00 ».
 * @param rule Règle
 */
function describeRule(rule: RecurrenceDescription): string {
  let end = ''
  if (rule.endType === 'onDate' && rule.endsOn) end = `, jusqu'au ${withOrdinal(END_DATE_FORMAT, rule.endsOn)}`
  if (rule.endType === 'afterCount' && rule.maxCount) end = `, ${rule.maxCount} fois`
  const lead = rule.leadDays > 0 ? `, ${describeLeadDays(rule.leadDays)}` : ''
  const time = localTime(rule.startsAt)

  if (rule.anchor === 'completion') {
    return `${intervalLabel(rule.frequency, rule.interval)} après l'archivage de la précédente, à ${time}${end}${lead}`
  }
  return `${describeFrequency(rule)} à ${time}${end}${lead}`
}

/**
 * Résumé en clair d'une série reçue du serveur.
 * @param summary Résumé de la série
 */
export function describeRecurrence(summary: RecurrenceSummary): string {
  return describeRule({
    anchor: summary.anchor ?? 'schedule',
    frequency: summary.frequency,
    interval: summary.interval,
    weekdays: parseWeekdays(summary.weekdays),
    monthlyMode: summary.monthlyMode ?? 'dayOfMonth',
    startsAt: new Date(summary.startsAt),
    endType: summary.endType,
    endsOn: summary.endsOn ? new Date(summary.endsOn) : null,
    maxCount: summary.maxCount,
    leadDays: summary.leadDays ?? 0,
  })
}

/**
 * Résumé en clair d'une règle saisie.
 * @param input Règle saisie
 * @param startDate Date de début de la tâche
 */
export function describeRecurrenceInput(input: RecurrenceInput, startDate: Date): string {
  return describeRule({
    anchor: input.anchor ?? 'schedule',
    frequency: input.frequency,
    interval: input.interval,
    weekdays: [...(input.weekdays ?? [])].sort((a, b) => a - b),
    monthlyMode: input.monthlyMode ?? 'dayOfMonth',
    startsAt: startDate,
    endType: input.endType,
    endsOn: input.endsOn ? new Date(input.endsOn) : null,
    maxCount: input.maxCount ?? null,
    leadDays: input.leadDays ?? 0,
  })
}

/**
 * Prochaine date au format court, ex. « jeu. 22 oct. 09:00 ».
 * @param date Date
 */
export function formatNextRun(date: Date): string {
  return `${withOrdinal(NEXT_DATE_FORMAT, date)} ${localTime(date)}`
}

/** Libellé d'une série en attente de l'archivage de son occurrence (mode « après archivage »). */
export const WAITING_FOR_ARCHIVE_LABEL = 'Après archivage'

/**
 * Vrai pour une série « après archivage » qui attend l'archivage de son
 * occurrence au tableau : active, sans prochaine date.
 * @param summary Résumé de la série
 */
export function isWaitingForArchive(summary: RecurrenceSummary): boolean {
  return summary.anchor === 'completion' && summary.status === 'active' && !summary.nextRunAt
}

/**
 * Infobulle de l'icône d'une tâche récurrente : résumé de la série, puis sa
 * prochaine date ou son état.
 * @param summary Résumé de la série
 */
export function recurrenceTooltip(summary: RecurrenceSummary): string {
  let state = 'Série arrêtée'
  if (summary.status === 'paused') state = 'Série en pause'
  if (isWaitingForArchive(summary)) state = `Prochaine : ${WAITING_FOR_ARCHIVE_LABEL.toLowerCase()}`
  if (summary.status === 'active' && summary.nextRunAt) {
    state = `Prochaine : ${formatNextRun(new Date(summary.nextRunAt))}`
  }

  return `${describeRecurrence(summary)}\n${state}`
}

/**
 * Libellés des choix du champ « Répéter », calculés depuis la date de début.
 * @param startDate Date de début (aujourd'hui si absente)
 */
export function recurrencePresetOptions(startDate: Date | null): { value: RecurrencePreset; label: string }[] {
  const date = startDate ?? new Date()
  return [
    { value: 'none', label: 'Ne pas répéter' },
    { value: 'daily', label: 'Tous les jours' },
    { value: 'weekdays', label: 'Tous les jours ouvrés (lun–ven)' },
    { value: 'weekly', label: `Toutes les semaines le ${WEEKDAYS[isoWeekday(date) - 1].name}` },
    { value: 'monthly', label: `Tous les mois le ${ordinalDay(date.getDate())}` },
    { value: 'yearly', label: `Tous les ans le ${withOrdinal(DAY_MONTH_FORMAT, date)}` },
    { value: 'custom', label: 'Personnaliser…' },
  ]
}

/**
 * Règle d'un préréglage : selon le calendrier, sans fin, sans empiler les
 * occurrences et créées le jour même.
 * @param preset Préréglage (ni `none`, ni `custom`)
 * @param startDate Date de début de la tâche
 */
function presetInput(preset: Exclude<RecurrencePreset, 'none' | 'custom'>, startDate: Date): RecurrenceInput {
  const base = { anchor: 'schedule' as const, interval: 1, endType: 'never' as const, skipIfPending: true, leadDays: 0 }
  switch (preset) {
    case 'daily':
      return { ...base, frequency: 'daily' }
    case 'weekdays':
      return { ...base, frequency: 'weekly', weekdays: [...WORKING_DAYS] }
    case 'weekly':
      return { ...base, frequency: 'weekly', weekdays: [isoWeekday(startDate)] }
    case 'monthly':
      return { ...base, frequency: 'monthly', monthlyMode: 'dayOfMonth' }
    case 'yearly':
      return { ...base, frequency: 'yearly' }
  }
}

/**
 * Règle sous une forme comparable : seuls les champs propres au mode, à la
 * fréquence et à la fin choisis, jours triés. En mode « après archivage »,
 * jours de la semaine et mode du mensuel sont retirés, et « Ne pas empiler »
 * prend sa valeur par défaut (comme côté serveur).
 * @param input Règle
 */
function normalizeInput(input: RecurrenceInput): RecurrenceInput {
  const anchor = input.anchor ?? 'schedule'
  const calendar = anchor === 'schedule'
  return {
    anchor,
    frequency: input.frequency,
    interval: input.interval,
    ...(calendar && input.frequency === 'weekly' && { weekdays: [...(input.weekdays ?? [])].sort((a, b) => a - b) }),
    ...(calendar && input.frequency === 'monthly' && { monthlyMode: input.monthlyMode ?? 'dayOfMonth' }),
    endType: input.endType,
    ...(input.endType === 'onDate' && { endsOn: input.endsOn ? new Date(input.endsOn).toISOString() : null }),
    ...(input.endType === 'afterCount' && { maxCount: input.maxCount ?? null }),
    skipIfPending: calendar ? input.skipIfPending : true,
    leadDays: input.leadDays ?? 0,
  }
}

/**
 * Vrai si deux règles sont identiques (même mode, même calendrier, même fin).
 * @param a Première règle
 * @param b Seconde règle
 */
export function sameRecurrenceInput(a: RecurrenceInput | null, b: RecurrenceInput | null): boolean {
  if (!a || !b) return a === b
  return JSON.stringify(normalizeInput(a)) === JSON.stringify(normalizeInput(b))
}

/**
 * Règle d'une série reçue du serveur.
 * @param summary Résumé de la série
 */
export function summaryToInput(summary: RecurrenceSummary): RecurrenceInput {
  return normalizeInput({
    anchor: summary.anchor ?? 'schedule',
    frequency: summary.frequency,
    interval: summary.interval,
    weekdays: parseWeekdays(summary.weekdays),
    monthlyMode: summary.monthlyMode,
    endType: summary.endType,
    endsOn: summary.endsOn,
    maxCount: summary.maxCount,
    skipIfPending: summary.skipIfPending,
    leadDays: summary.leadDays ?? 0,
  })
}

/** Valeur du champ « Répéter » d'une tâche qui ne se répète pas. */
export function defaultRecurrenceValue(): RecurrenceFormValue {
  return {
    preset: 'none',
    anchor: 'schedule',
    interval: 1,
    frequency: 'weekly',
    weekdays: [],
    monthlyMode: 'dayOfMonth',
    endType: 'never',
    endsOn: null,
    maxCount: 10,
    skipIfPending: true,
    createEarly: false,
    leadDays: 1,
  }
}

/**
 * Champs de la règle personnalisée remplis depuis une règle, choix du champ
 * « Répéter » inchangé.
 * @param value Valeur du champ
 * @param input Règle
 */
function withCustomFields(value: RecurrenceFormValue, input: RecurrenceInput): RecurrenceFormValue {
  return {
    ...value,
    anchor: input.anchor ?? 'schedule',
    interval: input.interval,
    frequency: input.frequency,
    weekdays: [...(input.weekdays ?? [])].sort((a, b) => a - b),
    monthlyMode: input.monthlyMode ?? 'dayOfMonth',
    endType: input.endType,
    endsOn: input.endsOn ? new Date(input.endsOn) : null,
    maxCount: input.maxCount ?? value.maxCount,
    skipIfPending: input.skipIfPending,
    createEarly: (input.leadDays ?? 0) > 0,
    leadDays: input.leadDays || value.leadDays,
  }
}

/**
 * Valeur du champ « Répéter » d'une tâche existante : le préréglage qui
 * correspond à sa série, ou « Personnaliser… ». Une série terminée s'affiche
 * comme « Ne pas répéter ».
 * @param summary Résumé de la série de la tâche, s'il y en a une
 * @param startDate Date de début de la tâche
 */
export function toRecurrenceValue(
  summary: RecurrenceSummary | null | undefined,
  startDate: Date | null,
): RecurrenceFormValue {
  const value = defaultRecurrenceValue()
  if (!summary || summary.status === 'ended') return value

  const input = summaryToInput(summary)
  const presets = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const
  const preset = startDate
    ? presets.find((candidate) => sameRecurrenceInput(presetInput(candidate, startDate), input))
    : undefined

  return withCustomFields({ ...value, preset: preset ?? 'custom' }, input)
}

/**
 * Valeur du champ quand « Personnaliser… » est choisi : la règle
 * personnalisée part du préréglage précédent (une semaine sur le jour de la
 * date de début s'il n'y en avait pas), pour n'avoir qu'à l'ajuster.
 * @param value Valeur du champ avant le choix
 * @param startDate Date de début de la tâche
 */
export function toCustomValue(value: RecurrenceFormValue, startDate: Date | null): RecurrenceFormValue {
  const date = startDate ?? new Date()
  const from = value.preset === 'none' || value.preset === 'custom' ? 'weekly' : value.preset
  const input = { ...presetInput(from, date), skipIfPending: value.skipIfPending }
  return withCustomFields({ ...value, preset: 'custom' }, input)
}

/**
 * Règle à envoyer à l'API, ou null pour « Ne pas répéter ».
 * @param value Valeur du champ « Répéter », déjà validée
 * @param startDate Date de début de la tâche (obligatoire pour répéter)
 */
export function toRecurrenceInput(value: RecurrenceFormValue, startDate: Date | null): RecurrenceInput | null {
  if (value.preset === 'none' || !startDate) return null
  if (value.preset !== 'custom') return presetInput(value.preset, startDate)

  return normalizeInput({
    anchor: value.anchor,
    frequency: value.frequency,
    interval: value.interval ?? 1,
    weekdays: value.weekdays,
    monthlyMode: value.monthlyMode,
    endType: value.endType,
    endsOn: value.endsOn ? value.endsOn.toISOString() : null,
    maxCount: value.maxCount,
    skipIfPending: value.skipIfPending,
    leadDays: value.createEarly ? (value.leadDays ?? 0) : 0,
  })
}

/**
 * Prochaine date qu'aurait une série créée maintenant avec cette règle (la
 * tâche elle-même étant la première occurrence), ou null si elle n'en a pas.
 * Une série « après archivage » n'a pas de date d'avance : elle attend
 * l'archivage de la tâche (null aussi).
 * @param input Règle
 * @param startDate Date de début de la tâche
 * @param generatedCount Occurrences déjà créées, tâche d'origine comprise
 */
export function previewNextRun(input: RecurrenceInput, startDate: Date, generatedCount = 1): Date | null {
  if (input.anchor === 'completion') return null

  const rule: RecurrenceRule = {
    anchor: 'schedule',
    frequency: input.frequency,
    interval: input.interval,
    weekdays: input.weekdays ?? [],
    monthlyMode: input.monthlyMode ?? null,
    time: localTime(startDate),
    startsAt: startDate,
    endType: input.endType,
    endsOn: input.endsOn ? new Date(input.endsOn) : null,
    maxCount: input.maxCount ?? null,
    generatedCount,
    leadDays: input.leadDays ?? 0,
  }
  return nextRunAfter(rule, new Date())
}
