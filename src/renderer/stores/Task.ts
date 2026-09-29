import { defineStore } from 'pinia'
import { MINUTE } from '../constants/time.constants'
import { Task, TaskInput } from '../types/task.types'
import { Tag } from '../types/tag.types'
import { BaseEntityState } from '../types/base-store.types'
import { api } from '../utils/api.helper'
import { getLogger } from '../utils/logger'
import { compareTagNames } from '../utils/tag.helper'

/**
 * Cache des tâches.
 *
 * Rempli par `useStageStore().loadAllStages()` (GET /stages renvoie les tâches
 * avec leurs colonnes). Le timestamp est celui du dernier chargement serveur :
 * les mutations mettent les données à jour sans le rafraîchir, le TTL ne sert
 * qu'à décider d'un rechargement.
 */
export const useTaskStore = defineStore('task', {
  state: (): BaseEntityState<Task> => ({
    allEntities: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
  }),
  getters: {
    /**
     * Getter pour récupérer toutes les tâches non historisées.
     * Pas de contrôle du TTL ici : l'app est seule à écrire dans sa base, le
     * cache reste donc juste tant que les mutations passent par ce store.
     */
    getAllTasks(state): Task[] {
      return state.allEntities?.data.filter((task) => !task.isHistorized) ?? []
    },
  },
  actions: {
    setAllTasksCache(data: Task[]) {
      this.allEntities = { data, timestamp: Date.now() }
    },

    /**
     * Applique une modification à une tâche du cache, si elle y est
     * @param id ID de la tâche
     * @param changes Champs à remplacer
     */
    patchCachedTask(id: number, changes: Partial<Task>) {
      if (!this.allEntities) return

      const index = this.allEntities.data.findIndex((task) => task.id === id)
      if (index === -1) {
        getLogger().warn("Tâche non trouvée dans le cache pour l'ID", id)
        return
      }

      this.allEntities.data[index] = { ...this.allEntities.data[index], ...changes }
    },

    /**
     * Marque une tâche comme historisée par ID
     */
    async archiveTask(id: number): Promise<void> {
      try {
        await api.put(`/tasks/${id}`, {})
        this.patchCachedTask(id, { isHistorized: true, historizationDate: new Date() })
      } catch (error) {
        getLogger().error(`Erreur lors de l’archivage de la tâche ${id}:`, error)
        throw error
      }
    },

    /**
     * Historise dans le cache les tâches d'une colonne supprimée
     * (l'archivage est déjà fait côté serveur par DELETE /stages/:id)
     * @param stageId ID de la colonne supprimée
     */
    markStageTasksArchived(stageId: number) {
      if (!this.allEntities) return

      const now = new Date()

      this.allEntities.data = this.allEntities.data.map((task) => {
        if (task.stageId !== stageId || task.isHistorized) return task
        return { ...task, isHistorized: true, historizationDate: now }
      })
    },

    /**
     * Supprime une tâche par ID
     * @param id ID de la tâche
     */
    async deleteTask(id: number): Promise<void> {
      try {
        await api.delete(`/tasks/${id}`)

        if (this.allEntities) {
          this.allEntities.data = this.allEntities.data.filter((task) => task.id !== id)
        }
      } catch (error) {
        getLogger().error(`Erreur lors de la suppression de la tâche ${id}:`, error)
        throw error
      }
    },

    /**
     * Création d'une tâche
     * @param task Tâche à créer (tags par nom)
     * @returns La tâche créée, telle que renvoyée par le serveur (tags résolus)
     */
    async saveTask(task: TaskInput): Promise<Task> {
      try {
        const newTask = await api.post<Task>(`/tasks`, task)

        // Sans cache chargé, rien à compléter : le prochain chargement ramènera la tâche.
        // En créer un avec cette seule tâche le ferait passer pour la liste complète.
        this.allEntities?.data.push(newTask)

        return newTask
      } catch (error) {
        getLogger().error('Erreur lors de la sauvegarde de la tâche : ', error)
        throw error
      }
    },

    /**
     * Mise à jour complète d'une tâche
     * @param task Tâche avec un id existant (tags par nom, absents = inchangés)
     * @returns La tâche mise à jour, telle que renvoyée par le serveur (seule à
     *   contenir les tags résolus), ou une erreur si la mise à jour échoue
     */
    async updateTask(task: TaskInput & Pick<Task, 'id'>): Promise<Task> {
      const { id, ...payload } = task

      try {
        const updatedTask = await api.patch<Task>(`/tasks/${id}`, payload)
        this.patchCachedTask(id, updatedTask)

        return updatedTask
      } catch (error) {
        getLogger().error('Erreur lors de la mise à jour de la tâche:', error)
        throw new Error(`Erreur de mise à jour pour la tâche ID ${task.id}: ${error}`)
      }
    },

    /**
     * Répercute l'édition d'un tag (nom, couleur) sur les tâches du cache qui le portent
     * @param tag Tag mis à jour
     */
    patchTagInTasks(tag: Tag) {
      if (!this.allEntities) return

      // Le compteur de tâches n'a pas de sens dans les tags d'une tâche
      const { taskCount: _taskCount, ...taskTag } = tag

      this.allEntities.data = this.allEntities.data.map((task) => {
        if (!task.tags?.some((t) => t.id === tag.id)) return task

        const tags = task.tags.map((t) => (t.id === tag.id ? taskTag : t)).sort(compareTagNames)
        return { ...task, tags }
      })
    },

    /**
     * Retire un tag supprimé des tâches du cache (le serveur l'a déjà retiré en base)
     * @param tagId ID du tag supprimé
     */
    removeTagFromTasks(tagId: number) {
      if (!this.allEntities) return

      this.allEntities.data = this.allEntities.data.map((task) => {
        if (!task.tags?.some((t) => t.id === tagId)) return task
        return { ...task, tags: task.tags.filter((t) => t.id !== tagId) }
      })
    },

    /**
     * Mise à jour partielle d'un ensemble de tâches
     * @param tasks Tableau de tâches existantes (id requis, seuls les champs fournis sont modifiés).
     *   Les tags ne passent pas par ce batch : l'API les refuse.
     */
    async updateTaskBatch(tasks: Array<Pick<Task, 'id'> & Partial<Omit<Task, 'tags'>>>): Promise<void> {
      if (!tasks.length) return

      try {
        const data = await api.patch<Task[]>(`/tasks/batch`, tasks)

        if (!Array.isArray(data) || !data.every((item) => 'id' in item)) {
          throw new Error('API returned invalid format for updated tasks')
        }

        // Le serveur renvoie les tâches complètes : elles remplacent celles du cache
        data.forEach((task) => this.patchCachedTask(task.id, task))
      } catch (error) {
        getLogger().error('Erreur lors de la mise à jour du batch de tâches :', error)
        throw error
      }
    },
  },
})
