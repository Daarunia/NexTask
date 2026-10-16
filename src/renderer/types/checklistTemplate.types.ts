import type { ChecklistItem } from './checklist.types'

/**
 * Entité 'Modèle de checklist' (une `Checklist` sans tâche). Ses points sont
 * copiés dans une tâche à l'application, sans lien gardé.
 */
export interface ChecklistTemplate {
  id: number
  name: string
  position: number // ordre dans la page Checklists et dans le menu du dialogue de tâche
  items: ChecklistItem[] // dans l'ordre, jamais cochés dans un modèle
}

/** Modification envoyée par `PATCH /checklist-templates/:id`, au moins un champ. */
export interface ChecklistTemplateChanges {
  name?: string
  items?: string[] // textes des points, dans l'ordre, qui remplacent tous les anciens
}
