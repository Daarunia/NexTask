import { Tag } from './tag.types'
import type { RecurrenceInput, RecurrenceSummary } from '../../main/shared/recurrence.constants'

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
  // Série dont la tâche est une occurrence (null hors série), et date prévue de celle-ci
  recurrenceId?: number | null
  occurrenceDate?: Date | string | null
  // Résumé de la série. L'état le plus récent est dans le store Task (cf. getRecurrence).
  recurrence?: RecurrenceSummary | null
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
 */
export type TaskInput = Omit<Task, 'id' | 'tags' | 'recurrenceId' | 'occurrenceDate' | 'recurrence'> & {
  tags?: string[]
  recurrence?: RecurrenceInput | null
  applyToSeries?: boolean
}

/**
 * Tâche modifiée depuis le formulaire. Sans position : la place d'une carte ne
 * change que par le DnD (PATCH /tasks/batch), qui renumérote la colonne.
 */
export type TaskUpdateInput = Omit<TaskInput, 'position'> & Pick<Task, 'id'>
