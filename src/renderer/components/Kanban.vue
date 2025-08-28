<template>
  <div class="flex overflow-x-auto gap-4">
    <!-- Boucle sur les stages / colonnes -->
    <div v-for="stage in stages" :key="stage" class="flex-1 min-w-[250px] rounded-lg p-4 bg-gray-700">
      <h2 class="mx-[3%] mb-[3%]">{{ stage }}</h2>

      <!-- Draggable pour les tâches de cette colonne -->
      <draggable :list="taskLists[stage]" group="tasks" itemKey="id" class="flex flex-col" @end="onTasksDrop">
        <template #item="{ element }">
          <div class="rounded-md p-2 mb-2 shadow-md cursor-move bg-gray-600">
            <strong>{{ element.title }}</strong>
          </div>
        </template>
      </draggable>

      <div>
        <slot :name="`footer-${stage}`"></slot>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useLogger } from 'vue-logger-plugin'
import { useTaskStore } from '../stores/Task'
import type { Task } from '../stores/Task'
import draggable from 'vuedraggable'

/**
 * Props typées
 */
const props = defineProps<{
  stages: string[]
  tasks: Task[]
}>()

/**
 * Logger
 */
const logger = useLogger()

/**
 * Mapping des tâches par stage
 */
const taskLists = ref<Record<string, Task[]>>({})

/**
 * Store des tâches
 */
const taskStore = useTaskStore()

/**
 * Mise à jour des tâches reçues via props
 */
watch(
  () => props.tasks,
  (newTasks) => {
    props.stages.forEach(stage => {
      // On filtre les tâches par stage et on crée la liste réactive
      taskLists.value[stage] = newTasks.filter(t => t.stage === stage)
    })
  },
  { immediate: true, deep: true }
)

/**
 * Mise à jour des positions sur les objets "Task" aprés drag and drop
 */
function onTasksDrop() {
  for (const stage in taskLists.value) {
    taskLists.value[stage].forEach((task, index) => {
      task.position = index
      task.stage = stage
    })
  }

  logger.debug("Liste des tâches aprés DnD", taskLists)
}
</script>