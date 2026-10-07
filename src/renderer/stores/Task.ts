import { defineStore } from 'pinia'
import { CACHE_TTL } from '../constants/time.constants'
import { Task, TaskInput, TaskUpdateInput } from '../types/task.types'
import { Tag } from '../types/tag.types'
import { BaseEntityState } from '../types/base-store.types'
import type { RecurrenceListItem, RecurrenceStatus, RecurrenceSummary } from '../../main/shared/recurrence.constants'
import { api } from '../utils/api.helper'
import { getLogger } from '../utils/logger'
import { compareTagNames } from '../utils/tag.helper'

/**
 * Restauration d'une tâche archivée : la tâche remise au tableau, et
 * l'occurrence retirée avec l'annulation de son archivage (série « après
 * archivage » dont l'occurrence suivante, née de cet archivage, n'avait pas
 * été modifiée), avec ses tags tels qu'en cache.
 */
export interface RestoreResult {
  task: Task
  removed: Pick<Task, 'id' | 'tags'> | null
}

/**
 * Cache des tâches.
 *
 * Rempli par `useStageStore().loadAllStages()` (GET /stages renvoie les tâches
 * avec leurs colonnes). Le timestamp est celui du dernier chargement serveur :
 * les mutations mettent les données à jour sans le rafraîchir, le TTL ne sert
 * qu'à décider d'un rechargement.
 *
 * Les séries récurrentes sont gardées à part, par id, dans leur dernier état
 * reçu : une série arrêtée depuis l'une de ses occurrences change ainsi
 * l'affichage de toutes les autres (cf. getRecurrence).
 */
