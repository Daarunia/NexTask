import type { Tag } from '../types/tag.types'
import { TAG_NAME_MAX_LENGTH } from '../../main/shared/validation.constants'
import { httpStatus } from './api.helper'
import { t } from '../i18n'

/**
 * Ordre d'affichage des tags : par nom, sans tenir compte de la casse ni des
 * accents (le tri de l'API, fait par SQLite, est sensible à la casse).
 * @param a Premier tag
 * @param b Second tag
 */
export function compareTagNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/**
 * Compare deux noms de tag sans tenir compte de la casse
 * @param a Premier nom
 * @param b Second nom
 */
export function sameTagName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Contrôle d'un nouveau nom : 1 à 30 caractères, unique sans tenir compte
 * de la casse parmi les autres tags (changer la casse de son propre nom est permis)
 * @param name Nom nettoyé
 * @param tagId Id du tag renommé
 * @param tags Tags existants
 * @returns Le message d'erreur, ou une chaîne vide si le nom est valide
 */
export function validateTagName(name: string, tagId: number, tags: Tag[]): string {
  if (!name) return t('tags.nameRequired')
  if (name.length > TAG_NAME_MAX_LENGTH) return t('tags.nameTooLong', { max: TAG_NAME_MAX_LENGTH })
  if (tags.some((tag) => tag.id !== tagId && sameTagName(tag.name, name))) return t('tags.nameTaken')
  return ''
}

/**
 * Message d'un renommage refusé par le serveur (nom pris ou invalide), ou
 * `undefined` pour toute autre erreur (réseau, serveur)
 * @param error Erreur levée par le store
 */
export function renameRejection(error: unknown): string | undefined {
  const status = httpStatus(error)
  if (status === 409) return t('tags.nameTaken')
  if (status === 400) return t('tags.nameInvalid')
  return undefined
}

/**
 * Libellé du nombre de tâches qui portent un tag
 * @param count Nombre de tâches
 */
export function tagUsageLabel(count: number): string {
  return t('tags.usage', { count }, count)
}

/**
 * Question de confirmation de la suppression d'un tag
 * @param tag Tag à supprimer
 */
export function tagDeleteQuestion(tag: Tag): string {
  const count = tag.taskCount ?? 0
  return t('tags.deleteQuestion', { name: tag.name, count }, count)
}
