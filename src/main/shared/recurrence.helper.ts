/**
 * Calcul des dates d'une série récurrente, partagé entre le main (génération
 * des occurrences, API) et le renderer (aperçu « Prochaine : … »).
 *
 * Fonctions pures, fichier sans import (cf. settings.constants.ts). Les dates
 * sont calculées en heure locale et manipulées en `Date` (stockées en UTC) :
 * - l'intervalle se compte depuis la période de la date de début (jour,
 *   semaine ISO, mois ou année), pas depuis la dernière occurrence générée ;
 * - un jour 29, 30 ou 31 absent du mois tombe sur son dernier jour, un 29 février
 *   sur le 28 les années non bissextiles ;
 * - en mensuel « Ne jour de la semaine », le rang et le jour sont ceux de la
 *   date de début (3e jeudi), un 5e jour de la semaine devenant le dernier du
 *   mois (le 5e jeudi n'existe pas tous les mois) ;
 * - une heure qui n'existe pas (passage à l'heure d'été, 02:30) est décalée
 *   d'autant (03:30), une heure ambiguë (retour à l'heure d'hiver) est la
 *   première des deux : c'est le comportement du constructeur `Date` en heure
 *   locale, imposé par la norme ECMAScript.
 *
 * Création anticipée : une occurrence est créée `leadDays` jours (du
 * calendrier) avant sa date, à l'heure de la série. La prochaine date d'une
 * série (`nextRunAt`) reste celle de l'occurrence, sa date de création s'en
 * déduit (cf. occurrenceCreationDate).
 *
 * Mode « après archivage » (`anchor: 'completion'`) : la prochaine date part
 * du jour local de l'archivage de l'occurrence précédente, plus l'intervalle,
 * à l'heure de la série (cf. nextAfterCompletion). Seuls la fréquence et
 * l'intervalle comptent ; la fin, l'heure et la création anticipée
 * s'appliquent comme en mode calendrier.
 *
 * Une règle illisible (heure, début ou intervalle invalides, données
 * importées par exemple) ne donne aucune date, plutôt qu'une boucle sans fin.
 */

const DAY_MS = 24 * 60 * 60 * 1000

// Heure locale "HH:mm" valable
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

// Dates candidates examinées au plus par recherche : quelques-unes suffisent
// pour une règle valable (cf. firstAfter), la borne protège d'une boucle sans fin
const MAX_CANDIDATES = 1000

/** Règle d'une série, telle que lue par `nextOccurrence` et `nextAfterCompletion`. */
export interface RecurrenceRule {
  anchor: 'schedule' | 'completion' // dates du calendrier, ou après l'archivage de la précédente
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  weekdays: number[] // jours ISO (lundi = 1), hebdomadaire uniquement
  monthlyMode: string | null // dayOfMonth (défaut) | nthWeekday | lastDay, cf. MONTHLY_MODES
  time: string // heure locale "HH:mm"
  startsAt: Date // première occurrence (tâche d'origine)
  endType: 'never' | 'onDate' | 'afterCount'
  endsOn: Date | null // incluse jusqu'à la fin de sa journée locale
  maxCount: number | null // nombre total d'occurrences, tâche d'origine comprise
  generatedCount: number // occurrences déjà créées, tâche d'origine comprise
  leadDays: number // création anticipée, en jours (0 = le jour même)
}

/** Série telle que stockée en base (Prisma) ou reçue par HTTP (dates en chaînes). */
export interface StoredRecurrenceRule {
  anchor?: string // absent d'un résumé antérieur au mode « après archivage »
  frequency: string
  interval: number
  weekdays: string | null
  monthlyMode: string | null
  time: string
  startsAt: Date | string
  endType: string
  endsOn: Date | string | null
  maxCount: number | null
  generatedCount: number
  leadDays?: number // absent d'un résumé antérieur à la création anticipée
}

/**
 * Jour de la semaine d'un mois : son rang (1 à 4, ou -1 pour le dernier) et
 * le jour ISO (lundi = 1). Ex. « 3e jeudi » = { rank: 3, weekday: 4 }.
 */
export interface MonthlyWeekday {
  rank: number
  weekday: number
}

/** Date du calendrier, sans heure (mois de 0 à 11, comme `Date`). */
interface CalendarDay {
  year: number
  month: number
  day: number
}

/**
 * Jours ISO d'une chaîne stockée ("1,4"), triés et dédoublonnés.
 *
 * @param value Jours séparés par des virgules, ou null
 */
export function parseWeekdays(value: string | null | undefined): number[] {
  if (!value) return []
  const days = value
    .split(',')
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  return [...new Set(days)].sort((a, b) => a - b)
}

/**
 * Jours ISO en chaîne stockée ("1,4"), ou null sans jour.
 *
 * @param days Jours ISO (lundi = 1)
 */
