import { defineStore } from 'pinia'
import { type AppSettings, DEFAULT_SETTINGS } from '../../main/shared/settings.constants'
import { getAppTheme } from '../constants/theme.constants'
import { applyTheme } from '../utils/theme.helper'
import { getLogger } from '../utils/logger'

/**
 * Paramètres de l'application, seule source de vérité côté renderer.
 *
 * Le store lit et écrit via le pont du preload (electron-store côté main) et
 * applique lui-même chaque paramètre visuel : les composants (en-tête, page
 * Paramètres) ne font que lire l'état et appeler les actions, et restent ainsi
 * synchronisés quel que soit l'endroit où le réglage a été changé.
 */
export const useSettingsStore = defineStore('settings', {
  state: (): AppSettings => ({ ...DEFAULT_SETTINGS }),

  getters: {
    isDark: (state) => state.theme === 'dark',
  },

  actions: {
    /**
     * Charge tous les paramètres en un seul appel puis les applique.
     */
    async load() {
      try {
        const values = await globalThis.settings.getAll()
        this.theme = values.theme
        this.primaryColor = values.primaryColor
        getLogger().debug('[Settings] Paramètres chargés', values)
      } catch (error) {
        // On garde les valeurs par défaut : l'app reste utilisable
        getLogger().error('[Settings] Erreur lors du chargement des paramètres', error)
      }

      this.applyAll()
    },

    /**
     * Applique les paramètres visuels à la page.
     */
    applyAll() {
      document.documentElement.classList.toggle('app-dark', this.isDark)
      // Une ancienne couleur enregistrée est ramenée au thème le plus proche
      applyTheme(getAppTheme(this.primaryColor))
    },

    /**
     * Mode clair ou sombre : appliqué tout de suite, puis enregistré.
     * @param value Mode choisi
     */
    async setTheme(value: AppSettings['theme']) {
      this.theme = value
      document.documentElement.classList.toggle('app-dark', this.isDark)
      await this.persist('theme', value)
    },

    /**
     * Couleur d'accent : appliquée tout de suite, puis enregistrée.
     * @param value Nom du thème de couleur
     */
    async setPrimaryColor(value: string) {
      this.primaryColor = value
      applyTheme(getAppTheme(value))
      await this.persist('primaryColor', value)
    },

    /**
     * Enregistre un paramètre via le pont du preload.
     * @param key Clé du paramètre
     * @param value Valeur à enregistrer
     */
    async persist<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
      try {
        await globalThis.settings.set(key, value)
      } catch (error) {
        getLogger().error(`[Settings] Erreur lors de l'enregistrement de ${key}`, error)
        throw error
      }
    },
  },
})
