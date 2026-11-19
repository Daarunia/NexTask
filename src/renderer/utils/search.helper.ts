import type { Task } from '../types/task.types'
import { normalizeSearchText, taskHasStatus, taskSearchText, type TaskStatus } from '@core/shared/search.helper'

// Mots, états et extraits de la recherche, partagés avec le serveur MCP (outil search_tasks)
export {
  matchExcerpt,
  normalizeSearchText,
  searchTerms,
  TASK_STATUSES,
  taskHasStatus,
  taskMatchExcerpt,
  taskSearchText,
  type TaskStatus,
  UPCOMING_DAYS,
} from '@core/shared/search.helper'

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
