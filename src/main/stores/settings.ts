import Store from 'electron-store'
import { SETTINGS_FILE } from '../constants.js'

/**
 * Schéma des paramètres
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
}

export type SettingsKeys = 'theme' | 'primaryColor'
export const settingsStore = new Store({ schema, name: SETTINGS_FILE })
