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

/**
 * Styles de notification (Windows uniquement) : `reminder` reste à l'écran
 * jusqu'à sa fermeture, `default` disparaît seul après quelques secondes.
 */
export const NOTIFICATION_STYLES = ['reminder', 'default'] as const

/** Style de notification. */
export type NotificationStyle = (typeof NOTIFICATION_STYLES)[number]

/** Places possibles d'une nouvelle tâche dans sa colonne. */
export const NEW_TASK_POSITIONS = ['top', 'bottom'] as const

/** Place d'une nouvelle tâche dans sa colonne. */
export type NewTaskPosition = (typeof NEW_TASK_POSITIONS)[number]

/** Fenêtre au démarrage : maximisée, ou à sa dernière taille et position. */
export const WINDOW_MODES = ['maximized', 'last'] as const

/** Mode d'ouverture de la fenêtre. */
export type WindowMode = (typeof WINDOW_MODES)[number]

/** Dernière taille et position de la fenêtre (hors maximisation), enregistrées par le main. */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean // fenêtre maximisée à sa fermeture, sur l'écran de ces coordonnées
}

/** Longueur maximale d'un numéro de version de tâche. */
export const TASK_VERSION_MAX_LENGTH = 20

/** Paramètres persistés par electron-store. */
export interface AppSettings {
  theme: ThemeMode
  primaryColor: string // nom du thème de couleur (cf. APP_THEMES côté renderer)
  taskVersions: string[] // versions proposées dans le formulaire de tâche, au moins une
  defaultTaskVersion: string // version présélectionnée à la création, prise dans taskVersions
  newTaskPosition: NewTaskPosition // nouvelle tâche en haut ou en bas de sa colonne
  confirmArchive: boolean // confirmation demandée avant d'archiver une tâche depuis sa carte
  rememberTagFilter: boolean // le filtre de tags du tableau est retrouvé au lancement suivant
  tagFilterIds: number[] // ids des tags du filtre mémorisé, vide si rememberTagFilter est désactivé
  notificationsEnabled: boolean // rappels OS des tâches dont la date de début est passée
  notificationStyle: NotificationStyle // toast Windows qui reste affiché ou qui disparaît seul
  closeToTray: boolean // la fermeture de la fenêtre garde l'app dans la zone de notification
  launchAtStartup: boolean // lancement à l'ouverture de session
  startMinimized: boolean // au lancement à l'ouverture de session, fenêtre réduite
  windowMode: WindowMode // fenêtre maximisée ou à sa dernière taille au démarrage
  windowState: WindowState | null // dernière taille et position, tenue à jour par le main
}

/** Valeurs par défaut, reprises par le schéma electron-store et le store Pinia. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  primaryColor: 'violet',
  taskVersions: ['1.4.4', '1.4.5', '1.5.0'],
  defaultTaskVersion: '1.5.0',
  newTaskPosition: 'bottom',
  confirmArchive: false,
  rememberTagFilter: false,
  tagFilterIds: [],
  notificationsEnabled: true,
  notificationStyle: 'reminder',
  closeToTray: false,
  launchAtStartup: false,
  startMinimized: false,
  windowMode: 'maximized',
  windowState: null,
}
