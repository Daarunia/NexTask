<template>
  <draggable
    v-model="stagesLocal"
    itemKey="id"
    class="flex gap-4"
    handle=".stage-handle"
    @end="onStagesDrop"
  >
    <template #item="{ element: stage }">
      <div class="stages-container">
        <h2 class="stage-handle mx-[3%] mb-[3%] cursor-grab">
          {{ stage.name }}
        </h2>

        <StageTaskList
          :tasks="taskLists.get(stage.id) ?? []"
          @tasks-drop="onTasksDrop"
          @edit-task="openEditTaskDialog(stage.id, $event)"
          @archive-task="archiveTask"
          @create-task="openCreateTaskDialog(stage.id)"
        />
      </div>
    </template>
  </draggable>

  <TaskDialog
    v-model="showDialog"
    :stageId="stageDialog ?? 0"
    :editTask="editTask"
    :position="positionDialog"
    :creationMode="creationMode"
    @task-saved="onTaskSaved"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import StageTaskList from "./StageTaskList.vue";
import TaskDialog from "./TaskDialog.vue";
import { useTaskStore } from "../stores/Task";
import { useStageStore } from "../stores/Stage";
import { Task } from "../types/task.types";
import { Stage } from "../types/stage.types";
import { getLogger } from "../utils/logger";

const props = defineProps<{
  stages: Stage[];
  tasks: Task[];
}>();

const logger = getLogger();
const taskStore = useTaskStore();
const stageStore = useStageStore();

const showDialog = ref(false);
const stageDialog = ref<number | null>(null);
const positionDialog = ref(0);
const editTask = ref<Task | null>(null);
const creationMode = ref(true);
const taskLists = ref<Map<number, Task[]>>(new Map());
const stagesLocal = ref<Stage[]>([]);

function buildTaskLists() {
  const map = new Map<number, Task[]>();

  for (const stage of stagesLocal.value) {
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

function buildStages() {
  stagesLocal.value = [...props.stages].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
}

buildStages();
buildTaskLists();

watch(
  () => props.tasks,
  () => buildTaskLists(),
  { deep: true },
);

watch(
  () => props.stages,
  () => {
    buildStages();
    buildTaskLists();
  },
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

  for (const stage of stagesLocal.value) {
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
    logger.debug("Mise à jour DnD des tâches", modifiedTasks);
    await taskStore.updateTaskBatch(modifiedTasks);
  }
}

/**
 * Drag stages
 */
async function onStagesDrop() {
  const modifiedStages: Stage[] = [];

  stagesLocal.value.forEach((stage, index) => {
    if (stage.position !== index) {
      modifiedStages.push({ ...stage, position: index });
    }
  });

  if (modifiedStages.length) {
    logger.debug("Mise à jour DnD stages", modifiedStages);
    await stageStore.updateStageBatch(modifiedStages);
  }
}

/**
 * Archivage
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

/**
 * Save depuis dialog
 */
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

.stages-container {
  @apply flex flex-col min-w-[300px] max-w-[400px] overflow-x-auto rounded-lg p-4;
  background-color: var(--p-surface-200);
}

.app-dark .stages-container {
  background-color: var(--p-surface-900);
}

.stage-handle {
  user-select: none;
}
</style>