export function formatWeekdays(days: number[] | null | undefined): string | null {
  if (!days?.length) return null
  return [...new Set(days)].sort((a, b) => a - b).join(',')
}

/**
 * Jour ISO d'une date en heure locale (lundi = 1, dimanche = 7).
 *
 * @param date Date
 */
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

/**
 * Heure locale d'une date au format "HH:mm".
 *
 * @param date Date
 */
export function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Jour de la semaine d'une date dans son mois, en heure locale : 3e jeudi,
 * ou dernier jeudi pour un 5e jeudi (rang -1).
 *
 * @param date Date (début de la série)
 */
export function monthlyWeekdayOf(date: Date): MonthlyWeekday {
  const rank = Math.ceil(date.getDate() / 7)
  return { rank: rank >= 5 ? -1 : rank, weekday: isoWeekday(date) }
}

/**
 * Règle de calcul d'une série stockée.
 *
 * @param stored Série lue en base ou reçue par HTTP
 */
export function toRecurrenceRule(stored: StoredRecurrenceRule): RecurrenceRule {
  return {
    anchor: stored.anchor === 'completion' ? 'completion' : 'schedule',
    frequency: stored.frequency as RecurrenceRule['frequency'],
    interval: stored.interval,
    weekdays: parseWeekdays(stored.weekdays),
    monthlyMode: stored.monthlyMode,
    time: stored.time,
    startsAt: new Date(stored.startsAt),
    endType: stored.endType as RecurrenceRule['endType'],
    endsOn: stored.endsOn ? new Date(stored.endsOn) : null,
    maxCount: stored.maxCount,
    generatedCount: stored.generatedCount,
    leadDays: stored.leadDays ?? 0,
  }
}

/** Numéro de jour (jours depuis le 1er janvier 1970) d'une date du calendrier. */
function dayNumber({ year, month, day }: CalendarDay): number {
  return Math.round(Date.UTC(year, month, day) / DAY_MS)
}

/** Date du calendrier d'un numéro de jour. */
function fromDayNumber(value: number): CalendarDay {
  const date = new Date(value * DAY_MS)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}

/** Date du calendrier d'une date, en heure locale. */
function localDay(date: Date): CalendarDay {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
}

/** Nombre de jours d'un mois. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Jour ISO (lundi = 1) d'une date du calendrier. */
function calendarWeekday(year: number, month: number, day: number): number {
  return ((new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7) + 1
}

/**
 * Jour du mois d'un « Ne jour de la semaine » : le 1er à 4e existe dans
 * tous les mois (au plus le 28), le dernier se compte depuis la fin du mois.
 */
function nthWeekdayDay(year: number, month: number, { rank, weekday }: MonthlyWeekday): number {
  if (rank === -1) {
    const last = daysInMonth(year, month)
    return last - ((calendarWeekday(year, month, last) - weekday + 7) % 7)
  }
  return 1 + ((weekday - calendarWeekday(year, month, 1) + 7) % 7) + (rank - 1) * 7
}

/**
 * Jour d'occurrence d'une série mensuelle dans un mois, selon son mode : jour
 * fixe (ramené au dernier jour des mois trop courts), « Ne jour de la
 * semaine » de la date de début, ou dernier jour du mois.
 */
function monthlyDay(rule: RecurrenceRule, year: number, month: number): number {
  switch (rule.monthlyMode) {
    case 'nthWeekday':
      return nthWeekdayDay(year, month, monthlyWeekdayOf(rule.startsAt))
    case 'lastDay':
      return daysInMonth(year, month)
    default:
      return Math.min(rule.startsAt.getDate(), daysInMonth(year, month))
  }
}

/**
 * Date d'un jour du calendrier à une heure locale "HH:mm". Heure inexistante
 * décalée d'autant, heure ambiguë résolue sur la première (norme ECMAScript).
 */
function atTime({ year, month, day }: CalendarDay, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month, day, hours, minutes, 0, 0)
}

/**
 * Début de la journée locale d'une date (comparaison de jours).
 *
 * @param date Date
 */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Vrai pour une date valable (ni `Invalid Date`, ni hors bornes). */
function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime())
}

/**
 * Vrai si la règle permet un calcul : heure "HH:mm", début valable, intervalle
 * entier d'au moins 1. Sans cela, les recherches de date ne finiraient pas.
 */
function isComputable(rule: RecurrenceRule): boolean {
  return (
    TIME_PATTERN.test(rule.time) && isValidDate(rule.startsAt) && Number.isInteger(rule.interval) && rule.interval >= 1
  )
}

/** Plus petit multiple de `step` supérieur ou égal à `value` (positif). */
function ceilToMultiple(value: number, step: number): number {
  return Math.ceil(Math.max(0, value) / step) * step
}

