/**
 * Schéma de réponse d'un tag.
 *
 * `taskCount` (nombre de tâches, actives et historisées, qui portent le tag)
 * n'est renvoyé que par les routes `/tags`, pas dans les tags inclus aux tâches.
 */
export const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    // nom de couleur de la palette TAG_COLORS (ex. "sky")
    color: { type: 'string' },
    taskCount: { type: 'integer' },
  },
}
