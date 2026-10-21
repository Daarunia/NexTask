import { defineStore } from 'pinia'
import { CACHE_TTL } from '../constants/time.constants'
import type { Board, BoardColumns } from '../types/board.types'
import type { Stage } from '../types/stage.types'
import { BaseEntityState } from '../types/base-store.types'
import type { TagColor } from '../../main/shared/tag.constants'
import { api } from '../utils/api.helper'
import { isCacheValid } from '../utils/cache.helper'
import { getLogger } from '../utils/logger'
import { useSettingsStore } from './Settings'
import { useStageStore } from './Stage'
import { useTaskStore } from './Task'

/**
 * Ordre des tableaux, celui du serveur (position, puis id)
 * @param a Premier tableau
 * @param b Second tableau
 */
function compareBoards(a: Board, b: Board): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Cache des tableaux, et tableau affiché.
 *
 * Les colonnes de chaque tableau restent dans le store Stage (GET /stages
 * renvoie celles de tous les tableaux), filtrées par `getStagesOfBoard`.
 * Même règle que les autres stores, le timestamp est celui du dernier
 * chargement serveur, les mutations ne le rafraîchissent pas.
 */
export const useBoardStore = defineStore('board', {
  state: (): BaseEntityState<Board> & { currentId: number | null } => ({
    allEntities: null,
    ttl: CACHE_TTL,
    // Tableau choisi pendant la session, null tant qu'aucun ne l'a été (cf. current)
    currentId: null,
  }),
  getters: {
    /**
     * Getter pour récupérer tous les tableaux dans leur ordre (sans contrôle du TTL, cf. getAllTasks)
     */
    getAllBoards(state): Board[] {
      return [...(state.allEntities?.data ?? [])].sort(compareBoards)
    },

    /**
     * Tableau affiché. Le tableau choisi s'il existe encore, sinon le dernier
     * affiché (paramètre `lastBoardId`), sinon le premier. Le repli couvre un
     * tableau supprimé, un import et une première ouverture. Null tant que les
     * tableaux ne sont pas chargés.
     */
    current(): Board | null {
      const boards = this.getAllBoards
      const lastBoardId = useSettingsStore().lastBoardId

      return (
        boards.find((board) => board.id === this.currentId) ??
        boards.find((board) => board.id === lastBoardId) ??
        boards[0] ??
        null
      )
    },

    /**
     * Nombre de tâches actives de chaque tableau, depuis le cache des tâches
     */
    taskCounts(): Map<number, number> {
      const counts = new Map<number, number>()
      for (const task of useTaskStore().getAllTasks) {
        if (task.boardId === null || task.boardId === undefined) continue
        counts.set(task.boardId, (counts.get(task.boardId) ?? 0) + 1)
      }
      return counts
    },

    /**
     * Getter pour récupérer le nombre de tâches actives d'un tableau (sélecteur)
     */
    taskCount(): (boardId: number) => number {
      const counts = this.taskCounts
      return (boardId: number) => counts.get(boardId) ?? 0
    },
  },
  actions: {
    setAllBoardsCache(data: Board[]) {
      this.allEntities = { data, timestamp: Date.now() }
    },

    /**
     * Chargement des tableaux
     * @param force Recharge même si le cache est encore valide
     */
    async loadAllBoards(force = false): Promise<void> {
      if (!force && isCacheValid(this.allEntities, this.ttl)) return

      try {
        this.setAllBoardsCache(await api.get<Board[]>(`/boards`))
      } catch (error) {
        getLogger().error('Erreur lors du chargement des tableaux :', error)
        throw error
      }
    },

    /**
     * Change le tableau affiché, puis l'enregistre comme dernier tableau
     * (`lastBoardId`). Un échec de l'enregistrement est logué sans annuler le
     * changement, l'affichage n'a pas à en dépendre.
     * @param id Id du tableau
     * @returns L'enregistrement en cours, qui ne lève jamais
     */
    async select(id: number): Promise<void> {
      this.currentId = id

      const settings = useSettingsStore()
      if (settings.lastBoardId === id) return

      try {
        await settings.set('lastBoardId', id)
      } catch (error) {
        getLogger().error(`Erreur lors de l'enregistrement du dernier tableau ${id} :`, error)
      }
    },

    /**
     * Affiche le tableau d'une tâche, puis demande son ouverture en édition
     * (recherche, clic sur une notification). Une tâche absente du cache est
     * demandée sur le tableau affiché.
     * @param taskId Id de la tâche
     */
    async showTask(taskId: number): Promise<void> {
      const taskStore = useTaskStore()
      const task = taskStore.allEntities?.data.find((t) => t.id === taskId)
      // Tableau de la tâche, sinon celui de sa colonne
      const boardId = task?.boardId ?? useStageStore().getAllStages.find((s) => s.id === task?.stageId)?.boardId

      // Tableau changé avant la demande, l'enregistrement de lastBoardId se poursuit ensuite
      let saving = Promise.resolve()
      if (boardId === null || boardId === undefined) {
        getLogger().warn(`Tableau de la tâche ${taskId} inconnu, ouverture demandée sur le tableau affiché`)
      } else {
        saving = this.select(boardId)
      }

      taskStore.requestOpenTask(taskId)
      await saving
    },

    /**
     * Création d'un tableau, placé en dernier par le serveur. Ses colonnes
     * rejoignent le cache du store Stage, sans tâche.
     * @param name Nom du tableau (nettoyé par le serveur)
     * @param color Couleur de la palette, null sans couleur
     * @param columns Colonnes par défaut, copiées d'un autre tableau ou aucune
     * @returns Le tableau créé
     */
    async createBoard(name: string, color: TagColor | null, columns: BoardColumns): Promise<Board> {
      try {
        const { stages, ...board } = await api.post<Board & { stages: Stage[] }>(`/boards`, { name, color, columns })

        // Sans cache chargé, on laisse le prochain chargement ramener le tableau (cf. saveStage)
        this.allEntities?.data.push(board)
        useStageStore().allEntities?.data.push(...stages)

        getLogger().debug(`Tableau ${board.id} créé avec ${stages.length} colonne(s)`)
        return board
      } catch (error) {
        getLogger().error(`Erreur lors de la création du tableau « ${name} » :`, error)
        throw error
      }
    },

    /**
     * Renomme et/ou recolore un tableau
     * @param id Id du tableau
     * @param changes Nouveau nom et/ou nouvelle couleur
     * @returns Le tableau mis à jour
     */
    async updateBoard(id: number, changes: Partial<Pick<Board, 'name' | 'color'>>): Promise<Board> {
      try {
        const updatedBoard = await api.patch<Board>(`/boards/${id}`, changes)

        const cached = this.allEntities?.data.find((board) => board.id === id)
        if (cached) {
          Object.assign(cached, updatedBoard)
        } else {
          getLogger().warn("Tableau non trouvé dans le cache pour l'ID", id)
        }

        return updatedBoard
      } catch (error) {
        getLogger().error(`Erreur lors de la mise à jour du tableau ${id} :`, error)
        throw error
      }
    },

    /**
     * Renomme un tableau
     * @param id Id du tableau
     * @param name Nouveau nom (nettoyé par le serveur)
     * @returns Le tableau mis à jour
     */
    renameBoard(id: number, name: string): Promise<Board> {
      return this.updateBoard(id, { name })
    },

    /**
     * Change la couleur d'un tableau
     * @param id Id du tableau
     * @param color Couleur de la palette, `null` pour la retirer
     * @returns Le tableau mis à jour
     */
    setBoardColor(id: number, color: TagColor | null): Promise<Board> {
      return this.updateBoard(id, { color })
    },

    /**
     * Change la position de plusieurs tableaux en une requête (glisser-déposer du sélecteur)
     * @param boards Tableaux déplacés et leur nouvelle position
     */
    async reorderBoards(boards: { id: number; position: number }[]): Promise<void> {
      if (!boards.length) return

      let updated: Board[]
      try {
        updated = await api.patch<Board[]>(`/boards/batch`, boards)
      } catch (error) {
        getLogger().error('Erreur lors du réordonnancement des tableaux :', error)
        throw error
      }

      // Mise à jour du cache local, l'ordre se relit par getAllBoards
      for (const board of updated) {
        const cached = this.allEntities?.data.find((b) => b.id === board.id)
        if (cached) cached.position = board.position
      }
    },

    /**
     * Suppression d'un tableau. Le serveur archive ses tâches actives, termine
     * ses séries et supprime ses colonnes. Le cache suit, ses colonnes quittent
     * les colonnes repliées, et le premier tableau restant est affiché s'il
     * était le tableau affiché.
     * @param id Id du tableau
     * @returns Le nombre de tâches archivées
     */
    async deleteBoard(id: number): Promise<number> {
      const logger = getLogger()
      const stageStore = useStageStore()
      const settings = useSettingsStore()

      let archived: number
      try {
        const result = await api.delete<{ message: string; archived: number }>(`/boards/${id}`)
        archived = result.archived
      } catch (error) {
        logger.error(`Erreur lors de la suppression du tableau ${id} :`, error)
        throw error
      }

      const wasCurrent = this.current?.id === id
      const stageIds = new Set(stageStore.getStagesOfBoard(id).map((stage) => stage.id))

      useTaskStore().markBoardTasksArchived(id)
      stageStore.removeBoardStages(id)
      if (this.allEntities) {
        this.allEntities.data = this.allEntities.data.filter((board) => board.id !== id)
      }

      // Colonnes disparues, inutile de les garder repliées
      const collapsed = settings.collapsedStageIds.filter((stageId) => !stageIds.has(stageId))
      if (collapsed.length !== settings.collapsedStageIds.length) {
        try {
          await settings.set('collapsedStageIds', collapsed)
        } catch (error) {
          logger.error(`Erreur lors de l'oubli des colonnes repliées du tableau ${id} :`, error)
        }
      }

      const first = this.getAllBoards[0]
      if (wasCurrent && first) await this.select(first.id)

      logger.debug(`Tableau ${id} supprimé, ${archived} tâche(s) archivée(s)`)
      return archived
    },
  },
})