/**
 * Première date strictement après `after` parmi les périodes `first`,
 * `first + step`… (jours, semaines, mois ou années selon l'appelant), bornée
 * à MAX_CANDIDATES périodes.
 *
 * @param after Date de référence (exclue)
 * @param first Première période examinée
 * @param step Intervalle entre deux périodes
 * @param candidatesOf Dates d'une période, dans l'ordre (vide si aucune)
 */
function firstAfter(after: Date, first: number, step: number, candidatesOf: (period: number) => Date[]): Date | null {
  for (let i = 0, period = first; i < MAX_CANDIDATES; i++, period += step) {
    const candidate = candidatesOf(period).find((date) => date > after)
    if (candidate) return candidate
  }
  return null
}

/** Quotidien : jours comptés depuis le jour de début. */
function nextDaily(rule: RecurrenceRule, after: Date): Date | null {
  const startDay = dayNumber(localDay(rule.startsAt))
  const first = ceilToMultiple(dayNumber(localDay(after)) - startDay, rule.interval)
  return firstAfter(after, first, rule.interval, (offset) => [atTime(fromDayNumber(startDay + offset), rule.time)])
}

/** Hebdomadaire : semaines ISO comptées depuis le lundi de la semaine de début. */
function nextWeekly(rule: RecurrenceRule, after: Date): Date | null {
  if (!rule.weekdays.length) return null

  const startDay = dayNumber(localDay(rule.startsAt))
  const startMonday = startDay - (isoWeekday(rule.startsAt) - 1)
  const first = ceilToMultiple(Math.floor((dayNumber(localDay(after)) - startMonday) / 7), rule.interval)
  return firstAfter(after, first, rule.interval, (week) =>
    rule.weekdays
      .map((weekday) => startMonday + week * 7 + weekday - 1)
      // Jours de la première semaine antérieurs au début : pas d'occurrence
      .filter((day) => day >= startDay)
      .map((day) => atTime(fromDayNumber(day), rule.time)),
  )
}

/** Mensuel : mois comptés depuis celui du début, jour selon le mode (cf. monthlyDay). */
function nextMonthly(rule: RecurrenceRule, after: Date): Date | null {
  const start = localDay(rule.startsAt)
  const afterDay = localDay(after)
  const startMonth = start.year * 12 + start.month
  const first = ceilToMultiple(afterDay.year * 12 + afterDay.month - startMonth, rule.interval)
  return firstAfter(after, first, rule.interval, (offset) => {
    const year = Math.floor((startMonth + offset) / 12)
    const month = (startMonth + offset) % 12
    return [atTime({ year, month, day: monthlyDay(rule, year, month) }, rule.time)]
  })
}

/** Annuel : années comptées depuis celle du début, 29 février ramené au 28. */
function nextYearly(rule: RecurrenceRule, after: Date): Date | null {
  const start = localDay(rule.startsAt)
  const first = ceilToMultiple(localDay(after).year - start.year, rule.interval)
  return firstAfter(after, first, rule.interval, (offset) => {
    const year = start.year + offset
    return [atTime({ year, month: start.month, day: Math.min(start.day, daysInMonth(year, start.month)) }, rule.time)]
  })
}

/** Recherche de la prochaine date candidate d'une série calendaire, par fréquence. */
const NEXT_CANDIDATE: Record<RecurrenceRule['frequency'], (rule: RecurrenceRule, after: Date) => Date | null> = {
  daily: nextDaily,
  weekly: nextWeekly,
  monthly: nextMonthly,
  yearly: nextYearly,
}

/**
 * Vrai si la série a atteint son nombre d'occurrences (fin « après N
 * occurrences », tâche d'origine comprise).
 *
 * @param rule Fin et nombre d'occurrences de la série
 */
export function countReached(rule: Pick<RecurrenceRule, 'endType' | 'maxCount' | 'generatedCount'>): boolean {
  return rule.endType === 'afterCount' && rule.maxCount !== null && rule.generatedCount >= rule.maxCount
}

/**
 * La date si la série ne s'est pas terminée avant elle (date de fin incluse
 * jusqu'à la fin de sa journée locale), null sinon.
 */
function withinEnd(rule: RecurrenceRule, candidate: Date | null): Date | null {
  if (!candidate || rule.endType !== 'onDate' || !rule.endsOn) return candidate

  const end = localDay(rule.endsOn)
  return candidate < new Date(end.year, end.month, end.day + 1) ? candidate : null
}

/**
 * Prochaine date d'une série calendaire : la première strictement après
 * `after`, ou null si la série est finie (date de fin dépassée, nombre
 * d'occurrences atteint) ou sa règle illisible.
 *
 * @param rule Règle de la série
 * @param after Date de référence (exclue)
 * @returns Date de l'occurrence, ou null
 */
