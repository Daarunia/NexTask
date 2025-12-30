<script setup lang="ts">
import { ref, onMounted } from "vue";
import Kanban from "../components/Kanban.vue";
import { useTaskStore } from "../stores/Task";
import type { Task } from "../stores/Task";
import { useLogger } from "vue-logger-plugin";
import ProgressSpinner from "primevue/progressspinner";

// Logger
const logger = useLogger();

// Liste des tâches
const taskStore = useTaskStore();
const tasks = ref<Task[]>([]);

// Indicateur de chargement
const loading = ref(true);

// Récupération des tâches
onMounted(async () => {
  loading.value = true;

  await taskStore.loadAllTasks(); // Chargement

  tasks.value = taskStore.getAllTasks;
  logger.debug("Tâches récupérées : ", tasks.value);

  loading.value = false;
});
</script>

<template>
  <div class="h-screen pt-8">
    <div class="flex justify-center h-4/5">
      <Kanban
        v-if="!loading"
        :stages="['A faire', 'En attente', 'En cours', 'Terminé']"
        :tasks="tasks"
      />
      <ProgressSpinner v-else />
    </div>
  </div>
</template>
