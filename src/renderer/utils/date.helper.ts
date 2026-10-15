import { intlLocale } from '../i18n'

/**
 * Dates affichées sur les cartes du tableau (date de début d'une tâche),
 * dans la langue active, relatives au jour courant.
 */

/** Place d'une date par rapport à aujourd'hui, pour la couleur de la pastille. */
export type DayState = 'past' | 'today' | 'future'

// Durée d'un jour, pour compter les jours entre deux minuits locaux
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Nombre de jours calendaires de `now` à `date` (0 le même jour, 1 demain,
 * -1 hier), sans tenir compte des heures. Passe par l'UTC des dates locales,
 * un changement d'heure ne décale donc pas le compte.
 * @param date Date comparée
 * @param now Maintenant
 */
export function dayOffset(date: Date, now: Date): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((day - today) / DAY_MS)
}

/**
 * Place d'une date par rapport au jour courant, à la journée près.
 * @param date Date comparée
 * @param now Maintenant
 */
export function dayState(date: Date, now: Date): DayState {
  const offset = dayOffset(date, now)
  if (offset < 0) return 'past'
  return offset === 0 ? 'today' : 'future'
}

/**
 * Première lettre en capitale, selon la langue (« aujourd’hui » → « Aujourd’hui »).
 * @param text Texte
 */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(intlLocale()) + text.slice(1)
}

/**
 * Libellé court d'une date pour une carte. Hier, aujourd'hui et demain sont
 * écrits en toutes lettres avec l'heure, les autres dates en jour et mois
 * (« 22 oct., 09:00 »), avec l'année si ce n'est pas l'année en cours.
 * @param date Date affichée
 * @param now Maintenant
 */
export function shortDateLabel(date: Date, now: Date): string {
  const locale = intlLocale()
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date)
  const offset = dayOffset(date, now)

  if (Math.abs(offset) <= 1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(offset, 'day')
    return `${capitalize(day)}, ${time}`
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
  return sameYear ? `${day}, ${time}` : day
}

/**
 * Date complète, pour une infobulle (« jeudi 22 octobre 2026 à 09:00 »).
 * @param date Date affichée
 */
export function longDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'full', timeStyle: 'short' }).format(date)
}
