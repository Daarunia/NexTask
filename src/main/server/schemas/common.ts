/**
 * Fragments de schéma Fastify réutilisables entre plusieurs entités.
 *
 * Centralise les briques communes aux routes CRUD (paramètre `id`, réponses
 * d'erreur / de confirmation) pour éviter la duplication entre les fichiers de
 * routes et garder un format d'API cohérent.
 *
 * → Ajoute ici tout fragment partagé par au moins deux entités (ex : un schéma
 *   de pagination, un format d'erreur enrichi, etc.).
 */

/** Paramètre de route `:id` (entier requis). */
export const idParam = {
  type: 'object',
  properties: { id: { type: 'integer' } },
  required: ['id'],
}

/** Corps de réponse d'erreur simple : `{ error: string }`. */
export const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
}

/** Corps de réponse de confirmation : `{ message: string }`. */
export const messageResponse = {
  type: 'object',
  properties: { message: { type: 'string' } },
}
