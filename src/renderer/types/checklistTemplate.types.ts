/**
 * Point d'un modèle de checklist, tel que renvoyé par les routes
 * `/checklist-templates`. Toujours décoché dans un modèle.
 */
export interface ChecklistTemplateItem {
  id: number
  text: string
  position: number
  isChecked: boolean
  checkedAt: string | null
}

/**
 * Entité 'Modèle de checklist' (une `Checklist` sans tâche). Ses points sont
 * copiés dans une tâche à l'application, sans lien gardé.
 */
export interface ChecklistTemplate {
  id: number
  name: string
  position: number // ordre dans la page Checklists et dans le menu du dialogue de tâche
  items: ChecklistTemplateItem[] // dans l'ordre
}

/** Modification envoyée par `PATCH /checklist-templates/:id`, au moins un champ. */
export interface ChecklistTemplateChanges {
  name?: string
  items?: string[] // textes des points, dans l'ordre, qui remplacent tous les anciens
}
