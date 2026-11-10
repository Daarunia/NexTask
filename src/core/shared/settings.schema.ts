import {
  ARCHIVE_PURGE_DAYS,
  type AppSettings,
  DOCUMENT_PER_TASK_CEILING,
  DOCUMENT_SIZE_CEILING_MB,
  NEW_TASK_POSITIONS,
  TASK_VERSION_MAX_LENGTH,
} from './settings.constants.js'

/**
 * Réglages « données » : ceux qui décrivent les données plutôt que l'appareil,
 * partagés par tous les clients d'un serveur. L'app desktop les garde dans
 * electron-store ; le serveur autonome les garde en base (table ServerSetting).
 *
 * Une seule définition de leurs contraintes, en schéma JSON : reprise par le
 * schéma d'electron-store (src/main/stores/settings.ts) et par la validation de
 * PATCH /settings (core/server/routes/settings.routes.ts).
 */

/** Clés des réglages « données ». */
export const DATA_SETTINGS_KEYS = [
  'taskVersions',
  'defaultTaskVersion',
  'newTaskPosition',
  'archivePurgeEnabled',
  'archivePurgeDays',
  'autoBackupEnabled',
  'documentMaxSizeMb',
  'documentMaxPerTask',
] as const

/** Clé d'un réglage « données ». */
export type DataSettingsKey = (typeof DATA_SETTINGS_KEYS)[number]

/** Réglages « données ». */
export type DataSettings = Pick<AppSettings, DataSettingsKey>

/** Schéma JSON de chaque réglage « données », sans valeur par défaut. */
export const DATA_SETTINGS_SCHEMA = {
  taskVersions: {
    type: 'array',
    items: { type: 'string', pattern: String.raw`\S`, maxLength: TASK_VERSION_MAX_LENGTH },
    minItems: 1,
    uniqueItems: true,
  },
  defaultTaskVersion: {
    type: 'string',
  },
  newTaskPosition: {
    type: 'string',
    enum: [...NEW_TASK_POSITIONS],
  },
  archivePurgeEnabled: {
    type: 'boolean',
  },
  archivePurgeDays: {
    type: 'integer',
    enum: [...ARCHIVE_PURGE_DAYS],
  },
  autoBackupEnabled: {
    type: 'boolean',
  },
  documentMaxSizeMb: {
    type: 'integer',
    minimum: 1,
    maximum: DOCUMENT_SIZE_CEILING_MB,
  },
  documentMaxPerTask: {
    type: 'integer',
    minimum: 1,
    maximum: DOCUMENT_PER_TASK_CEILING,
  },
} as const satisfies Record<DataSettingsKey, object>

/**
 * Vrai si la clé est celle d'un réglage « données ».
 *
 * @param key Clé à tester
 */
export function isDataSettingsKey(key: string): key is DataSettingsKey {
  return (DATA_SETTINGS_KEYS as readonly string[]).includes(key)
}
