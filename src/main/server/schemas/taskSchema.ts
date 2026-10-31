import { tagSchema } from './tagSchema.js'
import { taskRecurrenceSchema } from './recurrenceSchema.js'
import { taskChecklistSchema } from './checklistSchema.js'

export const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    version: { type: 'string' },
    description: { type: 'string' },
    title: { type: 'string' },
    position: { type: 'integer' },
    isHistorized: { type: 'boolean' },
    historizationDate: { type: ['string', 'null'], format: 'date-time' },
    // null pour les tâches archivées (détachées de leur colonne)
    stageId: { type: ['integer', 'null'] },
    // Tableau de la tâche, écrit par le serveur seul (celui de sa colonne, gardé à
    // l'archivage), null pour une tâche archivée dont le tableau a été supprimé. À
    // déclarer ici, sinon Fastify le retire de toutes les réponses (GET /stages compris)
    boardId: { type: ['integer', 'null'] },
    startDate: { type: ['string', 'null'], format: 'date-time' },
    notifiedAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    // Tags portés par la tâche, triés par nom. À déclarer ici, sinon Fastify
    // les retire de toutes les réponses qui utilisent ce schéma.
    tags: {
      type: 'array',
      items: tagSchema,
    },
    // Série dont la tâche est une occurrence, avec la date prévue de celle-ci
    // (null hors série), et le résumé de la série. À déclarer ici, comme les tags.
    recurrenceId: { type: ['integer', 'null'] },
    occurrenceDate: { type: ['string', 'null'], format: 'date-time' },
    recurrence: taskRecurrenceSchema,
    // Checklist de la tâche avec ses points triés, null sans point. À déclarer
    // ici, comme les tags, sinon Fastify la retire de toutes les réponses
    // (GET /stages compris).
    checklist: taskChecklistSchema,
  },
}
