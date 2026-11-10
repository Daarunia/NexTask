import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { type AppSettings, DEFAULT_SETTINGS } from '@core/shared/settings.constants'
import { getAppTheme } from '../constants/theme.constants'
import { applyTheme } from '../utils/theme.helper'
import { getLogger } from '../utils/logger'
import { api } from '../utils/api.helper'
import { type DataSettings, isDataSettingsKey } from '@core/shared/settings.schema'

/**
 * Vrai si les réglages « données » sont ceux du serveur (NexTask Client
 * connecté), lus et écrits par GET / PATCH /settings. Sinon, ils restent avec
 * ceux de l'appareil, dans electron-store.
 */
function dataSettingsInApi(): boolean {
  const server = globalThis.server
  return server?.capabilities?.dataSettingsInApi === true && server.status === 'connected'
}

/**
 * Réglages « données » du serveur (NexTask Client), ou rien sans serveur.
 */
async function loadServerDataSettings(): Promise<Partial<DataSettings>> {
  if (!dataSettingsInApi()) return {}
  try {
    return await api.get<DataSettings>('/settings')
  } catch (error) {
    getLogger().error('[Settings] Réglages du serveur non chargés', error)
    return {}
  }
}

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
 * Le store lit et écrit via le pont du preload (electron-store côté main),
 * sauf les réglages « données » de NexTask Client, gardés par le serveur
 * (cf. DATA_SETTINGS_KEYS), et applique lui-même chaque paramètre visuel : les composants (en-tête, page
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
        this.$patch(await loadServerDataSettings())
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
     * Remet tous les paramètres à leurs valeurs par défaut (côté main, en une
     * écriture), puis applique celles renvoyées. Dans NexTask Client, les
     * réglages « données » sont ceux du serveur, partagés avec les autres
     * appareils : ils ne changent pas, et sont relus.
     */
    async reset() {
      try {
        const values = await globalThis.settings.reset()
        this.$patch(values)
        this.$patch(await loadServerDataSettings())
        this.applyAll()
        getLogger().info('[Settings] Paramètres remis à leurs valeurs par défaut')
      } catch (error) {
        getLogger().error('[Settings] Erreur lors de la remise à zéro des paramètres', error)
        throw error
      }
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
        const raw = structuredClone(toRaw(value))
        if (dataSettingsInApi() && isDataSettingsKey(key)) {
          // Réglage « données » de NexTask Client : gardé par le serveur
          await api.patch('/settings', { [key]: raw })
        } else {
          await globalThis.settings.set(key, raw)
        }
      } catch (error) {
        getLogger().error(`[Settings] Erreur lors de l'enregistrement de ${key}`, error)
        this.$patch({ [key]: previous })
        if (visual) this.applyAll()
        throw error
      }
    },
  },
})
