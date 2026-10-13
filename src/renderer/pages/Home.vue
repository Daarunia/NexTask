<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Kanban from '../components/Kanban.vue'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../types/task.types'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { useStageStore } from '../stores/Stage'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { useBoardFilterStore } from '../stores/BoardFilter'
import { Stage } from '../types/stage.types'
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

// Filtre du board, partagé avec la barre de recherche de l'en-tête
const boardFilter = useBoardFilterStore()

// Un tag supprimé sort du filtre. Un tag qui n'est simplement plus porté reste sélectionné.
watch(
  () => tagStore.getAllTags,
  () => saveFilter(boardFilter.pruneDeletedTags()),
)

/**
 * Prévient l'utilisateur si le filtre mémorisé n'a pas pu être enregistré.
 * @param save Enregistrement en cours
 */
function saveFilter(save: Promise<void>) {
  save.catch(() => showError(t('board.filterNotSaved')))
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

  saveFilter(boardFilter.restoreTags())

  status.value = 'ready'
}

onMounted(loadBoard)
</script>

<template>
  <div class="flex h-full flex-col">
    <template v-if="status === 'ready'">
      <div class="min-h-0 flex-1">
        <Kanban :stages="stages" :tasks="tasks" />
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
