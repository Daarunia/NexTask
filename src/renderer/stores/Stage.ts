import { defineStore } from 'pinia'
import { CACHE_TTL } from '../constants/time.constants'
import { Stage } from '../types/stage.types'
import { BaseEntityState } from '../types/base-store.types'
import { api } from '../utils/api.helper'
import { isCacheValid } from '../utils/cache.helper'
import { useTaskStore } from './Task'
import { getLogger } from '../utils/logger'

/**
 * Cache des colonnes, chargé en même temps que celui des tâches.
 * Même règle que le store des tâches : le timestamp est celui du dernier
 * chargement serveur, les mutations ne le rafraîchissent pas.
 */
export const useStageStore = defineStore('stage', {
  state: (): BaseEntityState<Stage> => ({
    allEntities: null,
    ttl: CACHE_TTL,
  }),
  getters: {
    /**
     * Getter pour récupérer toutes les colonnes (sans contrôle du TTL, cf. getAllTasks)
     */
    getAllStages(state): Stage[] {
      return state.allEntities?.data ?? []
    },
  },
  actions: {
    setAllStagesCache(data: Stage[]) {
      this.allEntities = { data, timestamp: Date.now() }
    },

    /**
     * Chargement des colonnes et de leurs tâches.
     * Les deux caches sont remplis par le même appel : on ne le saute que s'ils
     * sont tous deux valides, sinon l'un pourrait être servi sans l'autre.
     */
    async loadAllStages(): Promise<void> {
      const taskStore = useTaskStore()
      if (isCacheValid(this.allEntities, this.ttl) && isCacheValid(taskStore.allEntities, taskStore.ttl)) return

      const stagesFromApi = await api.get<Stage[]>(`/stages`)

      this.setAllStagesCache(stagesFromApi)
      taskStore.setAllTasksCache(stagesFromApi.flatMap((stage) => stage.tasks))
    },

    async updateStageBatch(stages: { id: number; position: number }[]): Promise<void> {
      try {
        await api.patch(`/stages/batch`, stages)
      } catch (error) {
        getLogger().error('Erreur lors de la mise à jour batch des colonnes :', error)
        throw error
      }

      // Mise à jour du cache local
      if (this.allEntities) {
        const updatedStages = [...this.allEntities.data]

        stages.forEach((updated) => {
          const index = updatedStages.findIndex((s) => s.id === updated.id)
          if (index !== -1) {
            updatedStages[index] = {
              ...updatedStages[index],
              position: updated.position,
            }
          }
        })

        // re-trier
        updatedStages.sort((a, b) => a.position - b.position)

        this.allEntities.data = updatedStages
      }
    },

    /**
     * Création d'une colonne
     * @param name Nom de la colonne
     * @param position Position de la colonne
     */
    async saveStage(name: string, position: number): Promise<Stage> {
      try {
        const payload = {
          name,
          position,
        }

        const newStage = await api.post<Stage>(`/stages`, payload)

        // Sans cache chargé, on laisse le prochain chargement ramener la colonne (cf. saveTask)
        this.allEntities?.data.push(newStage)

        return newStage
      } catch (error) {
        getLogger().error('Erreur lors de la sauvegarde de la colonne : ', error)
        throw error
      }
    },

    /**
     * Suppression d'une colonne, historisation des tâches enfants
     *
     * @param id stage id
     */
    async deleteStage(id: number): Promise<void> {
      const logger = getLogger()
      const taskStore = useTaskStore()

      try {
        // Le serveur historise les tâches et supprime la colonne dans une même transaction
        await api.delete(`/stages/${id}`)
        taskStore.markStageTasksArchived(id)

        if (this.allEntities) {
          this.allEntities.data = this.allEntities.data.filter((s) => s.id !== id)
        }

        logger.debug(`Stage ${id} supprimée + tâches archivées`)
      } catch (error) {
        logger.error(`Erreur lors de la suppression de la stage ${id}:`, error)
        throw error
      }
    },
    /**
     * Mise à jour du nom d'une colonne
     * @param id Id de la colonne
     * @param name Nouveau nom de la colonne
     * @returns La colonne mise à jour
     */
    async updateStage(id: number, name: string): Promise<Stage> {
      try {
        // Envoi de la requête PATCH pour mettre à jour le nom
        const updatedStage = await api.patch<Stage>(`/stages/${id}`, { name })

        // Met à jour le cache local
        const stageToUpdate = this.allEntities?.data.find((s) => s.id === id)
        if (stageToUpdate) {
          Object.assign(stageToUpdate, updatedStage)
        } else {
          getLogger().warn("Colonne non trouvée dans le cache pour l'ID", id)
        }

        return updatedStage
      } catch (error) {
        getLogger().error('Erreur lors de la mise à jour du nom de la colonne :', error)
        throw new Error(`Erreur de mise à jour pour la colonne ${id}: ${error}`)
      }
    },
  },
})
