import { defineStore } from "pinia";
import { MINUTE } from "../constants/time.constants";
import { Stage } from "../types/stage.types";
import { BaseEntityState } from "../types/base-store.types";
import { Task } from "../types/task.types";
import { api } from "../utils/api.helper";
import { isCacheValid } from "../utils/cache.helper";
import { useTaskStore } from "./Task";

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
    async loadAllStages(): Promise<void> {
      if (isCacheValid(this.allEntities, this.ttl)) return;

      const stagesFromApi = await api.get<Stage[]>(`/stages`);

      this.allEntities = { data: stagesFromApi, timestamp: Date.now() };
      this.lastFetch = Date.now();

      const allTasks: Task[] = stagesFromApi.flatMap((stage) => stage.tasks);
      const taskStore = useTaskStore();

      taskStore.setAllTasksCache(allTasks);
    },
  },
});
