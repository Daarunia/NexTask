import { dayOffset, dayState } from './day.helper.js'
import { descriptionExcerpt } from './description.helper.js'

/**
 * Recherche dans les tâches, partagée entre le renderer (barre de recherche,
 * archives, Planning) et le serveur MCP (outil `search_tasks`) : mêmes mots,
 * mêmes états, mêmes extraits des deux côtés.
 *
 * Les types sont structurels : les tâches du renderer comme les réponses de
 * l'API (dates en chaînes ISO) y répondent.
 */

/** Point de checklist, tel que la recherche le lit. */
export interface SearchableChecklistItem {
  text: string
  isChecked: boolean
}

/** Tâche, telle que la recherche la lit. */
export interface SearchableTask {
  title: string
  description: string
  startDate?: Date | string | null
  checklist?: { items: SearchableChecklistItem[] } | null
}

/**
 * Texte comparable par la recherche : minuscules, sans accents
 * (`Tâche` → `tache`), espaces multiples réduits.
 * @param text Texte à normaliser
 */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().replaceAll(/\s+/g, ' ').trim()
}

/**
 * Mots recherchés, normalisés. Une saisie vide (ou d'espaces) n'en donne aucun.
 * @param query Texte saisi dans la barre de recherche
 */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query)
  return normalized ? normalized.split(' ') : []
}

/**
 * Texte d'une tâche sur lequel porte la recherche, soit son titre, sa description
 * (syntaxe Markdown retirée) et les textes des points de sa checklist, normalisés.
 * @param task Tâche à indexer
 */
export function taskSearchText(task: Pick<SearchableTask, 'title' | 'description' | 'checklist'>): string {
  const description = descriptionExcerpt(task.description ?? '', Infinity)
  const items = (task.checklist?.items ?? []).map((item) => item.text)
  return normalizeSearchText([task.title, description, ...items].join(' '))
}

/** Filtres rapides du board, sur l'état d'une tâche plutôt que sur son texte. */
export const TASK_STATUSES = ['overdue', 'today', 'upcoming', 'checklist'] as const

/** Nombre de jours après aujourd'hui couverts par le filtre `upcoming`. */
export const UPCOMING_DAYS = 7
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Vrai si la tâche est dans l'état demandé, soit une date de début passée
 * depuis la veille ou plus (`overdue`), une date de début aujourd'hui
 * (`today`) ou dans les `UPCOMING_DAYS` jours suivants (`upcoming`), ou une
 * checklist avec au moins un point à cocher (`checklist`).
 * @param task Tâche à tester
 * @param status État recherché
 * @param now Maintenant
 */
export function taskHasStatus(
  task: Pick<SearchableTask, 'startDate' | 'checklist'>,
  status: TaskStatus,
  now: Date,
): boolean {
  if (status === 'checklist') {
    const items = task.checklist?.items ?? []
    return items.some((item) => !item.isChecked)
  }

  if (!task.startDate) return false
  const date = new Date(task.startDate)
  if (status === 'upcoming') {
    const offset = dayOffset(date, now)
    return offset >= 1 && offset <= UPCOMING_DAYS
  }
  return dayState(date, now) === (status === 'overdue' ? 'past' : 'today')
}

/**
 * Extrait d'un texte brut centré sur le premier mot trouvé, sur une ligne.
 * Vide si aucun mot n'y figure.
 * @param plainText Texte sans syntaxe Markdown
 * @param terms Mots normalisés
 * @param radius Nombre de caractères gardés de part et d'autre
 */
function centeredExcerpt(plainText: string, terms: string[], radius: number): string {
  const text = plainText.replaceAll(/\s+/g, ' ')
  const haystack = [...text].map((char) => normalizeSearchText(char) || ' ').join('')
  const positions = terms.map((term) => haystack.indexOf(term)).filter((index) => index !== -1)
  if (!positions.length) return ''

  const at = Math.min(...positions)
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * Extrait d'une description centré sur le premier mot trouvé, sur une ligne,
 * pour la liste de suggestions. Vide si aucun mot n'y figure.
 * @param description Description Markdown
 * @param terms Mots normalisés
 * @param radius Nombre de caractères gardés de part et d'autre
 */
export function matchExcerpt(description: string, terms: string[], radius = 30): string {
  return centeredExcerpt(descriptionExcerpt(description ?? '', Infinity), terms, radius)
}

/**
 * Extrait d'une tâche pour la liste de suggestions, pris dans la description si
 * un mot y figure, sinon dans le premier point de la checklist qui en contient
 * un. Vide si aucun mot n'apparaît ni dans l'une ni dans les autres.
 * @param task Tâche trouvée
 * @param terms Mots normalisés
 * @param radius Nombre de caractères gardés de part et d'autre
 */
export function taskMatchExcerpt(
  task: Pick<SearchableTask, 'description' | 'checklist'>,
  terms: string[],
  radius = 30,
): string {
  const inDescription = matchExcerpt(task.description, terms, radius)
  if (inDescription) return inDescription

  for (const item of task.checklist?.items ?? []) {
    const inItem = centeredExcerpt(item.text, terms, radius)
    if (inItem) return inItem
  }
  return ''
}
