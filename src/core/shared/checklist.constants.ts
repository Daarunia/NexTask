/**
 * Limites des checklists, partagées entre le main (schémas Fastify), le
 * renderer (schémas zod) et les tests E2E.
 * Fichier sans import, cf. settings.constants.ts.
 */

/** Longueur maximale du texte d'un point de checklist (une ligne, texte brut). */
export const CHECKLIST_ITEM_MAX_LENGTH = 500

/** Longueur maximale du nom d'un modèle de checklist. */
export const CHECKLIST_TEMPLATE_NAME_MAX_LENGTH = 80

/** Nombre maximal de points d'une checklist, de tâche comme de modèle. */
export const CHECKLIST_MAX_ITEMS = 100

/**
 * Point de checklist envoyé avec une tâche (`POST /tasks`, `PATCH /tasks/:id`).
 * Sans `id`, le point est créé. La position est le rang dans le tableau et
 * `checkedAt` est fixé par le serveur.
 */
export interface ChecklistItemInput {
  id?: number // point existant de la checklist de la tâche, absent pour un nouveau point
  text: string
  isChecked: boolean
}
