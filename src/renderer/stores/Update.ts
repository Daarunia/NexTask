import { defineStore } from 'pinia'
import type { UpdateStatus } from '../../main/shared/update.constants'
import { getLogger } from '../utils/logger'

// Désabonnement du suivi de l'état, branché une seule fois
let stopStatusListener: (() => void) | undefined

/**
 * Mise à jour automatique de l'app, gérée par le main (pont `updater`) : le
 * store suit son état pour la section « À propos » et le toast de redémarrage.
 */
export const useUpdateStore = defineStore('update', {
  state: () => ({
    // Remplacé en entier à chaque changement : version et avancement suivent l'étape
    status: { state: 'unsupported' } as UpdateStatus,
  }),

  actions: {
    /**
     * Lit l'état courant puis suit ses changements.
     */
    async load() {
      stopStatusListener ??= globalThis.updater.onStatus((status) => {
        this.status = status
      })

      try {
        this.status = await globalThis.updater.getStatus()
      } catch (error) {
        getLogger().error('[Update] Erreur lors de la lecture de la mise à jour', error)
      }
    },

    /**
     * Arrête le suivi de l'état.
     */
    stop() {
      stopStatusListener?.()
      stopStatusListener = undefined
    },

    /**
     * Recherche une nouvelle version (le résultat arrive par le suivi de l'état).
     */
    async check() {
      try {
        await globalThis.updater.check()
      } catch (error) {
        getLogger().error('[Update] Erreur lors de la recherche de mise à jour', error)
        throw error
      }
    },

    /**
     * Quitte l'app pour installer la version téléchargée, puis la relance.
     */
    async install() {
      try {
        await globalThis.updater.install()
      } catch (error) {
        getLogger().error("[Update] Erreur lors de l'installation de la mise à jour", error)
        throw error
      }
    },
  },
})
