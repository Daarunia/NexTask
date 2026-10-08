import type { Locale } from './settings.constants.js'

/**
 * Langue de l'interface transmise par le main aux fenêtres, partagée entre le
 * main et le renderer.
 */
export interface LocaleState {
  locale: Locale // langue appliquée
  systemLocale: Locale // langue que donnerait le choix « système », affichée dans les Paramètres
}
