import { dayKey } from '../../shared/day.helper.js'
import { descriptionExcerpt } from '../../shared/description.helper.js'
import { boardName, stageName, type Workspace } from './resolve.js'
import type { ApiTask } from './types.js'

/**
 * Mise en forme des tâches pour l'assistant : JSON compact, noms à la place
 * des ids de tableau et de colonne, dates locales, champs vides omis.
 */

/** Longueur de l'extrait de description dans une liste. */
export const LIST_EXCERPT_LENGTH = 200

/**
 * Nombre sur deux chiffres.
 *
 * @param value Nombre
 */
function pad(value: number): string {
  return String(Math.abs(value)).padStart(2, '0')
}

/**
 * Date en ISO 8601 locale, à la minute, avec le décalage du fuseau
 * (`2026-11-19T09:00+01:00`) : l'assistant lit l'heure que voit l'utilisateur.
 *
 * @param value Date ou chaîne ISO
 */
export function localIso(value: Date | string): string {
  const date = new Date(value)
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const zone = `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}${zone}`
}

/**
 * Objet sans ses champs `null`, `undefined` ou listes vides.
 *
 * @param value Objet à alléger
 */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field != null && !(Array.isArray(field) && !field.length)),
  ) as Partial<T>
}

/**
 * Progression de la checklist (`2/5`), null sans checklist.
 *
 * @param task Tâche
 */
function checklistProgress(task: ApiTask): string | null {
  const items = task.checklist?.items ?? []
  if (!items.length) return null
  return `${items.filter((item) => item.isChecked).length}/${items.length}`
}

/**
 * Tâche dans une liste : l'essentiel, avec un extrait de description.
 *
 * @param task Tâche
 * @param workspace Tableaux et colonnes, pour les noms
 * @param excerpt Extrait à montrer à la place du début de la description (mots trouvés)
 */
export function taskSummary(task: ApiTask, workspace: Workspace, excerpt?: string) {
  return compact({
    id: task.id,
    title: task.title,
    board: boardName(workspace, task.boardId),
    column: stageName(workspace, task.stageId),
    archivedAt: task.isHistorized && task.historizationDate ? localIso(task.historizationDate) : null,
    date: task.startDate ? localIso(task.startDate) : null,
    tags: (task.tags ?? []).map((tag) => tag.name),
    checklist: checklistProgress(task),
    recurring: task.recurrenceId === null ? null : true,
    excerpt: excerpt || descriptionExcerpt(task.description ?? '', LIST_EXCERPT_LENGTH) || null,
  })
}

/**
 * Tâche complète : description Markdown, points de checklist, documents, série.
 *
 * @param task Tâche
 * @param workspace Tableaux et colonnes, pour les noms
 */
export function taskDetail(task: ApiTask, workspace: Workspace) {
  const recurrence = task.recurrence
  return compact({
    id: task.id,
    title: task.title,
    board: boardName(workspace, task.boardId),
    column: stageName(workspace, task.stageId),
    archived: task.isHistorized,
    archivedAt: task.historizationDate ? localIso(task.historizationDate) : null,
    date: task.startDate ? localIso(task.startDate) : null,
    version: task.version,
    tags: (task.tags ?? []).map((tag) => tag.name),
    description: task.description || null,
    checklist: (task.checklist?.items ?? []).map((item) => ({ id: item.id, text: item.text, done: item.isChecked })),
    documents: (task.documents ?? []).map((doc) => ({ id: doc.id, name: doc.name, size: doc.size })),
    recurrence: recurrence
      ? compact({
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          weekdays: recurrence.weekdays,
          time: recurrence.time,
          status: recurrence.status,
          next: recurrence.nextRunAt ? localIso(recurrence.nextRunAt) : null,
        })
      : null,
    createdAt: localIso(task.createdAt),
    updatedAt: localIso(task.updatedAt),
  })
}

/**
 * Résultat d'outil : le JSON dans un bloc de texte.
 *
 * @param value Résultat
 */
export function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

/**
 * Résultat d'outil en erreur, que l'assistant lit pour corriger son appel.
 *
 * @param message Motif
 */
export function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}
