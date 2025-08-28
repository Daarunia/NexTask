import { defineStore } from "pinia";
import axios from "axios";

/**
 * Milliseconde en minute
 */
const MINUTE = 60 * 1000;

/**
 * Entité 'Tâches'
 */
export interface Task {
  id: number;
  stage: string;
  version: string;
  description: string;
  position: number;
  title: string;
  redmine?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface TaskState {
  tasks: Record<number, CacheEntry<Task>>;
  allTasks: CacheEntry<Task[]> | null;
  ttl: number;
  lastFetch: number | null;
  baseUrl: string;
}

export const useTaskStore = defineStore("task", {
  state: (): TaskState => ({
    tasks: {},
    allTasks: null,
    ttl: 5 * MINUTE,
    lastFetch: null,
    baseUrl: "http://localhost:3000",
  }),
  getters: {
    getTaskById: (state) => {
      return (id: number): Task | null => {
        const task = state.tasks[id];
        if (!task) return null;
        const isExpired = Date.now() - task.timestamp > state.ttl;
        return isExpired ? null : task.data;
      };
    },
    isCacheValid(): (cache: CacheEntry<any> | null) => boolean {
      return (cache: CacheEntry<any> | null) => {
        if (!cache) return false;
        return Date.now() - cache.timestamp <= this.ttl;
      };
    },
    getAllTasks(state): Task[] | null {
      if (!state.allTasks) return null;
      const isValid = this.isCacheValid(state.allTasks);
      return isValid ? state.allTasks.data : null;
    },
  },
  actions: {
    setTaskCache(id: number, data: Task) {
      this.tasks[id] = { data, timestamp: Date.now() };
    },

    setAllTasksCache(data: Task[]) {
      this.allTasks = { data, timestamp: Date.now() };
      this.lastFetch = Date.now();
    },

    /**
     * Récupération d'une tâche par id
     * @returns une tâche
     */
    async fetchTask(id: number): Promise<Task> {
      const cached = this.getTaskById(id);
      if (cached) return cached;

      const res = await axios.get<Task>(`${this.baseUrl}/tasks/${id}`);
      const data = res.data;
      this.setTaskCache(data.id, data);
      return data;
    },

    /**
     * Récupération de toutes les tâches
     * @returns Toutes les tâches
     */
    async fetchAllTasks(): Promise<Task[]> {
      if (this.isCacheValid(this.allTasks)) {
        return this.allTasks!.data;
      }

      const res = await axios.get<Task[]>(`${this.baseUrl}/tasks`);
      const data = res.data;
      this.setAllTasksCache(data);
      return data;
    },

    /**
     * Mise à jour de la colonne d'une tâche
     * @param id
     * @param stage
     */
    async updateTaskStage(id: number, stage: string): Promise<void> {
      try {
        await axios.patch(`${this.baseUrl}/tasks/${id}`, { stage });

        // Met à jour le cache local si la tâche existe
        const task = this.getTaskById(id);
        if (task) {
          task.stage = stage;
          this.setTaskCache(id, task);
        }

        // Met à jour aussi le cache allTasks si nécessaire
        if (this.allTasks) {
          const index = this.allTasks.data.findIndex((t) => t.id === id);
          if (index !== -1) {
            this.allTasks.data[index].stage = stage;
            this.allTasks.timestamp = Date.now();
          }
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour de la tâche:", error);
        throw error;
      }
    },
  },
});