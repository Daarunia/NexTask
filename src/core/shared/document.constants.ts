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

/**
 * Extensions d'un fichier que le système exécuterait au lieu de l'ouvrir dans
 * une application (programme, script, raccourci, installeur). Un tel document
 * n'est jamais ouvert par l'app, seulement enregistré.
 */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  'app',
  'appx',
  'appxbundle',
  'application',
  'bat',
  'cmd',
  'com',
  'command',
  'cpl',
  'desktop',
  'exe',
  'gadget',
  'hta',
  'inf',
  'jar',
  'js',
  'jse',
  'lnk',
  'msc',
  'msi',
  'msix',
  'msixbundle',
  'msp',
  'pif',
  'ps1',
  'psm1',
  'reg',
  'run',
  'scf',
  'scr',
  'sh',
  'url',
  'vb',
  'vbe',
  'vbs',
  'ws',
  'wsc',
  'wsf',
  'wsh',
])

/** Issue de l'ouverture ou de l'enregistrement d'un document par le main. */
export type DocumentFileResult =
  | { status: 'opened' } // ouvert dans l'application par défaut du système
  | { status: 'saved'; filePath: string } // enregistré à l'emplacement choisi
  | { status: 'canceled' } // boîte d'enregistrement fermée sans choix
  | { status: 'blocked' } // fichier exécutable, jamais ouvert par l'app
  | { status: 'missing' } // document supprimé, ou fichier absent du dossier

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
