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
  isHistorized: boolean;
  historizationDate?: Date;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface TaskState {
  tasks: Record<number, CacheEntry<Task>>;
  historizedTasks: CacheEntry<Task[]> | null;
  allTasks: CacheEntry<Task[]> | null;
  ttl: number;
  lastFetch: number | null;
  baseUrl: string;
}

export const useTaskStore = defineStore("task", {
  state: (): TaskState => ({
    tasks: {},
    historizedTasks: null,
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
    /**
     * Getter pour récupérer toutes les tâches non historisées
     */
    getAllTasks(state): Task[] {
      if (!state.allTasks) return [];

      if (this.isCacheValid(state.allTasks)) {
        return state.allTasks.data.filter((task) => !task.isHistorized);
      }

      return [];
    },

    /**
     * Getter pour récupérer toutes les tâches historisées
     */
    getHistorizedTasks(state): Task[] {
      if (!state.allTasks) return [];

      if (this.isCacheValid(state.allTasks)) {
        return state.allTasks.data.filter((task) => task.isHistorized);
      }

      return [];
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
     * Lancement du chargement initial des tâches
     */
    async loadAllTasks(): Promise<void> {
      if (this.isCacheValid(this.allTasks)) return;

      const res = await axios.get<Task[]>(`${this.baseUrl}/tasks`);
      this.setAllTasksCache(res.data);
    },

    /**
     * Marque une tâche comme historisée par ID
     * - Supprime la tâche du cache classique
     * - Ajoute la tâche dans le cache des tâches historisées
     */
    async archiveTask(id: number): Promise<void> {
      try {
        await axios.put(`${this.baseUrl}/tasks/${id}`);

        let archivedTask: Task | null = null;

        // Récupération + suppression du cache individuel
        if (this.tasks[id]) {
          archivedTask = {
            ...this.tasks[id].data,
            isHistorized: true,
            historizationDate: new Date(),
          };
          delete this.tasks[id];
        }

        // Mise à jour du cache global allTasks
        if (this.allTasks) {
          const index = this.allTasks.data.findIndex((task) => task.id === id);

          if (index !== -1) {
            this.allTasks.data[index] = {
              ...this.allTasks.data[index],
              isHistorized: true,
              historizationDate: new Date(),
            };

            archivedTask = this.allTasks.data[index];
            this.allTasks.timestamp = Date.now();
          }
        }

        // Ajout dans le cache des tâches historisées
        if (archivedTask) {
          if (this.historizedTasks && this.isCacheValid(this.historizedTasks)) {
            this.historizedTasks.data.push(archivedTask);
            this.historizedTasks.timestamp = Date.now();
          } else {
            this.historizedTasks = {
              data: [archivedTask],
              timestamp: Date.now(),
            };
          }
        }
      } catch (error) {
        console.error(`Erreur lors de l’archivage de la tâche ${id}:`, error);
        throw error;
      }
    },

    /**
     * Supprime une tâche par ID
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
          const index = this.allTasks.data.findIndex((t) => t.id === id);
          if (index !== -1) {
            this.allTasks.data.splice(index, 1);
            this.allTasks.timestamp = Date.now();
          }
        }
      } catch (error) {
        console.error(
          `Erreur lors de la suppression de la tâche ${id}:`,
          error,
        );
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
     * Création d'une tâche
     * @param task Tâche à créer
     */
    async saveTask(task: Omit<Task, "id">): Promise<Task> {
      try {
        const res = await axios.post<Task>(`${this.baseUrl}/tasks`, task);
        const newTask = res.data;

        // Mise à jour du cache
        this.setTaskCache(newTask.id, newTask);

        if (this.allTasks?.data) {
          this.allTasks.data.push(newTask);
          this.allTasks.timestamp = Date.now();
        } else {
          this.setAllTasksCache([newTask]);
        }

        return newTask;
      } catch (error) {
        console.error("Erreur lors de la sauvegarde de la tâche : ", error);
        throw error;
      }
    },

    /**
     * Mise à jour complète d'une tâche à partir d'un objet Task
     * @param task Objet Task avec un id existant
     * @returns La tâche mise à jour ou une erreur si la mise à jour échoue
     */
    async updateTask(task: Task): Promise<Task> {
      try {
        // Envoi de la requête PATCH pour mettre à jour la tâche sur le serveur
        await axios.patch(`${this.baseUrl}/tasks/${task.id}`, task);

        // Met à jour le cache local
        const existingTask = this.getTaskById(task.id);
        if (existingTask) {
          this.setTaskCache(task.id, { ...task });
        } else {
          console.warn("Aucune tâche trouvée dans le cache pour l'ID", task.id);
        }

        // Met à jour allTasks si elle existe
        if (this.allTasks?.data) {
          const index = this.allTasks.data.findIndex((t) => t.id === task.id);
          if (index === -1) {
            console.warn("Tâche non trouvée dans allTasks pour l'ID", task.id);
          } else {
            // Remplace l'ancienne tâche par la mise à jour
            this.allTasks.data[index] = { ...task };
            this.allTasks.timestamp = Date.now();
          }
        }

        // Retourne la tâche mise à jour pour confirmation
        return { ...task };
      } catch (error) {
        console.error("Erreur lors de la mise à jour de la tâche:", error);
        throw new Error(
          `Erreur de mise à jour pour la tâche ID ${task.id}: ${error}`,
        );
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
        const response = await axios.patch(
          `${this.baseUrl}/tasks/batch`,
          tasks,
        );
        const updatedTasks: Task[] = response.data;

        // Mise à jour du cache local pour chaque tâche
        updatedTasks.forEach((task: Task) => {
          const existingTask = this.getTaskById(task.id);
          if (existingTask) {
            this.setTaskCache(task.id, { ...task });
          }

          if (this.allTasks?.data) {
            const index = this.allTasks.data.findIndex((t) => t.id === task.id);
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
        console.error(
          "Erreur lors de la mise à jour du batch de tâches:",
          error,
        );
        throw error;
      }
    },
  },
});
