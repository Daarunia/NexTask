import { Tag } from './tag.types'
import type { TaskChecklist } from './checklist.types'
import type { RecurrenceInput, RecurrenceSummary } from '../../main/shared/recurrence.constants'
import type { ChecklistItemInput } from '../../main/shared/checklist.constants'

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
  // Tableau de la tâche, écrit par le serveur seul depuis sa colonne et gardé à
  // l'archivage. Null pour une archive dont le tableau a été supprimé, absent
  // d'un cache antérieur aux tableaux.
  boardId?: number | null
  startDate?: Date | null // date de début de la tâche (null = effacée, envoyée telle quelle au serveur)
  notifiedAt?: Date // date d'envoi du rappel (évite de re-notifier en boucle)
  createdAt?: Date // géré par le serveur (@default(now()))
  updatedAt?: Date // géré par le serveur (@updatedAt)
  // Tags portés, triés par nom (absent d'un cache antérieur aux tags).
  // Ne sert qu'à connaître les ids : nom et couleur s'affichent via le store Tag.
  tags?: Tag[]
  // Série dont la tâche est une occurrence (null hors série), et date prévue de celle-ci
  recurrenceId?: number | null
  occurrenceDate?: Date | string | null
  // Résumé de la série. L'état le plus récent est dans le store Task (cf. getRecurrence).
  recurrence?: RecurrenceSummary | null
  // Checklist et ses points dans l'ordre (null pour une tâche sans point, absente d'un cache antérieur)
  checklist?: TaskChecklist | null
}

/**
 * Tâche envoyée au serveur (création ou mise à jour).
 * Les tags sont transmis par leur nom : le serveur réutilise les tags existants
 * (sans tenir compte de la casse) et crée les autres. Sans `tags`, une mise à
 * jour laisse les tags inchangés.
 *
 * Répétition : `recurrence` absent laisse la série inchangée, un objet la crée
 * ou modifie sa règle, `null` l'arrête. `applyToSeries` reporte le contenu
 * modifié sur les prochaines occurrences (mise à jour seulement, vrai par défaut).
 *
 * Checklist : `checklistItems` absent la laisse inchangée, `[]` la vide, une
 * liste la remplace dans cet ordre (points sans `id` créés). La tâche renvoyée
 * porte `checklist` avec les ids des points créés.
 *
 * Sans `boardId`, que le serveur déduit seul de la colonne.
 */
export type TaskInput = Omit<
  Task,
  'id' | 'tags' | 'recurrenceId' | 'occurrenceDate' | 'recurrence' | 'checklist' | 'boardId'
> & {
  tags?: string[]
  checklistItems?: ChecklistItemInput[]
  recurrence?: RecurrenceInput | null
  applyToSeries?: boolean
}

/**
 * Tâche modifiée depuis le formulaire. Sans position : la place d'une carte ne
 * change que par le DnD (PATCH /tasks/batch), qui renumérote la colonne.
 */
export type TaskUpdateInput = Omit<TaskInput, 'position'> & Pick<Task, 'id'>