export const useTaskStore = defineStore('task', {
  state: (): BaseEntityState<Task> & {
    recurrences: Record<number, RecurrenceSummary>
    taskToOpen: number | null
  } => ({
    allEntities: null,
    ttl: CACHE_TTL,
    recurrences: {},
    // Tâche à ouvrir en édition au tableau (clic sur sa notification), cf. Kanban
    taskToOpen: null,
  }),
  getters: {
    /**
     * Dernier état connu d'une série, ou `undefined`
     */
    getRecurrence(state) {
      return (id: number | null | undefined): RecurrenceSummary | undefined =>
        id === null || id === undefined ? undefined : state.recurrences[id]
    },

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
    /**
     * Demande l'ouverture d'une tâche en édition, faite par le tableau dès qu'il est affiché
     * @param id Id de la tâche
     */
    requestOpenTask(id: number) {
      this.taskToOpen = id
    },

    setAllTasksCache(data: Task[]) {
      this.allEntities = { data, timestamp: Date.now() }
      this.rememberRecurrences(data)
    },

    /**
     * Garde le résumé des séries de tâches reçues du serveur (dernier reçu = le plus récent)
     * @param tasks Tâches reçues
     */
    rememberRecurrences(tasks: Task[]) {
      for (const task of tasks) {
        if (task.recurrence) this.recurrences[task.recurrence.id] = task.recurrence
      }
    },

    /**
     * Charge toutes les séries (liste des Paramètres), et garde leur résumé :
     * les cartes et la liste lisent ensuite le même état (cf. getRecurrence)
     * @returns Les séries, en cours puis terminées, avec le titre de leur modèle
     */
    async loadRecurrences(): Promise<RecurrenceListItem[]> {
      try {
        const series = await api.get<RecurrenceListItem[]>('/recurrences')
        for (const { title: _title, ...summary } of series) this.recurrences[summary.id] = summary
        return series
      } catch (error) {
        getLogger().error('Erreur lors du chargement des séries récurrentes :', error)
        throw error
      }
    },

    /**
     * Change l'état d'une série (pause, reprise ou réactivation sans rattrapage, arrêt)
     * @param id Id de la série
     * @param status Nouvel état
     * @returns Le résumé de la série, à jour
     */
    async updateRecurrenceStatus(id: number, status: RecurrenceStatus): Promise<RecurrenceSummary> {
      try {
        const summary = await api.patch<RecurrenceSummary>(`/recurrences/${id}`, { status })
        this.recurrences[id] = summary
        return summary
      } catch (error) {
        getLogger().error(`Erreur lors du changement d'état de la série ${id} :`, error)
        throw error
      }
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
     * Tâches archivées, de la plus récemment archivée à la plus ancienne.
     * Lues à chaque appel, sans cache : elles ne s'affichent que sur la page
     * des archives, et GET /stages (qui remplit le cache) ne les renvoie pas.
     */
    async loadArchivedTasks(): Promise<Task[]> {
      try {
        const tasks = await api.get<Task[]>(`/tasks`, { params: { isHistorized: true } })
        this.rememberRecurrences(tasks)
        return tasks
      } catch (error) {
        getLogger().error('Erreur lors du chargement des tâches archivées :', error)
        throw error
      }
    },

    /**
     * Restaure une tâche archivée, puis l'ajoute au cache du tableau. L'occurrence
     * née de son archivage, retirée par le serveur, quitte aussi le cache.
     * @param id ID de la tâche
     * @param place Colonne et position à reprendre (annulation d'un archivage).
     *   Sans place, ou si la colonne n'existe plus, le serveur la met en bas de
     *   la première colonne.
     * @returns La tâche restaurée (avec sa colonne et sa position), et l'occurrence retirée
     */
    async restoreTask(id: number, place?: { stageId: number; position: number }): Promise<RestoreResult> {
      try {
        const { removedOccurrenceId, ...restored } = await api.post<Task & { removedOccurrenceId?: number | null }>(
          `/tasks/${id}/restore`,
          undefined,
          { params: place },
        )
        this.insertCachedTask(restored)

        let removed: RestoreResult['removed'] = null
        if (removedOccurrenceId) removed = this.removeCachedTask(removedOccurrenceId) ?? { id: removedOccurrenceId }
        return { task: restored, removed }
      } catch (error) {
        getLogger().error(`Erreur lors de la restauration de la tâche ${id} :`, error)
        throw error
      }
    },

    /**
     * Retire une tâche du cache (supprimée côté serveur)
     * @param id ID de la tâche
     * @returns La tâche retirée, ou `undefined` si elle n'était pas en cache
     */
    removeCachedTask(id: number): Task | undefined {
      if (!this.allEntities) return undefined

      const removed = this.allEntities.data.find((task) => task.id === id)
      this.allEntities.data = this.allEntities.data.filter((task) => task.id !== id)
      return removed
    },

    /**
     * Ajoute au cache une tâche placée au tableau par le serveur (restauration,
     * ajout rapide, occurrence d'une tâche récurrente). Comme côté serveur, les
     * autres tâches actives de sa colonne, à sa position ou après, descendent
     * d'un cran. Sans cache chargé, rien à faire : le prochain chargement la ramènera.
     * @param inserted Tâche telle que renvoyée par le serveur
     */
    insertCachedTask(inserted: Task) {
      this.rememberRecurrences([inserted])
      if (!this.allEntities) return

      const data = this.allEntities.data.map((task) =>
        task.id !== inserted.id &&
        task.stageId === inserted.stageId &&
        !task.isHistorized &&
        task.position >= inserted.position
          ? { ...task, position: task.position + 1 }
          : task,
      )

      // Archivée pendant la session, elle est encore dans le cache : on la remplace
      const index = data.findIndex((task) => task.id === inserted.id)
      if (index === -1) {
        data.push(inserted)
      } else {
        data[index] = inserted
      }

      this.allEntities.data = data
    },

    /**
     * Crée une tâche depuis la fenêtre d'ajout rapide : version et place
     * (haut ou bas de la colonne) sont choisies par le serveur selon les paramètres
     * @param title Titre de la tâche
     * @param stageId Colonne (la première si elle n'existe plus)
     * @returns La tâche créée
     */
    async quickAddTask(title: string, stageId?: number): Promise<Task> {
      try {
        const task = await api.post<Task>(`/tasks/quick-add`, { title, stageId })
        this.insertCachedTask(task)
        return task
      } catch (error) {
        getLogger().error("Erreur lors de l'ajout rapide d'une tâche :", error)
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
        this.removeCachedTask(id)
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
        this.rememberRecurrences([newTask])

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
    async updateTask(task: TaskUpdateInput): Promise<Task> {
      const { id, ...payload } = task

      try {
        const updatedTask = await api.patch<Task>(`/tasks/${id}`, payload)
        this.patchCachedTask(id, updatedTask)
        this.rememberRecurrences([updatedTask])

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
    /**
     * Remplace les tags d'une tâche (retrait direct depuis une carte)
     * @param id Id de la tâche
     * @param tagNames Noms des tags à garder
     * @returns La tâche mise à jour, avec ses tags résolus
     */
    async updateTaskTags(id: number, tagNames: string[]): Promise<Task> {
      try {
        const updatedTask = await api.patch<Task>(`/tasks/${id}`, { tags: tagNames })
        this.patchCachedTask(id, { tags: updatedTask.tags })

        return updatedTask
      } catch (error) {
        getLogger().error(`Erreur lors de la mise à jour des tags de la tâche ${id} :`, error)
        throw error
      }
    },

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
