import type { AppSettings } from './shared/settings.constants.js'

/**
 * Réglages lus par core, fournis par celui qui le démarre : le fichier de
 * paramètres d'electron-store dans l'app desktop, la base plus tard pour un
 * serveur partagé par plusieurs clients.
 *
 * Seuls les réglages qui touchent aux données y figurent. Ceux de l'appareil
 * (thème, fenêtres, notifications…) restent hors de core.
 */
export type ServerSettings = Pick<
  AppSettings,
  | 'taskVersions'
  | 'defaultTaskVersion'
  | 'newTaskPosition'
  | 'lastBoardId'
  | 'archivePurgeEnabled'
  | 'archivePurgeDays'
  | 'autoBackupEnabled'
  | 'documentMaxSizeMb'
  | 'documentMaxPerTask'
>

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
