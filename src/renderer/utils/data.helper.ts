import type { DataCounts } from '../../main/shared/data.constants'
import { useStageStore } from '../stores/Stage'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import { t } from '../i18n'

/**
 * Après un import, qui a remplacé toutes les données, vide les caches du
 * tableau (colonnes et tâches, rechargées à l'ouverture du tableau) et des
 * modèles de checklist (rechargés à l'ouverture de leur page ou du dialogue),
 * puis relit les tags. Sans cela, les stores serviraient les anciennes données
 * jusqu'à l'expiration de leur TTL.
 */
export async function reloadDataAfterImport(): Promise<void> {
  useStageStore().$reset()
  useTaskStore().$reset()
  useChecklistTemplateStore().$reset()
  await useTagStore().loadAllTags(true)
}

/**
 * Résumé du nombre d'éléments exportés ou importés. Les tableaux ne sont
 * comptés que s'il y en a plusieurs, un tableau seul n'apprenant rien.
 * @param counts Nombre de tableaux, colonnes, tâches, tags et modèles de checklist
 */
export function describeCounts(counts: DataCounts): string {
  return [
    ...(counts.boards > 1 ? [t('settings.data.counts.boards', { count: counts.boards }, counts.boards)] : []),
    t('settings.data.counts.stages', { count: counts.stages }, counts.stages),
    t('settings.data.counts.tasks', { count: counts.tasks }, counts.tasks),
    t('settings.data.counts.tags', { count: counts.tags }, counts.tags),
    t('settings.data.counts.checklistTemplates', { count: counts.checklistTemplates }, counts.checklistTemplates),
  ].join(', ')
}
