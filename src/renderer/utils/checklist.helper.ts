import type { ChecklistItem, TaskChecklist } from '../types/checklist.types'
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
export function checklistProgress(
  items: readonly Pick<ChecklistItem, 'isChecked'>[] | null | undefined,
): ChecklistProgress {
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

/**
 * Checklist avec un point coché ou décoché, pour l'affichage immédiat d'une
 * coche faite depuis la carte. Les autres points sont gardés tels quels.
 * @param checklist Checklist de la tâche
 * @param itemId Id du point
 * @param isChecked Nouvel état du point
 * @returns Une nouvelle checklist, celle reçue n'est pas modifiée
 */
export function withItemChecked(checklist: TaskChecklist, itemId: number, isChecked: boolean): TaskChecklist {
  return {
    ...checklist,
    items: checklist.items.map((item) => (item.id === itemId ? { ...item, isChecked } : item)),
  }
}

/**
 * Checklist avec un point remplacé par sa version enregistrée (état et date
 * de coche fixés par le serveur). Seul ce point change, une autre coche encore
 * en cours d'enregistrement reste donc affichée. Un point absent ne change rien.
 * @param checklist Checklist affichée
 * @param saved Point tel que renvoyé par le serveur
 * @returns Une nouvelle checklist, celle reçue n'est pas modifiée
 */
export function withSavedItem(checklist: TaskChecklist, saved: ChecklistItem): TaskChecklist {
  return { ...checklist, items: checklist.items.map((item) => (item.id === saved.id ? saved : item)) }
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
