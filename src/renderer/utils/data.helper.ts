import type { DataCounts } from '../../main/shared/data.constants'
import { useBoardStore } from '../stores/Board'
import { useStageStore } from '../stores/Stage'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import { useSettingsStore } from '../stores/Settings'
import { getLogger } from './logger'
import { t } from '../i18n'

/**
 * Après un import, qui a remplacé toutes les données, vide les caches des
 * tableaux, des colonnes et des tâches (rechargés à l'ouverture du Kanban) et
 * des modèles de checklist (rechargés à l'ouverture de leur page ou du
 * dialogue), puis relit les tags. Sans cela, les stores serviraient les
 * anciennes données jusqu'à l'expiration de leur TTL. Le tableau choisi est
 * oublié avec le cache, et `lastBoardId` remis à null, son id pouvant désigner
 * un autre tableau dans les données importées : le Kanban affiche le premier
 * tableau. Un échec de l'enregistrement de `lastBoardId` est logué sans
 * interrompre le rechargement.
 */
export async function reloadDataAfterImport(): Promise<void> {
  useBoardStore().$reset()
  useStageStore().$reset()
  useTaskStore().$reset()
  useChecklistTemplateStore().$reset()

  try {
    await useSettingsStore().set('lastBoardId', null)
  } catch (error) {
    getLogger().error("Erreur lors de l'oubli du dernier tableau après l'import :", error)
  }

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
