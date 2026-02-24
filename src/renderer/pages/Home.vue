<script setup lang="ts">
import { ref, onMounted } from "vue";
import Kanban from "../components/Kanban.vue";
import { useTaskStore } from "../stores/Task";
import type { Task } from "../types/task.types";
import ProgressSpinner from "primevue/progressspinner";
import { getLogger } from "../utils/logger";
import { useStageStore } from "../stores/Stage";
import { Stage } from "../types/stage.types";

// Logger
const logger = getLogger();

// Liste de stages et de tâches
const stageStore = useStageStore();
const taskStore = useTaskStore();
const tasks = ref<Task[]>([]);
const stages = ref<Stage[]>([]);

// Indicateur de chargement
const loading = ref(true);

// Récupération des tâches
onMounted(async () => {
  loading.value = true;

  await stageStore.loadAllStages(); // Chargement

  stages.value = stageStore.getAllStages;
  tasks.value = taskStore.getAllTasks;
  logger.debug("Stages récupérées : ", stages.value);
  logger.debug("Tâches récupérées : ", tasks.value);

  loading.value = false;
});
</script>

<template>
  <div class="h-screen pt-8">
    <div class="flex justify-center h-4/5">
      <Kanban v-if="!loading" :stages="stages" :tasks="tasks" />
      <ProgressSpinner v-else />
    </div>
  </div>
</template>
