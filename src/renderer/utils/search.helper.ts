import type { Task } from '../types/task.types'
import { descriptionExcerpt } from './description.helper'
import { dayState } from './date.helper'

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
export function taskSearchText(task: Pick<Task, 'title' | 'description' | 'checklist'>): string {
  const description = descriptionExcerpt(task.description ?? '', Infinity)
  const items = (task.checklist?.items ?? []).map((item) => item.text)
  return normalizeSearchText([task.title, description, ...items].join(' '))
}

/** Filtres rapides du board, sur l'état d'une tâche plutôt que sur son texte. */
export const TASK_STATUSES = ['overdue', 'today', 'checklist'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Vrai si la tâche est dans l'état demandé, soit une date de début passée
 * depuis la veille ou plus (`overdue`), une date de début aujourd'hui
 * (`today`), ou une checklist avec au moins un point à cocher (`checklist`).
 * @param task Tâche à tester
 * @param status État recherché
 * @param now Maintenant
 */
export function taskHasStatus(task: Pick<Task, 'startDate' | 'checklist'>, status: TaskStatus, now: Date): boolean {
  if (status === 'checklist') {
    const items = task.checklist?.items ?? []
    return items.some((item) => !item.isChecked)
  }

  if (!task.startDate) return false
  return dayState(new Date(task.startDate), now) === (status === 'overdue' ? 'past' : 'today')
}

/**
 * Vrai si la tâche passe le filtre du board. Elle contient tous les mots
 * (titre, description ou points de la checklist), ET porte au moins un des
 * tags sélectionnés, ET est dans au moins un des états sélectionnés. Sans
 * mots, tags ni états, toute tâche passe.
 * @param task Tâche à tester
 * @param terms Mots normalisés (cf. `searchTerms`)
 * @param tagIds Ids des tags sélectionnés (OU logique)
 * @param statuses États sélectionnés (OU logique)
 * @param now Maintenant, pour les états liés à la date de début
 */
export function taskMatchesFilter(
  task: Task,
  terms: string[],
  tagIds: readonly number[],
  statuses: readonly TaskStatus[] = [],
  now = new Date(),
): boolean {
  if (tagIds.length && !task.tags?.some((tag) => tagIds.includes(tag.id))) return false
  if (statuses.length && !statuses.some((status) => taskHasStatus(task, status, now))) return false
  if (!terms.length) return true

  const text = taskSearchText(task)
  return terms.every((term) => text.includes(term))
}

/** Morceau de texte affiché, surligné s'il correspond à un mot recherché. */
export interface HighlightPart {
  text: string
  match: boolean
}

/**
 * Découpe un texte pour surligner les mots recherchés, sans tenir compte de la
 * casse ni des accents : le texte d'origine est conservé tel quel.
 * @param text Texte affiché
 * @param terms Mots normalisés (cf. `searchTerms`)
 */
export function highlightParts(text: string, terms: string[]): HighlightPart[] {
  // Texte normalisé caractère par caractère : chaque position renvoie au texte d'origine
  const chars = [...text]
  const normalized: string[] = []
  const origin: number[] = []
  chars.forEach((char, index) => {
    for (const c of normalizeSearchText(char) || (/\s/.test(char) ? ' ' : '')) {
      normalized.push(c)
      origin.push(index)
    }
  })

  const haystack = normalized.join('')
  const matched = new Array<boolean>(chars.length).fill(false)
  for (const term of terms) {
    for (let from = haystack.indexOf(term); from !== -1; from = haystack.indexOf(term, from + 1)) {
      for (let i = from; i < from + term.length; i++) matched[origin[i]] = true
    }
  }

  const parts: HighlightPart[] = []
  chars.forEach((char, index) => {
    const last = parts.at(-1)
    if (last?.match === matched[index]) last.text += char
    else parts.push({ text: char, match: matched[index] })
  })
  return parts
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
export function taskMatchExcerpt(task: Pick<Task, 'description' | 'checklist'>, terms: string[], radius = 30): string {
  const inDescription = matchExcerpt(task.description, terms, radius)
  if (inDescription) return inDescription

  for (const item of task.checklist?.items ?? []) {
    const inItem = centeredExcerpt(item.text, terms, radius)
    if (inItem) return inItem
  }
  return ''
}
