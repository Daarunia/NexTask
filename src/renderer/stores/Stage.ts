import { defineStore } from "pinia";
import { MINUTE } from "../constants/time.constants";
import { Stage } from "../types/stage.types";
import { BaseEntityState } from "../types/base-store.types";
import { Task } from "../types/task.types";
import { api } from "../utils/api.helper";
import { isCacheValid } from "../utils/cache.helper";
import { useTaskStore } from "./Task";
import { getLogger } from "../utils/logger";

interface StageState extends BaseEntityState<Stage> {
  // No custom attribut
}

export const useStageStore = defineStore("stage", {
  state: (): StageState => ({
    entities: {},
    allEntities: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
    lastFetch: null,
    baseUrl: import.meta.env.VITE_BASE_URL,
  }),
  getters: {
    /**
     * Getter pour récupérer toutes les tâches non historisées
     */
    getAllStages(state): Stage[] {
      if (!state.allEntities) return [];

      if (isCacheValid(state.allEntities, state.ttl)) {
        return state.allEntities.data;
      }

      return [];
    },
  },
  actions: {
    setStageCache(id: number, data: Stage) {
      this.entities[id] = { data, timestamp: Date.now() };
    },

    setAllStagesCache(data: Stage[]) {
      this.allEntities = { data, timestamp: Date.now() };
      this.lastFetch = Date.now();
    },

    async loadAllStages(): Promise<void> {
      if (isCacheValid(this.allEntities, this.ttl)) return;
      const stagesFromApi = await api.get<Stage[]>(`/stages`);

      this.allEntities = { data: stagesFromApi, timestamp: Date.now() };
      this.lastFetch = Date.now();

      const allTasks: Task[] = stagesFromApi.flatMap((stage) => stage.tasks);
      const taskStore = useTaskStore();

      taskStore.setAllTasksCache(allTasks);
    },

    async updateStageBatch(
      stages: { id: number; position: number }[],
    ): Promise<void> {
      await api.patch(`/stages/batch`, stages);

      // Mise à jour du cache local
      if (this.allEntities) {
        const updatedStages = [...this.allEntities.data];

        stages.forEach((updated) => {
          const index = updatedStages.findIndex((s) => s.id === updated.id);
          if (index !== -1) {
            updatedStages[index] = {
              ...updatedStages[index],
              position: updated.position,
            };
          }
        });

        // re-trier
        updatedStages.sort((a, b) => a.position - b.position);

        this.allEntities = {
          data: updatedStages,
          timestamp: Date.now(),
        };
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
        };

        const newStage = await api.post<Stage>(`/stages`, payload);

        // Mise à jour du cache
        this.setStageCache(newStage.id, newStage);

        if (this.allEntities?.data) {
          this.allEntities.data.push(newStage);
          this.allEntities.timestamp = Date.now();
        } else {
          this.setAllStagesCache([newStage]);
        }

        return newStage;
      } catch (error) {
        getLogger().error("Erreur lors de la sauvegarde de la colonne : ", error);
        throw error;
      }
    },

    /**
     * Suppression d'une colonne, historisation des tâches enfants
     * 
     * @param id stage id
     */
    async deleteStage(id: number): Promise<void> {
      const logger = getLogger();
      const taskStore = useTaskStore();

      try {
        const tasksToArchive = taskStore.allEntities?.data.filter((task) => task.stageId === id && !task.isHistorized) ?? [];

        for (const task of tasksToArchive) {
          await taskStore.archiveTask(task.id);
        }

        await api.delete(`/stages/${id}`);

        if (this.entities[id]) {
          delete this.entities[id];
        }

        if (this.allEntities) {
          const index = this.allEntities.data.findIndex((s) => s.id === id);

          if (index !== -1) {
            this.allEntities.data.splice(index, 1);
            this.allEntities.timestamp = Date.now();
          }
        }

        logger.debug(`Stage ${id} supprimée + tâches archivées`);
      } catch (error) {
        logger.error(`Erreur lors de la suppression de la stage ${id}:`, error);
        throw error;
      }
    }
  },
});
