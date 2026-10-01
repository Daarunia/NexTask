import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { type AppSettings, DEFAULT_SETTINGS } from '../../main/shared/settings.constants'
import { getAppTheme } from '../constants/theme.constants'
import { applyTheme } from '../utils/theme.helper'
import { getLogger } from '../utils/logger'

// Préférence sombre de l'OS, suivie par le mode « système »
const systemDarkQuery = globalThis.matchMedia('(prefers-color-scheme: dark)')

// Résolue une fois les paramètres chargés (ou les valeurs par défaut gardées
// après un échec). Les pages montées avant App, comme le tableau, l'attendent.
let resolveLoaded: () => void = () => {}
const loaded = new Promise<void>((resolve) => {
  resolveLoaded = resolve
})

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
      resolveLoaded()

      systemDarkQuery.addEventListener('change', (event) => {
        this.systemDark = event.matches
        this.applyMode()
      })
    },

    /**
     * Attend le chargement des paramètres par `load`.
     */
    whenLoaded(): Promise<void> {
      return loaded
    },

    /**
     * Active ou désactive la mémorisation du filtre de tags. Désactivée, le
     * filtre mémorisé est oublié pour ne pas ressurgir à la réactivation.
     * @param enabled Nouvelle valeur du paramètre
     */
    async setRememberTagFilter(enabled: boolean) {
      // Envoyés ensemble : un rechargement juste après ne coupe pas le second
      const writes = [this.set('rememberTagFilter', enabled)]
      if (!enabled) writes.push(this.set('tagFilterIds', []))
      await Promise.all(writes)
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
