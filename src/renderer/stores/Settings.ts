import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { type AppSettings, DEFAULT_SETTINGS } from '../../main/shared/settings.constants'
import { getAppTheme } from '../constants/theme.constants'
import { applyTheme } from '../utils/theme.helper'
import { getLogger } from '../utils/logger'

// Préférence sombre de l'OS, suivie par le mode « système »
const systemDarkQuery = globalThis.matchMedia('(prefers-color-scheme: dark)')

/**
 * Paramètres de l'application, seule source de vérité côté renderer.
 *
 * Le store lit et écrit via le pont du preload (electron-store côté main) et
 * applique lui-même chaque paramètre visuel : les composants (en-tête, page
 * Paramètres) ne font que lire l'état et appeler les actions, et restent ainsi
 * synchronisés quel que soit l'endroit où le réglage a été changé.
 */
export const useSettingsStore = defineStore('settings', {
  state: (): AppSettings & { systemDark: boolean } => ({
    ...structuredClone(DEFAULT_SETTINGS),
    systemDark: systemDarkQuery.matches, // non persisté, suivi en direct
  }),

  getters: {
    // Mode sombre effectivement affiché, mode « système » résolu
    isDark: (state) => (state.theme === 'system' ? state.systemDark : state.theme === 'dark'),
  },

  actions: {
    /**
     * Charge tous les paramètres en un seul appel, les applique, puis suit la
     * préférence de l'OS pour le mode « système ».
     */
    async load() {
      try {
        const values = await globalThis.settings.getAll()
        this.$patch(values)
        getLogger().debug('[Settings] Paramètres chargés', values)
      } catch (error) {
        // On garde les valeurs par défaut : l'app reste utilisable
        getLogger().error('[Settings] Erreur lors du chargement des paramètres', error)
      }

      this.applyAll()

      systemDarkQuery.addEventListener('change', (event) => {
        this.systemDark = event.matches
        this.applyMode()
      })
    },

    /**
     * Applique les paramètres visuels à la page.
     */
    applyAll() {
      this.applyMode()
      // Une ancienne couleur enregistrée est ramenée au thème le plus proche
      applyTheme(getAppTheme(this.primaryColor))
    },

    /** Applique le mode clair ou sombre effectif. */
    applyMode() {
      document.documentElement.classList.toggle('app-dark', this.isDark)
    },

    /**
     * Modifie un paramètre : appliqué tout de suite, puis enregistré. En cas
     * d'échec de l'enregistrement, l'ancienne valeur est rétablie.
     * @param key Clé du paramètre
     * @param value Nouvelle valeur
     */
    async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
      const previous = this.$state[key]
      // Seuls le mode et la couleur se voient : inutile de régénérer le preset sinon
      const visual = key === 'theme' || key === 'primaryColor'
      this.$patch({ [key]: value })
      if (visual) this.applyAll()

      try {
        // Copie brute : un tableau réactif ne passe pas le clonage de l'IPC
        await globalThis.settings.set(key, structuredClone(toRaw(value)))
      } catch (error) {
        getLogger().error(`[Settings] Erreur lors de l'enregistrement de ${key}`, error)
        this.$patch({ [key]: previous })
        if (visual) this.applyAll()
        throw error
      }
    },
  },
})
