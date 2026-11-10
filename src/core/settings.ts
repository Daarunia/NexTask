import type { DataSettings } from './shared/settings.schema.js'

/**
 * Réglages lus par core, fournis par celui qui le démarre : le fichier de
 * paramètres d'electron-store dans l'app desktop, la base pour le serveur
 * autonome (cf. database/serverSettings.ts).
 *
 * Les réglages « données » seuls (cf. DATA_SETTINGS_KEYS) : ceux de l'appareil
 * (thème, fenêtres, notifications, dernier tableau affiché…) restent hors de
 * core. Le tableau de repli de l'ajout rapide est envoyé par le client.
 */
export type ServerSettings = DataSettings

let provider: (() => ServerSettings) | null = null

/**
 * Branche les réglages de core, relus à chaque appel de `settings()` : un
 * changement fait dans l'interface est suivi sans redémarrage.
 *
 * @param settingsProvider Réglages courants
 */
export function setSettingsProvider(settingsProvider: () => ServerSettings): void {
  provider = settingsProvider
}

/**
 * Réglages courants de core.
 *
 * @throws Si aucun fournisseur n'est branché (cf. setSettingsProvider)
 */
export function settings(): ServerSettings {
  if (!provider) throw new Error('Réglages de core non branchés : setSettingsProvider() doit être appelé au démarrage')
  return provider()
}
