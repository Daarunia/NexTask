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
