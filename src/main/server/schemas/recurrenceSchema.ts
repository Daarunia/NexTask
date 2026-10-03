import {
  MONTHLY_MODES,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_END_TYPES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_LEAD_DAYS_MAX,
  RECURRENCE_STATUSES,
} from '../../shared/recurrence.constants.js'

// Date optionnelle (null = absente)
const nullableDate = { type: ['string', 'null'], format: 'date-time' }

/**
 * Propriétés du résumé d'une série, renvoyé avec chaque tâche qui en est une
 * occurrence et par les routes /recurrences (sans le modèle des occurrences).
 */
const recurrenceSummaryProperties = {
  id: { type: 'integer' },
  frequency: { type: 'string' },
  interval: { type: 'integer' },
  // jours ISO séparés par des virgules ("1,4"), hebdomadaire uniquement
  weekdays: { type: ['string', 'null'] },
  monthlyMode: { type: ['string', 'null'] },
  // heure locale "HH:mm"
  time: { type: 'string' },
  startsAt: { type: 'string', format: 'date-time' },
  endType: { type: 'string' },
  endsOn: nullableDate,
  maxCount: { type: ['integer', 'null'] },
  generatedCount: { type: 'integer' },
  skipIfPending: { type: 'boolean' },
  // jours de création anticipée (0 = le jour même)
  leadDays: { type: 'integer' },
  status: { type: 'string' },
  // date de la prochaine occurrence (sa création peut être anticipée), null une fois la série terminée
  nextRunAt: nullableDate,
}

/** Schéma de réponse du résumé d'une série. */
export const recurrenceSummarySchema = {
  type: 'object',
  properties: recurrenceSummaryProperties,
}

/** Série de la liste des Paramètres (GET /recurrences) : résumé et titre du modèle. */
export const recurrenceListItemSchema = {
  type: 'object',
  properties: {
    ...recurrenceSummaryProperties,
    title: { type: 'string' },
  },
}

/** Résumé d'une série inclus dans une tâche : null hors série. */
export const taskRecurrenceSchema = {
  type: ['object', 'null'],
  properties: recurrenceSummaryProperties,
}

/**
 * Propriétés d'une règle saisie (cf. RecurrenceInput). L'heure et le début
 * de la série sont tirés de la date de début de la tâche. Les contrôles qui
 * croisent plusieurs champs (jours de la semaine, date ou nombre de fin) sont
 * faits par les routes (cf. recurrenceInputProblem).
 */
const recurrenceInputProperties = {
  frequency: { type: 'string', enum: [...RECURRENCE_FREQUENCIES] },
  interval: { type: 'integer', minimum: 1, maximum: RECURRENCE_INTERVAL_MAX },
  weekdays: {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 7 },
    uniqueItems: true,
  },
  // Mensuel : jour fixe (défaut), « Ne jour de la semaine » ou dernier jour du mois
  monthlyMode: { type: ['string', 'null'], enum: [...MONTHLY_MODES, null] },
  endType: { type: 'string', enum: [...RECURRENCE_END_TYPES] },
  endsOn: nullableDate,
  maxCount: { type: ['integer', 'null'], minimum: 1, maximum: RECURRENCE_COUNT_MAX },
  skipIfPending: { type: 'boolean' },
  // Création anticipée, en jours (0 = le jour même, par défaut)
  leadDays: { type: 'integer', minimum: 0, maximum: RECURRENCE_LEAD_DAYS_MAX },
}

/** Règle saisie à la création d'une tâche (POST /tasks). */
export const recurrenceInputSchema = {
  type: 'object',
  properties: recurrenceInputProperties,
  required: ['frequency', 'interval', 'endType'],
}

/** Règle saisie à la modification d'une tâche (PATCH /tasks/:id) : null arrête la série. */
export const nullableRecurrenceInputSchema = {
  type: ['object', 'null'],
  properties: recurrenceInputProperties,
  required: ['frequency', 'interval', 'endType'],
}

/** Corps de PATCH /recurrences/:id. */
export const recurrenceStatusBody = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: [...RECURRENCE_STATUSES] },
  },
  required: ['status'],
}

/** Série exportée (cf. /data/export), modèle des occurrences compris, ses tags désignés par leur id. */
export const exportedRecurrenceSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    frequency: { type: 'string', enum: [...RECURRENCE_FREQUENCIES] },
    interval: { type: 'integer', minimum: 1, maximum: RECURRENCE_INTERVAL_MAX },
    weekdays: { type: ['string', 'null'], pattern: '^[1-7](,[1-7])*$' },
    monthlyMode: { type: ['string', 'null'], enum: [...MONTHLY_MODES, null] },
    time: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
    startsAt: { type: 'string', format: 'date-time' },
    endType: { type: 'string', enum: [...RECURRENCE_END_TYPES] },
    endsOn: nullableDate,
    maxCount: { type: ['integer', 'null'], minimum: 1 },
    generatedCount: { type: 'integer', minimum: 0 },
    skipIfPending: { type: 'boolean' },
    // Absent des exports antérieurs à la création anticipée (0 à l'import)
    leadDays: { type: 'integer', minimum: 0, maximum: RECURRENCE_LEAD_DAYS_MAX },
    status: { type: 'string', enum: [...RECURRENCE_STATUSES] },
    nextRunAt: nullableDate,
    title: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    // null si la colonne du modèle a été supprimée (première colonne utilisée)
    stageId: { type: ['integer', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    tagIds: { type: 'array', items: { type: 'integer' } },
  },
  required: ['id', 'frequency', 'interval', 'time', 'startsAt', 'endType', 'status', 'title', 'description', 'version'],
}
