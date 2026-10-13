import type { ChecklistItem } from '../types/checklist.types'
import { t } from '../i18n'

/** Avancement d'une checklist, nombre de points cochés et nombre total. */
export interface ChecklistProgress {
  done: number
  total: number
}

/**
 * Avancement d'une checklist. Une liste absente compte comme vide.
 * @param items Points de la checklist, enregistrés ou en cours de saisie
 */
export function checklistProgress(items: readonly Pick<ChecklistItem, 'isChecked'>[] | null | undefined): ChecklistProgress {
  const list = items ?? []
  return { done: list.filter((item) => item.isChecked).length, total: list.length }
}

/**
 * Libellé de l'avancement (« 2 points cochés sur 6 »), pour l'infobulle et
 * l'`aria-label` du badge des cartes. Le pluriel suit le nombre de points cochés.
 * @param done Nombre de points cochés
 * @param total Nombre total de points
 */
export function progressLabel(done: number, total: number): string {
  return t('checklist.progress', { count: done, total }, done)
}
