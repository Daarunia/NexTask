/**
 * Mise à jour automatique de l'app (cf. system/updater), état partagé entre
 * le main et le renderer.
 */

/** Étapes de la mise à jour, de la recherche à l'installation. */
export const UPDATE_STATES = [
  'unsupported', // app non packagée (dev, test) : pas de mise à jour
  'idle', // aucune recherche faite depuis le lancement
  'checking',
  'up-to-date',
  'downloading', // nouvelle version trouvée, téléchargement en cours
  'downloaded', // prête, installée au redémarrage
  'error',
] as const

export type UpdateState = (typeof UPDATE_STATES)[number]

/** État de la mise à jour, envoyé au renderer à chaque changement. */
export interface UpdateStatus {
  state: UpdateState
  version?: string // version trouvée (téléchargement en cours ou terminé)
  percent?: number // avancement du téléchargement, de 0 à 100
}
