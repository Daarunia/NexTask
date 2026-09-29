<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Kanban from '../components/Kanban.vue'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../types/task.types'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { useStageStore } from '../stores/Stage'
import { Stage } from '../types/stage.types'

// Logger
const logger = getLogger()
const showError = useErrorToast()

// Liste de stages et de tâches
const stageStore = useStageStore()
const taskStore = useTaskStore()
const tasks = ref<Task[]>([])
const stages = ref<Stage[]>([])

// État du chargement du tableau
const status = ref<'loading' | 'error' | 'ready'>('loading')

/**
 * Chargement des colonnes et des tâches.
 * En cas d'échec, un toast prévient l'utilisateur et l'écran propose de réessayer.
 */
async function loadBoard() {
  status.value = 'loading'

  try {
    await stageStore.loadAllStages()
  } catch (error) {
    logger.error('Erreur lors du chargement du tableau :', error)
    showError('Chargement impossible', "Le tableau n'a pas pu être chargé.")
    status.value = 'error'
    return
  }

  stages.value = stageStore.getAllStages
  tasks.value = taskStore.getAllTasks
  logger.debug('Stages récupérées : ', stages.value)
  logger.debug('Tâches récupérées : ', tasks.value)

  status.value = 'ready'
}

onMounted(loadBoard)
</script>

<template>
  <div class="h-full">
    <Kanban v-if="status === 'ready'" :stages="stages" :tasks="tasks" />
    <div
      v-else-if="status === 'error'"
      data-testid="board-load-error"
      class="flex h-full flex-col items-center justify-center gap-4"
    >
      <p>Le tableau n'a pas pu être chargé.</p>
      <Button label="Réessayer" icon="pi pi-refresh" data-testid="btn-retry-load" @click="loadBoard" />
    </div>
    <div v-else class="flex h-full items-center justify-center">
      <ProgressSpinner />
    </div>
  </div>
</template>
