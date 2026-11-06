/**
 * Formats des documents joints aux tâches, partagés entre le serveur et le
 * renderer. Leurs limites sont des paramètres (cf. settings.constants).
 */

/** Nombre d'octets d'un Mo. */
export const BYTES_PER_MB = 1024 * 1024

/** Longueur maximale du nom d'un document, celle d'un nom de fichier sous Windows. */
export const DOCUMENT_NAME_MAX_LENGTH = 255

/** Empreinte SHA-256 en hexadécimal, nom du fichier d'un document sur le disque. */
export const SHA256_PATTERN = '^[0-9a-f]{64}$'

/** Limites appliquées à l'ajout d'un document (cf. paramètres `documentMaxSizeMb` et `documentMaxPerTask`). */
export interface DocumentLimits {
  maxSizeMb: number
  maxPerTask: number
}

/** Limite dépassée par un ajout. */
export type DocumentLimitProblem = 'fileTooLarge' | 'taskFull'

/** Motif d'un refus par les routes de documents, à traduire par l'interface. */
export type DocumentErrorCode =
  | DocumentLimitProblem
  | 'archived'
  | 'invalidName'
  | 'documentNotFound'
  | 'taskNotFound'
  | 'fileMissing'
  | 'fileReferenced'
  | 'unsupportedBody'
  | 'interrupted'
  | 'damagedFile'
  | 'diskFull'
  | 'storeUnavailable'
