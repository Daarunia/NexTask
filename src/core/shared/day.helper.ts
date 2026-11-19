/**
 * Jours calendaires locaux, partagés entre le renderer (cartes, Planning) et
 * le serveur MCP (retards, agenda). L'heure courante est toujours passée en
 * paramètre ; le fuseau est celui du process.
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
 * Clé locale d'un jour (`YYYY-MM-DD`), jamais `toISOString`, qui décalerait le
 * jour selon le fuseau.
 * @param date Date
 */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
