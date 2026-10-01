/**
 * Paramètres de l'application, partagés entre le main et le renderer.
 *
 * Fichier sans aucun import (ni Node, ni Electron) : le renderer l'importe
 * directement. Il vit sous src/main pour rester dans la compilation du main
 * sans changer l'arborescence de build/main.
 */

/** Modes d'affichage proposés (`system` suit le réglage de l'OS). */
export const THEME_MODES = ['light', 'dark', 'system'] as const

/** Mode d'affichage. */
export type ThemeMode = (typeof THEME_MODES)[number]

/** Longueur maximale d'un numéro de version de tâche. */
export const TASK_VERSION_MAX_LENGTH = 20

/** Paramètres persistés par electron-store. */
export interface AppSettings {
  theme: ThemeMode
  primaryColor: string // nom du thème de couleur (cf. APP_THEMES côté renderer)
  taskVersions: string[] // versions proposées dans le formulaire de tâche, au moins une
  defaultTaskVersion: string // version présélectionnée à la création, prise dans taskVersions
  notificationsEnabled: boolean // rappels OS des tâches dont la date de début est passée
  closeToTray: boolean // la fermeture de la fenêtre garde l'app dans la zone de notification
  launchAtStartup: boolean // lancement à l'ouverture de session
  startMinimized: boolean // au lancement à l'ouverture de session, fenêtre réduite
}

/** Valeurs par défaut, reprises par le schéma electron-store et le store Pinia. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  primaryColor: 'violet',
  taskVersions: ['1.4.4', '1.4.5', '1.5.0'],
  defaultTaskVersion: '1.5.0',
  notificationsEnabled: true,
  closeToTray: false,
  launchAtStartup: false,
  startMinimized: false,
}
