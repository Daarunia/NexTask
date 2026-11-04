import { taskSchema } from '../schemas/taskSchema.js'

export const stageSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    position: { type: 'integer' },
    // nom de couleur de la palette des tags (ex. "sky"), null sans couleur
    color: { type: ['string', 'null'] },
    // Tableau de la colonne
    boardId: { type: 'integer' },
    tasks: {
      type: 'array',
      items: taskSchema,
    },
  },
}
