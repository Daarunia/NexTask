import { app, BrowserWindow, ipcMain } from 'electron'
import Logger from 'electron-log'
import { settingsStore } from './stores/settings.js'
import type { Locale } from '../core/shared/settings.constants.js'
import { resolveLocale, systemLocale } from '../core/shared/locale.helper.js'
import type { LocaleState } from '../core/shared/i18n.constants.js'
import {
  interpolateMessage,
  lookupMessage,
  type MessageKey,
  type MessageParams,
  type PluralKey,
  type PluralMessage,
} from '../core/shared/message.helper.js'
import { fr, MAIN_CATALOGS, type MainMessages } from './locales/index.js'

/**
 * Langue de l'interface côté main : résolue depuis le paramètre `language` et
 * les langues de l'OS, transmise aux fenêtres (qui traduisent elles-mêmes leurs
 * textes, cf. renderer/i18n) et utilisée par `t()` pour les textes du main
 * (zone de notification, notifications, boîtes de dialogue).
 */

export type MainMessageKey = MessageKey<MainMessages>
export type MainPluralKey = PluralKey<MainMessages>

let locale: Locale = 'fr'

// Destinataires d'un changement de langue (menu de la zone de notification)
const listeners: (() => void)[] = []

/**
 * Langue des préférences de l'OS, rapprochée des langues prises en charge.
 */
function currentSystemLocale(): Locale {
  return systemLocale(app.getPreferredSystemLanguages())
}

/**
 * Langue active et langue de l'OS, transmises aux fenêtres.
 */
export function getLocaleState(): LocaleState {
  return { locale, systemLocale: currentSystemLocale() }
}

/** Langue active. */
export function getLocale(): Locale {
  return locale
}

/**
 * Texte du main dans la langue active, le français à défaut.
 *
 * @param key Clé du texte
 * @param params Valeurs des paramètres `{nom}`
 */
export function t(key: MainMessageKey, params?: MessageParams): string {
  return translate(locale, key, params)
}

/**
 * Texte du main dans une langue donnée, quelle que soit la langue active (les
 * journaux restent en français).
 *
 * @param target Langue du texte
 * @param key Clé du texte
 * @param params Valeurs des paramètres `{nom}`
 */
export function translate(target: Locale, key: MainMessageKey, params?: MessageParams): string {
  const message = lookupMessage(MAIN_CATALOGS[target], key) ?? lookupMessage(fr, key)
  return interpolateMessage(typeof message === 'string' ? message : key, params)
}

/**
 * Texte au pluriel selon `count`, aussi passé en paramètre `{count}`.
 *
 * @param key Clé du texte
 * @param count Nombre qui choisit la forme
 * @param params Autres paramètres
 */
export function tn(key: MainPluralKey, count: number, params?: MessageParams): string {
  const message = (lookupMessage(MAIN_CATALOGS[locale], key) ?? lookupMessage(fr, key)) as PluralMessage
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? message.one : message.other
  return interpolateMessage(form, { count, ...params })
}

/**
 * Prévient d'un changement de langue (après la mise à jour de `t()`).
 *
 * @param listener Appelé à chaque changement
 */
export function onLocaleChanged(listener: () => void): void {
  listeners.push(listener)
}

/**
 * Recalcule la langue et la transmet aux fenêtres et aux destinataires.
 */
function applyLanguage(): void {
  const next = resolveLocale(settingsStore.get('language'), app.getPreferredSystemLanguages())
  if (next === locale) return
  locale = next
  Logger.info(`[i18n] Langue de l'interface : ${locale}`)

  const state = getLocaleState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('i18n:changed', state)
  }
  for (const listener of listeners) listener()
}

/**
 * Résout la langue au démarrage (avant les seeds et les fenêtres) et suit les
 * changements du paramètre.
 */
export function setupI18n(): void {
  locale = resolveLocale(settingsStore.get('language'), app.getPreferredSystemLanguages())
  Logger.info(`[i18n] Langue de l'interface : ${locale}`)

  // Lue par chaque fenêtre avant son premier affichage
  ipcMain.handle('i18n:state', () => getLocaleState())

  settingsStore.onDidChange('language', applyLanguage)
}
