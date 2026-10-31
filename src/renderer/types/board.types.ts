import type { TagColor } from '../../main/shared/tag.constants'
import type { BoardColumnsMode } from '../../main/shared/board.constants'

/**
 * Entité 'Tableau', qui regroupe des colonnes et leurs tâches. Ses colonnes
 * se lisent dans le store Stage par `Stage.boardId`.
 */
export interface Board {
  id: number
  name: string
  color: TagColor | null // couleur de la palette des tags, null sans couleur
  position: number // ordre dans le sélecteur et des raccourcis Ctrl+1 à Ctrl+9
}

/**
 * Colonnes d'un nouveau tableau (POST /boards). `fromBoardId`, le tableau
 * dont les colonnes sont copiées, est requis en mode `copy`.
 */
export interface BoardColumns {
  mode: BoardColumnsMode
  fromBoardId?: number
}
