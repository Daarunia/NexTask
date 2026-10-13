/**
 * Point de la checklist d'une tâche, trié par `position` dans les réponses
 */
export interface ChecklistItem {
  id: number
  text: string
  position: number
  isChecked: boolean
  checkedAt: Date | string | null // fixée par le serveur au moment où le point est coché
}

/**
 * Checklist d'une tâche (`task.checklist`), absente ou null quand la tâche n'a aucun point
 */
export interface TaskChecklist {
  id: number
  items: ChecklistItem[]
}
