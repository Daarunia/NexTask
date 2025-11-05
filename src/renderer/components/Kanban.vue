<template>
  <div class="flex gap-4">
    <!-- Boucle sur les stages / colonnes -->
    <div v-for="stage in stages" :key="stage" class="stages-container">
      <h2 class="mx-[3%] mb-[3%]">{{ stage }}</h2>

      <!-- Draggable pour les tâches de cette colonne -->
      <div class="flex flex-col justify-between flex-1">
        <draggable :list="taskLists[stage]" group="tasks" itemKey="id" class="flex flex-col w-full" @end="onTasksDrop">
          <template #item="{ element }">
            <div class="group draggable-item">
              <strong>{{ element.title }}</strong>
              <Button severity="danger" class="draggable-trash" style="font-size: 1rem" @click="deleteTask(element)"
                aria-label="Supprimer la tâche">
                <i class="pi pi-trash text-white"></i>
              </Button>
            </div>
          </template>
        </draggable>

        <div>
          <Button class="bg-gray-700 w-full" @click="openDialog">Ajouter une tâche</Button>
          <slot :name="`footer-${stage}`"></slot>
        </div>
      </div>
    </div>

     <TaskDialog v-model="showDialog" />
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useLogger } from 'vue-logger-plugin'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../stores/Task'
import draggable from 'vuedraggable'
import TaskDialog from './TaskDialog.vue'

// Props typées
const props = defineProps<{
  stages: string[]
  tasks: Task[]
}>()

// Logger
const logger = useLogger()

const showDialog = ref(false)

/**
 * Mapping des tâches par stage
 */
const taskLists = ref(Object.fromEntries(
  props.stages.map(stage => [stage, props.tasks
    .filter(t => t.stage === stage)
    .map(t => ({ ...t }))
    .sort((a, b) => a.position - b.position)
  ])))

/**
 * Store des tâches
 */
const taskStore = useTaskStore()

/**
 * Etat d'ouverture de la boite de dialogue
 */
const openDialog = () => {
  showDialog.value = true
}

/**
 * Mise à jour des positions sur les objets "Task" aprés drag and drop
 */
async function onTasksDrop() {
  const modifiedTasks: Task[] = []

  for (const stage of props.stages) {
    const originalTasks = props.tasks.filter(t => t.stage === stage)
    const currentTasks = taskLists.value[stage]

    currentTasks.forEach((task, index) => {
      if (!originalTasks.find(t => t.id === task.id && t.position === index && t.stage === stage)) {
        modifiedTasks.push({ ...task, position: index, stage })
      }
    })
  }

  if (modifiedTasks.length) {
    logger.debug("Tâches modifiées après DnD", modifiedTasks)
    await taskStore.updateTaskBatch(modifiedTasks)
  }
}

/**
 * Suppression d'une tâche
 * @param task tâche à supprimer
 */
function deleteTask(task: Task) {
  // Suppression de la tache du store
  taskStore.deleteTask(task.id)

  // Met à jour la liste locale pour refléter la suppression
  for (const stage in taskLists.value) {
    taskLists.value[stage] = taskLists.value[stage].filter(t => t.id !== task.id)
  }

  logger.debug("Suppression de la tâche", task)
}
</script>
<style scoped>
@reference "tailwindcss";

/* Conteneur d’un élément draggable */
.draggable-item {
  @apply flex justify-between items-center rounded-md p-2 mb-2 shadow-md cursor-grab bg-gray-600;
}

/* Icône de suppression affichée au survol */
.draggable-trash {
  @apply cursor-pointer opacity-100 group-hover:opacity-100 transition-opacity duration-200;
}

/* Conteneur des listes */
.stages-container {
  @apply flex flex-col min-w-[250px] max-w-[320px] overflow-x-auto rounded-lg p-4 bg-gray-700
}
</style>