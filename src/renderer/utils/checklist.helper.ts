import type { ChecklistItem } from '../types/checklist.types'
import type { ChecklistTemplate } from '../types/checklistTemplate.types'
import type { ChecklistItemInput } from '../../main/shared/checklist.constants'
import { t } from '../i18n'

/** Avancement d'une checklist, nombre de points cochés et nombre total. */
export interface ChecklistProgress {
  done: number
  total: number
}

/** Point en cours de saisie dans le dialogue de tâche, `id` absent pour un nouveau point. */
type DraftItem = Pick<ChecklistItemInput, 'id' | 'text' | 'isChecked'>

/**
 * Avancement d'une checklist. Une liste absente compte comme vide.
 * @param items Points de la checklist, enregistrés ou en cours de saisie
 */
export function checklistProgress(items: readonly Pick<ChecklistItem, 'isChecked'>[] | null | undefined): ChecklistProgress {
  const list = items ?? []
  return { done: list.filter((item) => item.isChecked).length, total: list.length }
}

/**
 * Part des points cochés, en pourcentage entier (largeur de la barre de
 * progression). 0 pour une liste vide.
 * @param progress Avancement de la checklist
 */
export function progressPercent({ done, total }: ChecklistProgress): number {
  return total ? Math.round((done / total) * 100) : 0
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

/**
 * Ajoute les points d'un modèle à la fin d'une checklist, décochés et dans
 * l'ordre du modèle (parcours P2). Simple copie des textes, rien ne garde le
 * lien avec le modèle, et les points déjà là ne bougent pas.
 * @param items Points actuels de la checklist
 * @param template Modèle appliqué
 * @param create Fabrique d'un nouveau point décoché à partir de son texte
 *   (clé de rendu de l'éditeur, cf. newChecklistEditorItem)
 * @returns Une nouvelle liste, celle reçue n'est pas modifiée
 */
export function appendTemplateItems<T>(
  items: readonly T[],
  template: Pick<ChecklistTemplate, 'items'>,
  create: (text: string) => T,
): T[] {
  return [...items, ...template.items.map((item) => create(item.text))]
}

/**
 * Textes des points d'une checklist pour en faire un modèle (parcours P6),
 * nettoyés, sans les points vides et sans leur état coché.
 * @param items Points de la checklist
 */
export function toTemplateItems(items: readonly Pick<DraftItem, 'text'>[]): string[] {
  return items.map((item) => item.text.trim()).filter((text) => text !== '')
}

/**
 * Points à envoyer avec la tâche (`checklistItems`), nettoyés et sans les
 * points vides. L'ordre du tableau fait foi, `checkedAt` est fixé par le serveur.
 * @param items Points saisis dans le dialogue
 */
export function toChecklistInput(items: readonly DraftItem[]): ChecklistItemInput[] {
  return items.flatMap(({ id, text, isChecked }) => {
    const clean = text.trim()
    if (!clean) return []
    return [id === undefined ? { text: clean, isChecked } : { id, text: clean, isChecked }]
  })
}
