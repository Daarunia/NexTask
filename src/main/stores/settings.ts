import Store from 'electron-store'
import { SETTINGS_FILE } from '../constants.js'

/**
 * Paramètres persistés. À garder aligné sur `AppSettings` dans
 * src/renderer/types/global.d.ts, côté renderer.
 */
export interface AppSettings {
  theme: 'light' | 'dark'
  primaryColor: string
}

/**
 * Schéma des paramètres : valeurs par défaut et validation à l'écriture
 * (electron-store refuse une valeur hors schéma)
 */
const schema = {
  theme: {
    type: 'string',
    enum: ['light', 'dark'],
    default: 'dark',
  },
  primaryColor: {
    type: 'string',
    default: 'violet',
  },
} as const

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
