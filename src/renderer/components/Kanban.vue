<template>
  <div class="flex gap-4">
    <!-- Colonnes -->
    <div v-for="stage in stages" :key="stage.id" class="stages-container">
      <h2 class="mx-[3%] mb-[3%]">{{ stage.name }}</h2>

      <div class="flex flex-col justify-between flex-1">
        <!-- Draggable pour les tâches de cette colonne -->
        <draggable
          :list="taskLists.get(stage.id)"
          group="tasks"
          itemKey="id"
          class="flex flex-col w-full"
          @end="onTasksDrop"
        >
          <template #item="{ element }">
            <div class="group draggable-item">
              <strong>{{ element.title }}</strong>

              <div class="opacity-0 group-hover:opacity-100 h-6 flex gap-2">
                <Button
                  severity="primary"
                  class="draggable-button"
                  @click="openEditTaskDialog(stage.id, element)"
                >
                  <i class="pi pi-pencil text-white"></i>
                </Button>

                <Button
                  severity="danger"
                  class="draggable-button"
                  @click="archiveTask(element)"
                >
                  <i class="pi pi-trash text-white"></i>
                </Button>
              </div>
            </div>
          </template>
        </draggable>

        <!-- Ajouter tâche -->
        <Button
          class="btn-edit-task mt-3"
          @click="openCreateTaskDialog(stage.id)"
        >
          <i class="pi pi-plus absolute left-3 text-white"></i>
          <span>Ajouter une tâche</span>
        </Button>
      </div>
    </div>

    <!-- Dialog -->
    <TaskDialog
      v-model="showDialog"
      :stageId="stageDialog ?? 0"
      :editTask="editTask"
      :position="positionDialog"
      :creationMode="creationMode"
      @task-saved="onTaskSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import Button from "primevue/button";

import TaskDialog from "./TaskDialog.vue";
import { useTaskStore } from "../stores/Task";
import { Task } from "../types/task.types";
import { Stage } from "../types/stage.types";
import { getLogger } from "../utils/logger";

const props = defineProps<{
  stages: Stage[];
  tasks: Task[];
}>();

const logger = getLogger();
const taskStore = useTaskStore();

const showDialog = ref(false);
const stageDialog = ref<number | null>(null);
const positionDialog = ref(0);
const editTask = ref<Task | null>(null);
const creationMode = ref(true);

const taskLists = ref<Map<number, Task[]>>(new Map());

/* ============================
   Initialisation & Sync
============================ */

function buildTaskLists() {
  const map = new Map<number, Task[]>();

  for (const stage of props.stages) {
    map.set(
      stage.id,
      props.tasks
        .filter((t) => t.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...t })),
    );
  }

  taskLists.value = map;
}

// Build initial
buildTaskLists();

// Rebuild si tasks changent
watch(
  () => props.tasks,
  () => buildTaskLists(),
  { deep: true },
);

/**
 * Ouverture de la boite de dialogue en mode création
 * @param stageId Id de la colonne parent
 */
function openCreateTaskDialog(stageId: number) {
  logger.debug("Ouverture création", { stageId });

  stageDialog.value = stageId;
  positionDialog.value = taskLists.value.get(stageId)?.length ?? 0;
  editTask.value = null;
  creationMode.value = true;
  showDialog.value = true;
}

/**
 * Ouverture de la boite de dialogue en mode édition
 * @param stageId Id de la colonne parent
 */
function openEditTaskDialog(stageId: number, task: Task) {
  logger.debug("Ouverture édition", { stageId, task });

  stageDialog.value = stageId;
  positionDialog.value = task.position;
  editTask.value = task;
  creationMode.value = false;
  showDialog.value = true;
}

/**
 * Listener quand une tâche est drop dans une colonne
 */
async function onTasksDrop() {
  const modifiedTasks: Task[] = [];

  for (const stage of props.stages) {
    const originalTasks = props.tasks.filter((t) => t.stageId === stage.id);
    const currentTasks = taskLists.value.get(stage.id) ?? [];

    currentTasks.forEach((task, index) => {
      if (
        !originalTasks.some(
          (t) =>
            t.id === task.id && t.position === index && t.stageId === stage.id,
        )
      ) {
        modifiedTasks.push({ ...task, position: index, stageId: stage.id });
      }
    });
  }

  if (modifiedTasks.length) {
    logger.debug("Mise à jour DnD", modifiedTasks);
    await taskStore.updateTaskBatch(modifiedTasks);
  }
}
/**
 * Archivage d'une tâche
 * @param task Tâche à archiver
 */
function archiveTask(task: Task) {
  taskStore.archiveTask(task.id);

  const list = taskLists.value.get(task.stageId) ?? [];
  taskLists.value.set(
    task.stageId,
    list.filter((t) => t.id !== task.id),
  );

  logger.debug("Tâche archivée", task);
}

function onTaskSaved(task: Task) {
  const list = taskLists.value.get(task.stageId) ?? [];

  if (creationMode.value) {
    list.push(task);
  } else {
    const index = list.findIndex((t) => t.id === task.id);
    if (index !== -1) list[index] = task;
  }

  list.sort((a, b) => a.position - b.position);
  taskLists.value.set(task.stageId, [...list]);
}
</script>

<style scoped>
@reference "tailwindcss";

.btn-edit-task {
  @apply !bg-gray-700 !border-none hover:border-none !text-white hover: !bg-gray-600 w-full flex items-center justify-center relative pl-8;
}

.draggable-item {
  @apply flex justify-between items-center rounded-md p-2 mb-2 shadow-md cursor-grab bg-gray-600;
}

.draggable-button {
  @apply w-6 cursor-pointer transition-opacity duration-200;
}

.stages-container {
  @apply flex flex-col min-w-[300px] max-w-[400px] overflow-x-auto rounded-lg p-4 bg-gray-700;
}
</style>
