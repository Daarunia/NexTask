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
  dueDate?: Date // date à laquelle la tâche doit être réalisée
  notifiedAt?: Date // date d'envoi du rappel (évite de re-notifier en boucle)
  createdAt?: Date // géré par le serveur (@default(now()))
  updatedAt?: Date // géré par le serveur (@updatedAt)
}
