import { defineStore } from 'pinia'
import { CACHE_TTL } from '../constants/time.constants'
import type { ChecklistTemplate, ChecklistTemplateChanges } from '../types/checklistTemplate.types'
import { BaseEntityState } from '../types/base-store.types'
import { api } from '../utils/api.helper'
import { isCacheValid } from '../utils/cache.helper'
import { getLogger } from '../utils/logger'

/**
 * Ordre d'affichage des modèles, celui de la page Checklists et du menu du
 * dialogue de tâche (position, puis id en cas d'égalité, comme le serveur).
 * @param a Premier modèle
 * @param b Second modèle
 */
function compareTemplates(a: ChecklistTemplate, b: ChecklistTemplate): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Cache des modèles de checklist, gérés dans la page Checklists et
 * appliqués depuis le dialogue de tâche.
 *
 * Même règle que les autres stores, le timestamp est celui du dernier
 * chargement serveur, les mutations ne le rafraîchissent pas. Les modèles
 * renvoyés par le serveur remplacent ceux du cache (noms et points nettoyés,
 * points vides retirés).
 */
export const useChecklistTemplateStore = defineStore('checklistTemplate', {
  state: (): BaseEntityState<ChecklistTemplate> => ({
    allEntities: null,
    ttl: CACHE_TTL,
  }),
  getters: {
    /**
     * Getter pour récupérer tous les modèles dans leur ordre (sans contrôle du TTL, cf. getAllTasks)
     */
    getAllTemplates(state): ChecklistTemplate[] {
      return [...(state.allEntities?.data ?? [])].sort(compareTemplates)
    },

    /**
     * Getter pour récupérer un modèle par son id (`undefined` s'il n'existe pas)
     */
    getTemplateById(state): (id: number) => ChecklistTemplate | undefined {
      return (id: number) => state.allEntities?.data.find((template) => template.id === id)
    },
  },
  actions: {
    setAllTemplatesCache(data: ChecklistTemplate[]) {
      this.allEntities = { data, timestamp: Date.now() }
    },

    /**
     * Remplace un modèle du cache par celui renvoyé par le serveur, ou l'ajoute
     * @param template Modèle à jour
     */
    putCachedTemplate(template: ChecklistTemplate) {
      if (!this.allEntities) {
        // Timestamp 0 sans chargement, le cache reste à recharger (cf. createTag)
        this.allEntities = { data: [template], timestamp: 0 }
        return
      }
      const index = this.allEntities.data.findIndex((t) => t.id === template.id)
      if (index === -1) this.allEntities.data.push(template)
      else this.allEntities.data[index] = template
    },

    /**
     * Chargement des modèles et de leurs points
     * @param force Recharge même si le cache est encore valide
     */
    async loadAllTemplates(force = false): Promise<void> {
      if (!force && isCacheValid(this.allEntities, this.ttl)) return

      try {
        this.setAllTemplatesCache(await api.get<ChecklistTemplate[]>(`/checklist-templates`))
      } catch (error) {
        getLogger().error('Erreur lors du chargement des modèles de checklist :', error)
        throw error
      }
    },

    /**
     * Création d'un modèle en fin de liste
     * @param name Nom du modèle (nettoyé par le serveur)
     * @param items Textes des points, aucun par défaut
     * @returns Le modèle créé
     */
    async createTemplate(name: string, items: string[] = []): Promise<ChecklistTemplate> {
      try {
        const template = await api.post<ChecklistTemplate>(`/checklist-templates`, { name, items })
        this.putCachedTemplate(template)
        getLogger().debug('Modèle de checklist créé', template.id)
        return template
      } catch (error) {
        getLogger().error(`Erreur lors de la création du modèle « ${name} » :`, error)
        throw error
      }
    },

    /**
     * Renomme un modèle et/ou remplace ses points. Le cache ne change qu'une
     * fois la modification acceptée, la liste ne montre donc que des noms enregistrés.
     * @param id Id du modèle
     * @param changes Nouveau nom et/ou nouveaux points
     * @returns Le modèle mis à jour
     */
    async updateTemplate(id: number, changes: ChecklistTemplateChanges): Promise<ChecklistTemplate> {
      try {
        const template = await api.patch<ChecklistTemplate>(`/checklist-templates/${id}`, changes)
        this.putCachedTemplate(template)
        return template
      } catch (error) {
        getLogger().error(`Erreur lors de la mise à jour du modèle ${id} :`, error)
        throw error
      }
    },

    /**
     * Envoie une modification en attente pendant la fermeture de la fenêtre,
     * sans attendre la réponse (cf. api.patchOnUnload). Le cache n'est pas
     * touché, il disparaît avec la page.
     * @param id Id du modèle
     * @param changes Nouveau nom et/ou nouveaux points
     */
    updateTemplateOnUnload(id: number, changes: ChecklistTemplateChanges) {
      api.patchOnUnload(`/checklist-templates/${id}`, changes)
      getLogger().debug(`Modèle ${id} envoyé à la fermeture de la page`)
    },

    /**
     * Copie d'un modèle en fin de liste, nommée « Nom (copie) » par le serveur
     * @param id Id du modèle copié
     * @returns La copie
     */
    async duplicateTemplate(id: number): Promise<ChecklistTemplate> {
      try {
        const copy = await api.post<ChecklistTemplate>(`/checklist-templates/${id}/duplicate`)
        this.putCachedTemplate(copy)
        getLogger().debug(`Modèle ${id} dupliqué en ${copy.id}`)
        return copy
      } catch (error) {
        getLogger().error(`Erreur lors de la duplication du modèle ${id} :`, error)
        throw error
      }
    },

    /**
     * Suppression d'un modèle, sans effet sur les tâches (leurs points sont des copies)
     * @param id Id du modèle
     */
    async deleteTemplate(id: number): Promise<void> {
      try {
        await api.delete(`/checklist-templates/${id}`)
        if (this.allEntities) {
          this.allEntities.data = this.allEntities.data.filter((t) => t.id !== id)
        }
        getLogger().debug(`Modèle ${id} supprimé`)
      } catch (error) {
        getLogger().error(`Erreur lors de la suppression du modèle ${id} :`, error)
        throw error
      }
    },

    /**
     * Range les modèles dans l'ordre donné (glisser-déposer). Mise à jour
     * optimiste des positions, rétablies si le serveur refuse.
     * @param orderedIds Ids de tous les modèles, dans leur nouvel ordre
     */
    async reorderTemplates(orderedIds: number[]): Promise<void> {
      const data = this.allEntities?.data
      if (!data) return

      const previous = new Map(data.map((template) => [template.id, template.position]))
      const moves = orderedIds
        .map((id, position) => ({ id, position }))
        .filter(({ id, position }) => previous.has(id) && previous.get(id) !== position)
      if (!moves.length) return

      for (const { id, position } of moves) {
        const template = data.find((t) => t.id === id)
        if (template) template.position = position
      }

      try {
        await api.patch(`/checklist-templates/batch`, moves)
      } catch (error) {
        for (const template of data) {
          template.position = previous.get(template.id) ?? template.position
        }
        getLogger().error('Erreur lors du réordonnancement des modèles de checklist :', error)
        throw error
      }
    },
  },
})
