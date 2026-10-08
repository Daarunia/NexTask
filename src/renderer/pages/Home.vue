<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Kanban from '../components/Kanban.vue'
import TagChip from '../components/TagChip.vue'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../types/task.types'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import { useStageStore } from '../stores/Stage'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { Stage } from '../types/stage.types'
import { Tag } from '../types/tag.types'
import { useI18n } from 'vue-i18n'

// Logger
const logger = getLogger()
const showError = useErrorToast()
const { t } = useI18n()

// Liste de stages et de tâches
const stageStore = useStageStore()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const settings = useSettingsStore()
const tasks = ref<Task[]>([])
const stages = ref<Stage[]>([])

// État du chargement du tableau
const status = ref<'loading' | 'error' | 'ready'>('loading')

// Ids des tags du filtre. Remis à zéro au redémarrage, sauf si le paramètre
// « mémoriser le filtre de tags » est activé (relu au chargement du tableau)
const filterTagIds = ref<number[]>([])

/**
 * Tags proposés par le filtre : ceux portés par au moins une tâche active,
 * lus dans le store (réactif) et non dans `tasks`, figé au chargement. Les tags
 * déjà sélectionnés restent proposés même s'ils ne sont plus portés, pour
 * garder leur chip et pouvoir les décocher. Nom et couleur viennent du store
 * Tag, les tags supprimés sont écartés. Tri par nom sans tenir compte de la casse.
 */
const filterOptions = computed<Tag[]>(() => {
  const ids = new Set<number>(filterTagIds.value)

  for (const task of taskStore.getAllTasks) {
    for (const tag of task.tags ?? []) ids.add(tag.id)
  }

  return [...ids]
    .map((id) => tagStore.getTagById(id))
    .filter((tag): tag is Tag => tag !== undefined)
    .sort(compareTagNames)
})

// Un tag supprimé sort du filtre. Un tag qui n'est simplement plus porté reste sélectionné.
watch(
  () => filterTagIds.value.filter((id) => tagStore.getTagById(id) !== undefined),
  (existingIds) => {
    if (existingIds.length === filterTagIds.value.length) return

    logger.debug('Tags supprimés retirés du filtre', { filterTagIds: filterTagIds.value, existingIds })
    filterTagIds.value = existingIds
  },
)

// Filtre mémorisé : chaque changement est enregistré, y compris le retrait d'un tag supprimé
watch(filterTagIds, (ids) => {
  if (!settings.rememberTagFilter || sameIds(ids, settings.tagFilterIds)) return

  settings.set('tagFilterIds', [...ids]).catch(() => showError(t('board.filterNotSaved')))
})

/**
 * Vrai si les deux listes contiennent les mêmes ids, dans le même ordre.
 * @param a Première liste
 * @param b Seconde liste
 */
function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Reprend le filtre mémorisé si le paramètre est activé, sans les tags
 * supprimés depuis (ils sortent aussi du filtre enregistré).
 */
function restoreFilter() {
  if (!settings.rememberTagFilter) return

  filterTagIds.value = settings.tagFilterIds.filter((id) => tagStore.getTagById(id) !== undefined)
  logger.debug('Filtre de tags mémorisé repris', filterTagIds.value)
}

/**
 * Chargement des colonnes et des tâches, et en parallèle des tags pour que les
 * chips des cartes aient leur nom dès le premier affichage.
 * En cas d'échec, un toast prévient l'utilisateur et l'écran propose de réessayer.
 */
async function loadBoard() {
  status.value = 'loading'

  try {
    // Paramètres attendus aussi : ils portent le filtre mémorisé
    await Promise.all([stageStore.loadAllStages(), tagStore.loadAllTags(), settings.whenLoaded()])
  } catch (error) {
    logger.error('Erreur lors du chargement du tableau :', error)
    showError(t('board.loadFailed'), t('board.loadFailedDetail'))
    status.value = 'error'
    return
  }

  stages.value = stageStore.getAllStages
  tasks.value = taskStore.getAllTasks
  logger.debug('Stages récupérées : ', stages.value)
  logger.debug('Tâches récupérées : ', tasks.value)

  restoreFilter()

  status.value = 'ready'
}

onMounted(loadBoard)
</script>

<template>
  <div class="flex h-full flex-col">
    <template v-if="status === 'ready'">
      <!-- Filtre par tag (OU logique) -->
      <div class="mx-8 mt-4 flex shrink-0 flex-wrap items-center gap-3">
        <MultiSelect
          v-model="filterTagIds"
          data-testid="tag-filter"
          :options="filterOptions"
          optionLabel="name"
          optionValue="id"
          display="chip"
          showClear
          :showToggleAll="false"
          :placeholder="t('board.filterPlaceholder')"
          :emptyMessage="t('board.filterEmpty')"
          class="max-w-xl min-w-60"
        >
          <template #chip="{ value }">
            <TagChip :tagId="value" size="small" />
          </template>
          <template #option="{ option }">
            <TagChip :tagId="option.id" size="small" />
          </template>
        </MultiSelect>

        <span v-if="filterTagIds.length" data-testid="filter-dnd-hint" class="filter-hint text-sm">
          {{ t('board.filterDndHint') }}
        </span>
      </div>

      <div class="min-h-0 flex-1">
        <Kanban :stages="stages" :tasks="tasks" :filterTagIds="filterTagIds" />
      </div>
    </template>
    <div
      v-else-if="status === 'error'"
      data-testid="board-load-error"
      class="flex h-full flex-col items-center justify-center gap-4"
    >
      <p>{{ t('board.loadFailedDetail') }}</p>
      <Button :label="t('common.retry')" icon="pi pi-refresh" data-testid="btn-retry-load" @click="loadBoard" />
    </div>
    <div v-else class="flex h-full items-center justify-center">
      <ProgressSpinner />
    </div>
  </div>
</template>

<style scoped>
.filter-hint {
  color: var(--p-text-muted-color);
}
</style>
