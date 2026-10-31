<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Kanban from '../components/kanban/Kanban.vue'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../types/task.types'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { useStageStore } from '../stores/Stage'
import { useBoardStore } from '../stores/Board'
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
const boardStore = useBoardStore()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const settings = useSettingsStore()
const tasks = ref<Task[]>([])
const stages = ref<Stage[]>([])
// Tableau passé au Kanban, null tant qu'aucun n'est chargé
const shownBoardId = ref<number | null>(null)

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
 * Chargement des tableaux, des colonnes et des tâches, et en parallèle des
 * tags pour que les chips des cartes aient leur nom dès le premier affichage.
 * En cas d'échec, un toast prévient l'utilisateur et l'écran propose de réessayer.
 */
async function loadBoard() {
  status.value = 'loading'

  try {
    // Paramètres attendus aussi : ils portent le filtre mémorisé
    await Promise.all([
      boardStore.loadAllBoards(),
      stageStore.loadAllStages(),
      tagStore.loadAllTags(),
      settings.whenLoaded(),
    ])
  } catch (error) {
    logger.error('Erreur lors du chargement du tableau :', error)
    showError(t('board.loadFailed'), t('board.loadFailedDetail'))
    status.value = 'error'
    return
  }

  showCurrentBoard()
  saveFilter(boardFilter.restoreTags())

  status.value = 'ready'
}

/**
 * Passe au Kanban les colonnes et les tâches du tableau courant. Instantané du
 * cache, comme avant les tableaux, car le Kanban ne lit ses props qu'au montage
 * et la clé sur l'id du tableau le remonte à chaque changement.
 */
function showCurrentBoard() {
  const board = boardStore.current
  const boardStages = board ? stageStore.getStagesOfBoard(board.id) : []
  const stageIds = new Set(boardStages.map((stage) => stage.id))

  stages.value = boardStages
  tasks.value = taskStore.getAllTasks.filter((task) => stageIds.has(task.stageId))
  shownBoardId.value = board?.id ?? null
  logger.debug(`Tableau ${board?.id} affiché`, { stages: stages.value, tasks: tasks.value })
}

// Changement de tableau (sélecteur, raccourci, tableau supprimé), avant le rendu qui remonte le Kanban
watch(
  () => boardStore.current?.id,
  () => {
    if (status.value === 'ready') showCurrentBoard()
  },
)

onMounted(loadBoard)
</script>

<template>
  <div class="flex h-full flex-col">
    <template v-if="status === 'ready'">
      <div class="min-h-0 flex-1">
        <Kanban
          v-if="shownBoardId !== null"
          :key="shownBoardId"
          :boardId="shownBoardId"
          :stages="stages"
          :tasks="tasks"
        />
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
