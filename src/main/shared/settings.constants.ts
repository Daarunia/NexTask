/**
 * Paramètres de l'application, partagés entre le main et le renderer.
 *
 * Fichier sans aucun import (ni Node, ni Electron) : le renderer l'importe
 * directement. Il vit sous src/main pour rester dans la compilation du main
 * sans changer l'arborescence de build/main.
 */

/** Modes d'affichage proposés. */
export const THEME_MODES = ['light', 'dark'] as const

/** Mode d'affichage. */
export type ThemeMode = (typeof THEME_MODES)[number]

/** Paramètres persistés par electron-store. */
export interface AppSettings {
  theme: ThemeMode
  primaryColor: string // nom du thème de couleur (cf. APP_THEMES côté renderer)
}

/** Valeurs par défaut, reprises par le schéma electron-store et le store Pinia. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  primaryColor: 'violet',
}
