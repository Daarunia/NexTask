import type { DataCounts } from '../../main/shared/data.constants'
import { useStageStore } from '../stores/Stage'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'

/**
 * Après un import, qui a remplacé toutes les données : vide les caches du
 * tableau (colonnes et tâches, rechargées à l'ouverture du tableau) et relit
 * les tags. Sans cela, les stores serviraient les anciennes données jusqu'à
 * l'expiration de leur TTL.
 */
export async function reloadDataAfterImport(): Promise<void> {
  useStageStore().$reset()
  useTaskStore().$reset()
  await useTagStore().loadAllTags(true)
}

/**
 * Résumé du nombre d'éléments exportés ou importés.
 * @param counts Nombre de colonnes, tâches et tags
 */
export function describeCounts(counts: DataCounts): string {
  const plural = (count: number, singular: string, several: string) => `${count} ${count === 1 ? singular : several}`
  return [
    plural(counts.stages, 'colonne', 'colonnes'),
    plural(counts.tasks, 'tâche', 'tâches'),
    plural(counts.tags, 'tag', 'tags'),
  ].join(', ')
}
