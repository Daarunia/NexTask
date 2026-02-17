import { defineStore } from "pinia";
import { MINUTE } from "../constants/time.constants";
import { CacheEntry } from "../types/cache.types";
import { Task } from "../types/task.types";
import { isCacheValid } from "../utils/cache.helper";
import { BaseEntityState } from "../types/base-store.types";
import { api } from "../utils/api.helper";
import { getLogger } from "../utils/logger";

interface TaskState extends BaseEntityState<Task> {
  historizedTasks: CacheEntry<Task[]> | null;
}

export const useTaskStore = defineStore("task", {
  state: (): TaskState => ({
    entities: {},
    historizedTasks: null,
    allEntities: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
    lastFetch: null,
    baseUrl: import.meta.env.VITE_BASE_URL,
  }),
  getters: {
    getTaskById: (state) => {
      return (id: number): Task | null => {
        const task = state.entities[id];
        if (!task) return null;
        const isExpired = Date.now() - task.timestamp > state.ttl;
        return isExpired ? null : task.data;
      };
    },

    /**
     * Getter pour récupérer toutes les tâches non historisées
     */
    getAllTasks(state): Task[] {
      if (!state.allEntities) return [];

      if (isCacheValid(state.allEntities, state.ttl)) {
        return state.allEntities.data.filter((task) => !task.isHistorized);
      }

      return [];
    },

    /**
     * Getter pour récupérer toutes les tâches historisées
     */
    getHistorizedTasks(state): Task[] {
      if (!state.allEntities) return [];

      if (isCacheValid(state.allEntities, state.ttl)) {
        return state.allEntities.data.filter((task) => task.isHistorized);
      }

      return [];
    },
  },
  actions: {
    setTaskCache(id: number, data: Task) {
      this.entities[id] = { data, timestamp: Date.now() };
    },

    setAllTasksCache(data: Task[]) {
      this.allEntities = { data, timestamp: Date.now() };
      this.lastFetch = Date.now();
    },

    /**
     * Lancement du chargement initial des tâches
     */
    async loadAllTasks(): Promise<void> {
      if (isCacheValid(this.allEntities, this.ttl)) return;

      const res = await api.get<Task[]>(`/tasks`);
      getLogger().debug("test", res);
      this.setAllTasksCache(res);
    },

    /**
     * Marque une tâche comme historisée par ID
     * - Supprime la tâche du cache classique
     * - Ajoute la tâche dans le cache des tâches historisées
     */
    async archiveTask(id: number): Promise<void> {
      try {
        await api.put(`/tasks/${id}`, {});

        let archivedTask: Task | null = null;

        // Récupération + suppression du cache individuel
        if (this.entities[id]) {
          archivedTask = {
            ...this.entities[id].data,
            isHistorized: true,
            historizationDate: new Date(),
          };
          delete this.entities[id];
        }

        // Mise à jour du cache global allTasks
        if (this.allEntities) {
          const index = this.allEntities.data.findIndex(
            (task) => task.id === id,
          );

          if (index !== -1) {
            this.allEntities.data[index] = {
              ...this.allEntities.data[index],
              isHistorized: true,
              historizationDate: new Date(),
            };

            archivedTask = this.allEntities.data[index];
            this.allEntities.timestamp = Date.now();
          }
        }

        // Ajout dans le cache des tâches historisées
        if (archivedTask) {
          if (
            this.historizedTasks &&
            isCacheValid(this.historizedTasks, this.ttl)
          ) {
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
        getLogger().error(
          `Erreur lors de l’archivage de la tâche ${id}:`,
          error,
        );
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
        await api.delete(`/tasks/${id}`);

        // Supprime la tâche du cache individuel si elle existe
        if (this.entities[id]) {
          delete this.entities[id];
        }

        // Supprime la tâche du cache allTasks si elle existe
        if (this.allEntities) {
          const index = this.allEntities.data.findIndex((t) => t.id === id);
          if (index !== -1) {
            this.allEntities.data.splice(index, 1);
            this.allEntities.timestamp = Date.now();
          }
        }
      } catch (error) {
        getLogger().error(
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

      const data = await api.get<Task>(`/tasks/${id}`);
      this.setTaskCache(data.id, data);
      return data;
    },

    /**
     * Récupération de toutes les tâches
     */
    async fetchAllTasks(): Promise<Task[]> {
      if (isCacheValid(this.allEntities, this.ttl)) {
        return this.allEntities!.data;
      }

      const data = await api.get<Task[]>(`${this.baseUrl}/tasks`);
      this.setAllTasksCache(data);
      return data;
    },

    /**
     * Création d'une tâche
     * @param task Tâche à créer
     */
    async saveTask(task: Omit<Task, "id">): Promise<Task> {
      try {
        const newTask = await api.post<Task>(`/tasks`, task);

        // Mise à jour du cache
        this.setTaskCache(newTask.id, newTask);

        if (this.allEntities?.data) {
          this.allEntities.data.push(newTask);
          this.allEntities.timestamp = Date.now();
        } else {
          this.setAllTasksCache([newTask]);
        }

        return newTask;
      } catch (error) {
        getLogger().error("Erreur lors de la sauvegarde de la tâche : ", error);
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
        await api.patch(`/tasks/${task.id}`, task);

        // Met à jour le cache local
        const existingTask = this.getTaskById(task.id);
        if (existingTask) {
          this.setTaskCache(task.id, { ...task });
        } else {
          getLogger().warn(
            "Aucune tâche trouvée dans le cache pour l'ID",
            task.id,
          );
        }

        // Met à jour allTasks si elle existe
        if (this.allEntities?.data) {
          const index = this.allEntities.data.findIndex(
            (t) => t.id === task.id,
          );
          if (index === -1) {
            getLogger().warn(
              "Tâche non trouvée dans allTasks pour l'ID",
              task.id,
            );
          } else {
            // Remplace l'ancienne tâche par la mise à jour
            this.allEntities.data[index] = { ...task };
            this.allEntities.timestamp = Date.now();
          }
        }

        // Retourne la tâche mise à jour pour confirmation
        return { ...task };
      } catch (error) {
        getLogger().error("Erreur lors de la mise à jour de la tâche:", error);
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
        const data = await api.patch<Task[]>(`/tasks/batch`, tasks);

        if (!Array.isArray(data) || !data.every((item) => "id" in item)) {
          throw new Error("API returned invalid format for updated tasks");
        }

        const updatedTasks: Task[] = data as Task[];

        // Mise à jour du cache local pour chaque tâche
        updatedTasks.forEach((task: Task) => {
          const existingTask = this.getTaskById(task.id);
          if (existingTask) {
            this.setTaskCache(task.id, { ...task });
          }

          if (this.allEntities?.data) {
            const index = this.allEntities.data.findIndex(
              (t) => t.id === task.id,
            );
            if (index !== -1) {
              this.allEntities.data[index] = { ...task };
            }
          }
        });

        // Met à jour le timestamp global
        if (this.allEntities) {
          this.allEntities.timestamp = Date.now();
        }
      } catch (error) {
        getLogger().error(
          "Erreur lors de la mise à jour du batch de tâches :",
          error,
        );
        throw error;
      }
    },
  },
});
