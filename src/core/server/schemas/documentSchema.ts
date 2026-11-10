import { SHA256_PATTERN } from '../../shared/document.constants.js'

/**
 * Schémas Fastify des documents joints aux tâches. Tout champ renvoyé doit être
 * déclaré ici, sinon Fastify le retire des réponses.
 */

/** Document inclus dans une tâche, sans son contenu ni son empreinte. */
export const documentSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    size: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

/** Refus d'une route de documents, avec le motif à traduire par l'interface (cf. DocumentErrorCode). */
export const documentErrorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
  },
}

/** Paramètre de route `:sha256`, une empreinte et jamais un chemin. */
export const sha256Param = {
  type: 'object',
  properties: { sha256: { type: 'string', pattern: SHA256_PATTERN } },
  required: ['sha256'],
}

/** Nombre de documents et taille de leurs contenus distincts. */
export const documentUsageSchema = {
  type: 'object',
  properties: {
    documents: { type: 'integer' },
    totalBytes: { type: 'integer' },
  },
}

/** Résultat du dépôt d'un contenu. */
export const storedFileSchema = {
  type: 'object',
  properties: {
    created: { type: 'boolean' },
    size: { type: 'integer' },
  },
}
