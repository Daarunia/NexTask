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
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Règle d'une série, telle que lue par `nextOccurrence`. */
export interface RecurrenceRule {
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
}

/** Série telle que stockée en base (Prisma) ou reçue par HTTP (dates en chaînes). */
export interface StoredRecurrenceRule {
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

/** Plus petit multiple de `step` supérieur ou égal à `value` (positif). */
function ceilToMultiple(value: number, step: number): number {
  return Math.ceil(Math.max(0, value) / step) * step
}

/**
 * Première date candidate strictement après `after`, sans tenir compte de la
 * fin de la série.
 */
function nextCandidate(rule: RecurrenceRule, after: Date): Date | null {
  const interval = Math.max(1, Math.trunc(rule.interval))
  const start = localDay(rule.startsAt)
  const startDay = dayNumber(start)
  const afterDay = dayNumber(localDay(after))

  switch (rule.frequency) {
    case 'daily': {
      // Au plus deux tours : le jour de `after` (heure déjà passée), puis le suivant
      for (let offset = ceilToMultiple(afterDay - startDay, interval); ; offset += interval) {
        const candidate = atTime(fromDayNumber(startDay + offset), rule.time)
        if (candidate > after) return candidate
      }
    }

    case 'weekly': {
      if (!rule.weekdays.length) return null

      // Semaines ISO comptées depuis le lundi de la semaine de début
      const startMonday = startDay - (isoWeekday(rule.startsAt) - 1)
      for (let week = ceilToMultiple(Math.floor((afterDay - startMonday) / 7), interval); ; week += interval) {
        for (const weekday of rule.weekdays) {
          const day = startMonday + week * 7 + weekday - 1
          // Jours de la première semaine antérieurs au début : pas d'occurrence
          if (day < startDay) continue
          const candidate = atTime(fromDayNumber(day), rule.time)
          if (candidate > after) return candidate
        }
      }
    }

    case 'monthly': {
      // Mois comptés depuis celui du début, jour selon le mode (cf. monthlyDay)
      const startMonth = start.year * 12 + start.month
      const afterLocal = localDay(after)
      for (
        let offset = ceilToMultiple(afterLocal.year * 12 + afterLocal.month - startMonth, interval);
        ;
        offset += interval
      ) {
        const year = Math.floor((startMonth + offset) / 12)
        const month = (startMonth + offset) % 12
        const candidate = atTime({ year, month, day: monthlyDay(rule, year, month) }, rule.time)
        if (candidate > after) return candidate
      }
    }

    case 'yearly': {
      for (let offset = ceilToMultiple(localDay(after).year - start.year, interval); ; offset += interval) {
        const year = start.year + offset
        const day = Math.min(start.day, daysInMonth(year, start.month))
        const candidate = atTime({ year, month: start.month, day }, rule.time)
        if (candidate > after) return candidate
      }
    }

    default:
      return null
  }
}

/**
 * Prochaine date d'une série : la première strictement après `after`, ou null
 * si la série est finie (date de fin dépassée, nombre d'occurrences atteint).
 *
 * @param rule Règle de la série
 * @param after Date de référence (exclue)
 * @returns Date de l'occurrence, ou null
 */
export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  if (rule.endType === 'afterCount' && rule.maxCount !== null && rule.generatedCount >= rule.maxCount) return null

  const candidate = nextCandidate(rule, after)
  if (!candidate) return null

  if (rule.endType === 'onDate' && rule.endsOn) {
    // Date de fin incluse jusqu'à la fin de sa journée locale
    const end = localDay(rule.endsOn)
    const limit = new Date(end.year, end.month, end.day + 1)
    if (candidate >= limit) return null
  }

  return candidate
}

/**
 * Prochaine date à générer à partir de maintenant, sans rattrapage : la
 * première après `now`, ou après le début de la série si celui-ci est à venir
 * (la tâche d'origine est la première occurrence).
 *
 * @param rule Règle de la série
 * @param now Maintenant
 * @returns Date de la prochaine occurrence, ou null si la série est finie
 */
export function nextRunAfter(rule: RecurrenceRule, now: Date): Date | null {
  return nextOccurrence(rule, now > rule.startsAt ? now : rule.startsAt)
}
