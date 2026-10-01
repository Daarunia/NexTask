import Store from 'electron-store'
import { SETTINGS_FILE } from '../constants.js'
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  NOTIFICATION_STYLES,
  TASK_VERSION_MAX_LENGTH,
  THEME_MODES,
} from '../shared/settings.constants.js'

/**
 * Schéma des paramètres : valeurs par défaut et validation à l'écriture
 * (electron-store refuse une valeur hors schéma)
 */
const schema = {
  theme: {
    type: 'string',
    enum: [...THEME_MODES],
    default: DEFAULT_SETTINGS.theme,
  },
  primaryColor: {
    type: 'string',
    default: DEFAULT_SETTINGS.primaryColor,
  },
  taskVersions: {
    type: 'array',
    items: { type: 'string', pattern: String.raw`\S`, maxLength: TASK_VERSION_MAX_LENGTH },
    minItems: 1,
    uniqueItems: true,
    default: DEFAULT_SETTINGS.taskVersions,
  },
  defaultTaskVersion: {
    type: 'string',
    default: DEFAULT_SETTINGS.defaultTaskVersion,
  },
  confirmArchive: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.confirmArchive,
  },
  notificationsEnabled: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.notificationsEnabled,
  },
  notificationStyle: {
    type: 'string',
    enum: [...NOTIFICATION_STYLES],
    default: DEFAULT_SETTINGS.notificationStyle,
  },
  closeToTray: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.closeToTray,
  },
  launchAtStartup: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.launchAtStartup,
  },
  startMinimized: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.startMinimized,
  },
}

export type SettingsKeys = keyof AppSettings

/** Clés acceptées par le pont IPC, toute autre clé est refusée. */
export const SETTINGS_KEYS = Object.keys(schema) as SettingsKeys[]

export const settingsStore = new Store<AppSettings>({ schema, name: SETTINGS_FILE })

/**
 * Vrai si la clé fait partie des paramètres connus.
 *
 * @param key Clé reçue du renderer
 */
export function isSettingsKey(key: unknown): key is SettingsKeys {
  return SETTINGS_KEYS.includes(key as SettingsKeys)
}
