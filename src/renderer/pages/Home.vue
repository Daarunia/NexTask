<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Kanban from '../components/Kanban.vue'
import { useTaskStore } from '../stores/Task';
import type { Task } from '../stores/Task';
import { useLogger } from 'vue-logger-plugin'

/**
 * Logger
 */
const logger = useLogger();

/**
 * Liste des tâches
 */
const taskStore = useTaskStore()
const tasks = ref<Task[]>([])

/**
 * Récupération des tâches
 */
onMounted(async () => {
  tasks.value = await taskStore.fetchAllTasks()
  logger.debug("tasks", tasks.value)
})
</script>

<template>
  <div class="h-full">
    <div class="flex justify-center mt-8 h-80">
      <Kanban v-if="tasks.length !== 0" :stages="['A faire', 'En attente', 'En cours', 'Terminé']" :tasks="tasks" />
      <div v-else class="text-gray-400">Chargement des tâches...</div>
    </div>
  </div>
</template>