import { Tag } from './tag.types'

/**
 * Entité 'Tâches'
 */
export interface Task {
  id: number
  version: string
  description: string
  position: number
  title: string
  isHistorized: boolean
  historizationDate?: Date
  stageId: number
  startDate?: Date | null // date de début de la tâche (null = effacée, envoyée telle quelle au serveur)
  notifiedAt?: Date // date d'envoi du rappel (évite de re-notifier en boucle)
  createdAt?: Date // géré par le serveur (@default(now()))
  updatedAt?: Date // géré par le serveur (@updatedAt)
  // Tags portés, triés par nom (absent d'un cache antérieur aux tags).
  // Ne sert qu'à connaître les ids : nom et couleur s'affichent via le store Tag.
  tags?: Tag[]
}

/**
 * Tâche envoyée au serveur (création ou mise à jour).
 * Les tags sont transmis par leur nom : le serveur réutilise les tags existants
 * (sans tenir compte de la casse) et crée les autres. Sans `tags`, une mise à
 * jour laisse les tags inchangés.
 */
export type TaskInput = Omit<Task, 'id' | 'tags'> & {
  tags?: string[]
}
