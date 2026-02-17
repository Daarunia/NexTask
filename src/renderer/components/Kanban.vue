<template>
  <div class="flex gap-4">
    <!-- Boucle sur les stages / colonnes -->
    <div v-for="stage in stages" :key="stage" class="stages-container">
      <h2 class="mx-[3%] mb-[3%]">{{ stage }}</h2>

      <!-- Draggable pour les tâches de cette colonne -->
      <div class="flex flex-col justify-between flex-1">
        <draggable
          :list="taskLists[stage]"
          group="tasks"
          itemKey="id"
          class="flex flex-col w-full"
          @end="onTasksDrop"
        >
          <template #item="{ element }">
            <div class="group draggable-item">
              <strong>{{ element.title }}</strong>

              <!-- Boutons de gestion de tâche -->
              <div class="opacity-0 group-hover:opacity-100 h-6 flex gap-2">
                <Button
                  severity="primary"
                  class="draggable-button"
                  style="font-size: 1rem"
                  @click="
                    openEditTaskDialog(stage, taskLists[stage].length, element)
                  "
                  aria-label="Modifier la tâche"
                >
                  <i class="pi pi-pencil text-white"></i>
                </Button>
                <Button
                  severity="danger"
                  class="draggable-button"
                  style="font-size: 1rem"
                  @click="archiveTask(element)"
                  aria-label="Supprimer la tâche"
                >
                  <i class="pi pi-trash text-white"></i>
                </Button>
              </div>
            </div>
          </template>
        </draggable>

        <div>
          <Button
            class="btn-edit-task"
            @click="openCreateTaskDialog(stage, taskLists[stage].length)"
          >
            <i class="pi pi-plus absolute left-3 text-white"></i>
            <span>Ajouter une tâche</span>
          </Button>
        </div>
      </div>
    </div>

    <TaskDialog
      v-model="showDialog"
      :stage="stageDialog"
      :editTask="editTask"
      :position="positionDialog"
      :creationMode="creationMode"
      @task-saved="onTaskSaved"
    />
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useTaskStore } from "../stores/Task";
import { Task } from "../types/task.types";
import draggable from "vuedraggable";
import TaskDialog from "./TaskDialog.vue";
import { getLogger } from "../utils/logger";

// Props typées
const props = defineProps<{
  stages: string[];
  tasks: Task[];
}>();

// Logger
const logger = getLogger();

// Paramètres de boite de dialogue
const showDialog = ref(false);
const stageDialog = ref("");
const positionDialog = ref(0);
const editTask = ref<Task | null>(null);
const creationMode = ref(true); // True => Création - False => Edition

/**
 * Mapping des tâches par stage
 */
const taskLists = ref(
  Object.fromEntries(
    props.stages.map((stage) => [
      stage,
      props.tasks
        .filter((t) => t.stage === stage)
        .map((t) => ({ ...t }))
        .sort((a, b) => a.position - b.position),
    ]),
  ),
);

// Store des tâches
const taskStore = useTaskStore();

/**
 * Ouverture de la boite de dialogue en mode création
 */
const openCreateTaskDialog = (stage: string, position: number) => {
  logger.debug("Ouverture de la boite de dialogue en mode création : ", {
    stage: stage,
    position: position,
  });
  stageDialog.value = stage;
  positionDialog.value = position;
  creationMode.value = true;
  showDialog.value = true;
};

/**
 * Ouverture de la boite de dialogue en mode création
 */
const openEditTaskDialog = (stage: string, position: number, task: Task) => {
  logger.debug("Ouverture de la boite de dialogue en mode édition : ", {
    stage: stage,
    position: position,
    editTask: editTask,
  });
  stageDialog.value = stage;
  positionDialog.value = position;
  editTask.value = task;
  creationMode.value = false;
  showDialog.value = true;
};

/**
 * Mise à jour des positions sur les objets "Task" aprés drag and drop
 */
async function onTasksDrop() {
  const modifiedTasks: Task[] = [];

  for (const stage of props.stages) {
    const originalTasks = props.tasks.filter((t) => t.stage === stage);
    const currentTasks = taskLists.value[stage];

    currentTasks.forEach((task, index) => {
      if (
        !originalTasks.some(
          (t) => t.id === task.id && t.position === index && t.stage === stage,
        )
      ) {
        modifiedTasks.push({ ...task, position: index, stage });
      }
    });
  }

  if (modifiedTasks.length) {
    logger.debug("Tâches modifiées après DnD", modifiedTasks);
    await taskStore.updateTaskBatch(modifiedTasks);
  }
}

/**
 * Archivage d'une tâche
 * @param task tâche à archiver
 */
function archiveTask(task: Task) {
  // Archivage de la tache du store
  taskStore.archiveTask(task.id);

  // Met à jour la liste locale pour refléter l'archivage
  for (const stage in taskLists.value) {
    taskLists.value[stage] = taskLists.value[stage].filter(
      (t) => t.id !== task.id,
    );
  }

  logger.debug("Archivage de la tâche", task);
}

/**
 * Ajout ou mise à jour d'une tâche dans la liste après sauvegarde
 * @param task Tâche sauvegardée ou mise à jour
 */
async function onTaskSaved(task: Task) {
  const taskStageList = taskLists.value[task.stage];

  // Si la tâche existe déjà, on remplace la tâche dans la liste. Sinon on l'ajoute à la liste lié.
  if (creationMode.value) {
    taskStageList.push(task);
    taskStageList.sort((a, b) => a.position - b.position);
  } else {
    taskStageList[taskStageList.findIndex((t) => t.id === task.id)] = task;
  }
}
</script>
<style scoped>
@reference "tailwindcss";

/* Bouton d'ouverture de la boite de dialogue d'édition  */
.btn-edit-task {
  @apply !bg-gray-700 !border-none hover:border-none !text-white hover:!bg-gray-600 w-full flex items-center justify-center relative pl-8;
}

/* Conteneur d’un élément draggable */
.draggable-item {
  @apply flex justify-between items-center rounded-md p-2 mb-2 shadow-md cursor-grab bg-gray-600;
}

/* Icône de suppression affichée au survol */
.draggable-button {
  @apply w-6 cursor-pointer transition-opacity duration-200;
}

/* Conteneur des listes */
.stages-container {
  @apply flex flex-col min-w-[300px] max-w-[400px] overflow-x-auto rounded-lg p-4 bg-gray-700;
}
</style>
