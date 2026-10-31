import { stageSchema } from './stageSchema.js'
import { BOARD_COLUMNS_MODES, BOARD_NAME_MAX_LENGTH } from '../../shared/board.constants.js'
import { TAG_COLORS } from '../../shared/tag.constants.js'

/** Propriétés d'un tableau dans les réponses. */
const boardProperties = {
  id: { type: 'integer' },
  name: { type: 'string' },
  // nom de couleur de la palette des tags (ex. "sky"), null sans couleur
  color: { type: ['string', 'null'] },
  position: { type: 'integer' },
}

/** Schéma de réponse d'un tableau. */
export const boardSchema = {
  type: 'object',
  properties: boardProperties,
}

/**
 * Tableau créé (POST /boards), avec ses colonnes vides, pour que le renderer
 * n'ait pas à relire les colonnes.
 */
export const createdBoardSchema = {
  type: 'object',
  properties: {
    ...boardProperties,
    stages: { type: 'array', items: stageSchema },
  },
}

// Nom de tableau saisi, au moins un caractère non blanc, 60 caractères au plus.
// Fastify répond 400 sinon. Le trim est fait par les routes.
export const boardNameSchema = {
  type: 'string',
  pattern: String.raw`\S`,
  maxLength: BOARD_NAME_MAX_LENGTH,
}

// Couleur d'un tableau, de la palette des tags, null pour la retirer
export const boardColorSchema = {
  type: ['string', 'null'],
  enum: [...TAG_COLORS, null],
}

/**
 * Colonnes d'un nouveau tableau (cf. BoardColumnsMode). `fromBoardId`, le
 * tableau dont les colonnes sont copiées, est requis en mode `copy` et ignoré
 * sinon.
 */
export const boardColumnsSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: [...BOARD_COLUMNS_MODES] },
    fromBoardId: { type: 'integer' },
  },
  required: ['mode'],
  if: { properties: { mode: { const: 'copy' } } },
  then: { required: ['fromBoardId'] },
}
