import type { Task } from '../types/task.types'
import { descriptionExcerpt } from './description.helper'

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
 * Texte d'une tâche sur lequel porte la recherche : titre et description,
 * syntaxe Markdown retirée, normalisés.
 * @param task Tâche à indexer
 */
export function taskSearchText(task: Pick<Task, 'title' | 'description'>): string {
  const description = descriptionExcerpt(task.description ?? '', Infinity)
  return normalizeSearchText(`${task.title} ${description}`)
}

/**
 * Vrai si la tâche passe le filtre du board : elle contient tous les mots
 * (titre ou description) ET porte au moins un des tags sélectionnés.
 * Sans mots ni tags, toute tâche passe.
 * @param task Tâche à tester
 * @param terms Mots normalisés (cf. `searchTerms`)
 * @param tagIds Ids des tags sélectionnés (OU logique)
 */
export function taskMatchesFilter(task: Task, terms: string[], tagIds: readonly number[]): boolean {
  if (tagIds.length && !task.tags?.some((tag) => tagIds.includes(tag.id))) return false
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
 * Extrait d'une description centré sur le premier mot trouvé, sur une ligne,
 * pour la liste de suggestions. Vide si aucun mot n'y figure.
 * @param description Description Markdown
 * @param terms Mots normalisés
 * @param radius Nombre de caractères gardés de part et d'autre
 */
export function matchExcerpt(description: string, terms: string[], radius = 30): string {
  const text = descriptionExcerpt(description ?? '', Infinity).replaceAll(/\s+/g, ' ')
  const haystack = [...text].map((char) => normalizeSearchText(char) || ' ').join('')
  const positions = terms.map((term) => haystack.indexOf(term)).filter((index) => index !== -1)
  if (!positions.length) return ''

  const at = Math.min(...positions)
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}
