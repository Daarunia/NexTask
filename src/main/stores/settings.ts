import Store from 'electron-store'
import { IS_TEST, SETTINGS_FILE } from '../constants.js'
import {
  type AppSettings,
  ARCHIVE_PURGE_DAYS,
  DEFAULT_SETTINGS,
  INTERFACE_SCALES,
  LANGUAGES,
  NEW_TASK_POSITIONS,
  NOTIFICATION_STYLES,
  TASK_VERSION_MAX_LENGTH,
  THEME_MODES,
  WINDOW_MODES,
} from '../shared/settings.constants.js'

/**
 * Valeurs par défaut côté main. En test, l'interface reste en français quelle
 * que soit la langue de la machine (CI en anglais) : les tests E2E lisent ses textes.
 */
const MAIN_DEFAULTS: AppSettings = { ...DEFAULT_SETTINGS, language: IS_TEST ? 'fr' : DEFAULT_SETTINGS.language }

/**
 * Schéma des paramètres : valeurs par défaut et validation à l'écriture
 * (electron-store refuse une valeur hors schéma)
 */
const schema = {
  language: {
    type: 'string',
    enum: [...LANGUAGES],
    default: MAIN_DEFAULTS.language,
  },
  theme: {
    type: 'string',
    enum: [...THEME_MODES],
    default: DEFAULT_SETTINGS.theme,
  },
  primaryColor: {
    type: 'string',
    default: DEFAULT_SETTINGS.primaryColor,
  },
  interfaceScale: {
    type: 'integer',
    enum: [...INTERFACE_SCALES],
    default: DEFAULT_SETTINGS.interfaceScale,
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
  newTaskPosition: {
    type: 'string',
    enum: [...NEW_TASK_POSITIONS],
    default: DEFAULT_SETTINGS.newTaskPosition,
  },
  confirmArchive: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.confirmArchive,
  },
  archivePurgeEnabled: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.archivePurgeEnabled,
  },
  archivePurgeDays: {
    type: 'integer',
    enum: [...ARCHIVE_PURGE_DAYS],
    default: DEFAULT_SETTINGS.archivePurgeDays,
  },
  autoBackupEnabled: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.autoBackupEnabled,
  },
  rememberTagFilter: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.rememberTagFilter,
  },
  tagFilterIds: {
    type: 'array',
    items: { type: 'integer' },
    uniqueItems: true,
    default: DEFAULT_SETTINGS.tagFilterIds,
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
  quickAddEnabled: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.quickAddEnabled,
  },
  autoUpdateEnabled: {
    type: 'boolean',
    default: DEFAULT_SETTINGS.autoUpdateEnabled,
  },
  windowMode: {
    type: 'string',
    enum: [...WINDOW_MODES],
    default: DEFAULT_SETTINGS.windowMode,
  },
  windowState: {
    type: ['object', 'null'],
    properties: {
      x: { type: 'integer' },
      y: { type: 'integer' },
      width: { type: 'integer', minimum: 1 },
      height: { type: 'integer', minimum: 1 },
      maximized: { type: 'boolean' },
    },
    required: ['x', 'y', 'width', 'height', 'maximized'],
    default: DEFAULT_SETTINGS.windowState,
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

/**
 * Remet les paramètres à leurs valeurs par défaut, en une seule écriture. La
 * dernière taille et position de la fenêtre, tenue par le main et non réglable,
 * est conservée. Les écouteurs `onDidChange` (zone de notification, lancement
 * au démarrage) suivent les clés modifiées.
 *
 * @returns Paramètres après la remise à zéro
 */
export function resetSettings(): AppSettings {
  const defaults = structuredClone(MAIN_DEFAULTS)
  settingsStore.set({ ...defaults, windowState: settingsStore.get('windowState') })
  return settingsStore.store
}
