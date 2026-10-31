import { Task } from './task.types'
import type { TagColor } from '../../main/shared/tag.constants'

/**
 * Entité 'Stage'
 */
export interface Stage {
  id: number
  name: string
  position: number
  color?: TagColor | null // couleur de la palette des tags, null sans couleur
  boardId: number // tableau de la colonne, qui donne aussi celui de ses tâches
  tasks: Task[]
}
