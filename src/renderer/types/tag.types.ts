/**
 * Nom d'une couleur de la palette des tags.
 * À garder aligné sur `TAG_COLORS` dans src/main/constants.ts.
 */
export type TagColor = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal' | 'orange' | 'slate'

/**
 * Entité 'Étiquette'
 */
export interface Tag {
  id: number
  name: string
  color: TagColor
  taskCount?: number // nombre de tâches qui portent le tag (renvoyé par les routes /tags uniquement)
}

/**
 * Tag choisi dans le formulaire d'une tâche.
 * Le sélecteur crée les tags immédiatement, il produit donc toujours un
 * `id`. Sans `id` (conservé pour compatibilité), le tag n'existe pas encore :
 * le serveur le créera à l'enregistrement.
 */
export interface TagSelection {
  id?: number
  name: string
}
