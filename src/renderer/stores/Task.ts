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
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
    lastFetch: null,
    baseUrl: import.meta.env.VITE_BASE_URL,
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
      console.log((window as any).env.BASE_URL)
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
     * * Supprime une tâche par ID
     * @param id ID de la tâche
     */
    async deleteTask(id: number): Promise<void> {
      try {
        // Appel API pour supprimer la tâche
        await axios.delete(`${this.baseUrl}/tasks/${id}`);

        // Supprime la tâche du cache individuel si elle existe
        if (this.tasks[id]) {
          delete this.tasks[id];
        }

        // Supprime la tâche du cache allTasks si elle existe
        if (this.allTasks) {
          const index = this.allTasks.data.findIndex(t => t.id === id);
          if (index !== -1) {
            this.allTasks.data.splice(index, 1);
            this.allTasks.timestamp = Date.now();
          }
        }

      } catch (error) {
        console.error(`Erreur lors de la suppression de la tâche ${id}:`, error);
        throw error;
      }
    },

    /**
     * Récupération d'une tâche par id
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
     * Mise à jour complète d'une tâche à partir d'un objet Task
     * @param task Objet Task avec un id existant
     */
    async updateTask(task: Task): Promise<void> {
      try {
        await axios.patch(`${this.baseUrl}/tasks/${task.id}`, task);

        // Met à jour le cache local
        const existingTask = this.getTaskById(task.id);
        if (existingTask) {
          this.setTaskCache(task.id, { ...task });
        }

        // Met à jour allTasks si elle existe
        if (this.allTasks?.data) {
          const index = this.allTasks.data.findIndex(t => t.id === task.id);
          if (index !== -1) {
            this.allTasks.data[index] = { ...task };
            this.allTasks.timestamp = Date.now();
          }
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour de la tâche:", error);
        throw error;
      }
    },

    /**
     * Mise à jour complète d'un ensemble de tâches
     * @param tasks Tableau de Task avec des id existants
     */
    async updateTaskBatch(tasks: Task[]): Promise<void> {
      if (!tasks.length) return;

      try {
        // Envoi des tâches au serveur pour mise à jour
        const response = await axios.patch(`${this.baseUrl}/tasks/batch`, tasks);
        const updatedTasks: Task[] = response.data;

        // Mise à jour du cache local pour chaque tâche
        updatedTasks.forEach((task: Task) => {
          const existingTask = this.getTaskById(task.id);
          if (existingTask) {
            this.setTaskCache(task.id, { ...task });
          }

          if (this.allTasks?.data) {
            const index = this.allTasks.data.findIndex(t => t.id === task.id);
            if (index !== -1) {
              this.allTasks.data[index] = { ...task };
            }
          }
        });

        // Met à jour le timestamp global
        if (this.allTasks) {
          this.allTasks.timestamp = Date.now();
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour du batch de tâches:", error);
        throw error;
      }
    }
  },
});