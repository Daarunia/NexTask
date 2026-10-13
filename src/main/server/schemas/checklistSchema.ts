import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../shared/checklist.constants.js'

/**
 * Schémas Fastify des checklists, celles des tâches comme les modèles (une
 * `Checklist` sans tâche). Tout champ renvoyé doit être déclaré ici, sinon
 * Fastify le retire des réponses.
 */

/** Point d'une checklist ou d'un modèle, trié par `position` dans les réponses. */
export const checklistItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    text: { type: 'string' },
    position: { type: 'integer' },
    // Toujours faux dans un modèle
    isChecked: { type: 'boolean' },
    checkedAt: { type: ['string', 'null'], format: 'date-time' },
  },
}

/** Points d'une checklist, dans l'ordre. */
const checklistItemsSchema = {
  type: 'array',
  items: checklistItemSchema,
}

/** Modèle de checklist renvoyé par les routes `/checklist-templates`. */
export const checklistTemplateSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    // Ordre dans la liste des modèles (page Checklists, menu du dialogue de tâche)
    position: { type: 'integer' },
    items: checklistItemsSchema,
  },
}

/** Checklist incluse dans une tâche, null pour une tâche sans point. */
export const taskChecklistSchema = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'integer' },
    items: checklistItemsSchema,
  },
}

// Nom de modèle saisi, au moins un caractère non blanc. Fastify répond 400
// sinon, le trim est fait par les routes.
export const checklistTemplateNameSchema = {
  type: 'string',
  pattern: String.raw`\S`,
  maxLength: CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
}

// Texte d'un point saisi, sur une seule ligne
const checklistItemTextSchema = {
  type: 'string',
  maxLength: CHECKLIST_ITEM_MAX_LENGTH,
  pattern: String.raw`^[^\r\n]*$`,
}

// Textes des points d'un modèle, sur une seule ligne. Les textes vides après
// trim sont retirés par les routes plutôt que refusés.
export const checklistTemplateItemsSchema = {
  type: 'array',
  maxItems: CHECKLIST_MAX_ITEMS,
  items: checklistItemTextSchema,
}

// Points envoyés avec une tâche (cf. ChecklistItemInput), dans l'ordre. Mêmes
// règles de texte que les modèles, les vides sont retirés par le serveur.
// Sans `id`, ou avec un id étranger à la tâche, le point est créé.
export const taskChecklistItemsSchema = {
  type: 'array',
  maxItems: CHECKLIST_MAX_ITEMS,
  items: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      text: checklistItemTextSchema,
      isChecked: { type: 'boolean' },
    },
    required: ['text', 'isChecked'],
  },
}