export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  if (countReached(rule) || !isComputable(rule) || !isValidDate(after)) return null

  const search = NEXT_CANDIDATE[rule.frequency]
  return search ? withinEnd(rule, search(rule, after)) : null
}

/**
 * Prochaine date à générer à partir de maintenant, sans rattrapage : la
 * première après `now`, ou après le début de la série si celui-ci est à venir
 * (la tâche d'origine est la première occurrence). Mode calendrier.
 *
 * @param rule Règle de la série
 * @param now Maintenant
 * @returns Date de la prochaine occurrence, ou null si la série est finie
 */
export function nextRunAfter(rule: RecurrenceRule, now: Date): Date | null {
  return nextOccurrence(rule, now > rule.startsAt ? now : rule.startsAt)
}

/**
 * Prochaine date d'une série « après archivage » : jour local de l'archivage
 * plus l'intervalle (jours, semaines, mois ou années), à l'heure de la série.
 * En mensuel et annuel, un jour absent du mois d'arrivée tombe sur son
 * dernier jour (31 janvier + 1 mois = 28 ou 29 février). Null si la série est
 * finie (nombre d'occurrences atteint, date de fin dépassée) ou sa règle
 * illisible. Les jours de la semaine et le mode du mensuel sont ignorés.
 *
 * @param rule Règle de la série
 * @param archivedAt Date de l'archivage de l'occurrence précédente
 * @returns Date de la prochaine occurrence, ou null
 */
export function nextAfterCompletion(rule: RecurrenceRule, archivedAt: Date): Date | null {
  if (countReached(rule) || !isComputable(rule) || !isValidDate(archivedAt)) return null

  const day = localDay(archivedAt)
  let target: CalendarDay
  if (rule.frequency === 'daily' || rule.frequency === 'weekly') {
    const days = rule.interval * (rule.frequency === 'weekly' ? 7 : 1)
    target = fromDayNumber(dayNumber(day) + days)
  } else if (rule.frequency === 'monthly' || rule.frequency === 'yearly') {
    const months = day.year * 12 + day.month + rule.interval * (rule.frequency === 'yearly' ? 12 : 1)
    const year = Math.floor(months / 12)
    const month = months % 12
    target = { year, month, day: Math.min(day.day, daysInMonth(year, month)) }
  } else {
    return null
  }

  return withinEnd(rule, atTime(target, rule.time))
}

/**
 * Vrai si la série peut encore donner une date à partir de maintenant : une
 * série arrêtée par l'utilisateur est réactivable, pas une série arrivée à sa
 * date de fin ou à son nombre d'occurrences.
 *
 * @param rule Règle de la série
 * @param now Maintenant
 */
export function hasNextDate(rule: RecurrenceRule, now: Date): boolean {
  const next = rule.anchor === 'completion' ? nextAfterCompletion(rule, now) : nextRunAfter(rule, now)
  return next !== null
}

/**
 * Date de création d'une occurrence : `leadDays` jours du calendrier avant sa
 * date, à l'heure de la série (heure locale, changements d'heure compris), ou
 * sa date elle-même sans création anticipée.
 *
 * @param rule Délai et heure de la série
 * @param date Date de l'occurrence
 */
export function occurrenceCreationDate(rule: Pick<RecurrenceRule, 'leadDays' | 'time'>, date: Date): Date {
  if (!rule.leadDays) return date
  const day = localDay(date)
  return atTime({ ...day, day: day.day - rule.leadDays }, rule.time)
}

/**
 * Occurrence à créer à `now`, à partir de la prochaine date d'une série : la
 * plus récente des dates dont l'heure de création est passée. Les dates
 * précédentes sont sautées (rattrapage d'une app restée fermée) et ne
 * comptent pas dans le nombre d'occurrences. En mode « après archivage », la
 * série n'a qu'une date à la fois : elle est créée telle quelle, même passée
 * (reprise sans rattrapage).
 *
 * @param rule Règle de la série
 * @param nextRunAt Prochaine date de la série
 * @param now Maintenant
 * @returns Date à créer et dates sautées, ou null si sa création n'est pas encore venue
 */
export function dueOccurrence(
  rule: RecurrenceRule,
  nextRunAt: Date,
  now: Date,
): { date: Date; skipped: Date[] } | null {
  if (!(occurrenceCreationDate(rule, nextRunAt) <= now)) return null
  if (rule.anchor === 'completion') return { date: nextRunAt, skipped: [] }

  let date = nextRunAt
  const skipped: Date[] = []
  for (
    let next = nextOccurrence(rule, date);
    next && occurrenceCreationDate(rule, next) <= now;
    next = nextOccurrence(rule, date)
  ) {
    skipped.push(date)
    date = next
  }

  return { date, skipped }
}
