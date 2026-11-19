import { nextOccurrence, toRecurrenceRule } from './recurrence.helper.js'
import type { RecurrenceListItem } from './recurrence.constants.js'

/**
 * Occurrences à venir des séries, pas encore créées : vue Planning (renderer)
 * et agenda du serveur MCP.
 */

// Occurrences calculées au plus par série, contre une boucle trop longue sur une date lointaine
const MAX_PROJECTED_RUNS = 2000

/** Occurrence à venir d'une série, pas encore créée. */
export interface ProjectedOccurrence {
  seriesId: number
  title: string
  date: Date
}

/**
 * Occurrences à venir d'une série sur une période. Seule une série active au
 * calendrier a des dates prévisibles : celle « après archivage » attend
 * l'archivage de la précédente. L'aperçu reste indicatif, car « Ne pas empiler »
 * peut sauter une date au moment de la génération.
 * @param series Série
 * @param rangeStart Premier instant de la période
 * @param rangeEnd Fin de la période (exclue)
 */
export function projectOccurrences(
  series: RecurrenceListItem,
  rangeStart: Date,
  rangeEnd: Date,
): ProjectedOccurrence[] {
  if (series.status !== 'active' || series.anchor !== 'schedule' || !series.nextRunAt) return []

  const rule = toRecurrenceRule(series)
  const occurrences: ProjectedOccurrence[] = []
  let date: Date | null = new Date(series.nextRunAt)

  // nextOccurrence compte les occurrences déjà générées : chaque date calculée en ajoute une
  for (let run = 0; date && date < rangeEnd && run < MAX_PROJECTED_RUNS; run++) {
    if (date >= rangeStart) occurrences.push({ seriesId: series.id, title: series.title, date })
    rule.generatedCount += 1
    date = nextOccurrence(rule, date)
  }

  return occurrences
}
