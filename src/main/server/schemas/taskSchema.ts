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
    startDate: { type: ['string', 'null'], format: 'date-time' },
    notifiedAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}
