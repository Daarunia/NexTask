/**
 * Ajout rapide, partagé entre le main et le renderer.
 * Fichier sans import, cf. settings.constants.ts.
 */

/** Route du renderer affichée dans la fenêtre d'ajout rapide. */
export const QUICK_ADD_ROUTE = '/quick-add'

/** État du raccourci global, affiché dans les Paramètres. */
export interface QuickAddStatus {
  shortcut: string // libellé du raccourci pour l'OS courant (ex. « Ctrl+Alt+N »)
  unavailable: boolean // raccourci déjà pris par une autre application
}
