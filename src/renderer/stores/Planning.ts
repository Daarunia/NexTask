import { defineStore } from 'pinia'
import { useBoardStore } from './Board'

/**
 * État de session de la vue Planning, gardé d'un aller-retour à l'autre avec le
 * Kanban mais jamais enregistré : le lancement suivant repart sur aujourd'hui et
 * sur tous les tableaux, une tâche ne reste donc pas masquée sans qu'on s'en souvienne.
 *
 * Le filtre par tableau est distinct du tableau courant du Kanban (store Board)
 * et du filtre de l'en-tête (store BoardFilter), que le Kanban applique aussi.
 */
export const usePlanningStore = defineStore('planning', {
  state: () => ({
    // Jour affiché, null avant le premier affichage
    anchor: null as Date | null,
    // Tableaux sélectionnés, aucun pour tous
    boardIds: [] as number[],
  }),

  actions: {
    /**
     * Filtre sur un seul tableau, ou revient à tous s'il est déjà seul sélectionné.
     * @param boardId Id du tableau
     */
    toggleOnlyBoard(boardId: number) {
      const alone = this.boardIds.length === 1 && this.boardIds[0] === boardId
      this.boardIds = alone ? [] : [boardId]
    },

    /**
     * Retire du filtre les tableaux supprimés.
     */
    pruneDeletedBoards() {
      const existing = new Set(useBoardStore().getAllBoards.map((board) => board.id))
      const kept = this.boardIds.filter((id) => existing.has(id))
      if (kept.length !== this.boardIds.length) this.boardIds = kept
    },
  },
})
