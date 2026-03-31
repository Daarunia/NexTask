<template>
  <div
    class="flex h-4/5 pt-8 overflow-x-auto ml-4 before:content-[''] before:flex-1 after:content-[''] after:flex-1 pb-4"
    ref="scrollContainer"
  >
    <draggable
      v-model="stagesLocal"
      itemKey="id"
      class="flex gap-4"
      handle=".stage-handle"
      @end="onStagesDrop"
    >
      <template #item="{ element: stage }">
        <div class="stages-container">
          <div class="flex items-center justify-between mb-3">
            <template v-if="editingStageId === stage.id">
              <input
                id="stage-input-{{stage.id}}"
                v-model="editedStageName"
                @keyup.enter="saveStageName(stage)"
                @keyup.esc="cancelEditingStage"
                @blur="saveStageName(stage)"
                class="border rounded px-2 py-1 text-lg w-full"
              />
            </template>
            <template v-else>
              <h2
                class="stage-handle cursor-grab text-lg"
                @dblclick="startEditingStage(stage)"
              >
                {{ stage.name }}
              </h2>
            </template>

            <!-- Menu -->
            <Button
              icon="pi pi-ellipsis-v"
              @click="(event) => toggleStageMenu(event, stage)"
              text
            />
            <Menu ref="stageMenu" :model="stageMenuItems" popup />
          </div>

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

    <div class="btn-add-container">
      <Button
        v-if="!isAddingStage"
        class="btn-add-stage"
        text
        @click="showAddStageInput"
      >
        <i class="pi pi-plus absolute left-3"></i>
        <span>Ajouter une liste</span>
      </Button>

      <div v-else class="flex gap-2 w-full">
        <input
          ref="newStageInput"
          v-model="newStageName"
          class="flex-1 p-2 rounded border"
          placeholder="Nom de la liste"
          @keyup.enter="createStage"
          autofocus
        />

        <Button icon="pi pi-check" @click="createStage" />
        <Button
          icon="pi pi-times"
          severity="secondary"
          @click="cancelCreateStage"
        />
      </div>
    </div>
  </div>

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
import { ref, onMounted, onBeforeUnmount, nextTick, reactive } from "vue";
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

const newStageInput = ref<HTMLInputElement | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const showDialog = ref(false);
const positionDialog = ref(0);
const editTask = ref<Task | null>(null);
const creationMode = ref(true);
const taskLists = reactive(ref<Map<number, Task[]>>(new Map()));
const stageDialog = ref<number | null>(null);
const selectedStage = ref<Stage | null>(null);
const stagesLocal = ref<Stage[]>([]);
const isAddingStage = ref(false);
const newStageName = ref("");
const stageMenu = ref();
const editingStageId = ref<number | null>(null); // stage en cours d'édition
const editedStageName = ref(""); // nom temporaire pour l'édition

const stageMenuItems = [
  { label: "Supprimer", icon: "pi pi-trash", command: () => deleteStage() },
];

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

/**
 * Création de la colonne
 */
async function createStage() {
  if (!newStageName.value.trim()) return;

  const newStage = await stageStore.saveStage(
    newStageName.value,
    stagesLocal.value.length,
  );
  stagesLocal.value.push(newStage);

  newStageName.value = "";
  isAddingStage.value = false;
}

function cancelCreateStage() {
  newStageName.value = "";
  isAddingStage.value = false;
}

function showAddStageInput() {
  isAddingStage.value = true;

  // Focus sur l'input
  nextTick(() => {
    newStageInput.value?.focus();
  });
}

async function deleteStage() {
  if (!selectedStage.value) return;
  const stageId = selectedStage.value.id;

  try {
    await stageStore.deleteStage(stageId);

    stagesLocal.value = stagesLocal.value.filter((s) => s.id !== stageId);

    const newTaskLists = new Map(taskLists.value);
    newTaskLists.delete(stageId);
    taskLists.value = newTaskLists;

    logger.debug("Colonne supprimée : ", stageId);
  } catch (error) {
    logger.error("Erreur lors de la suppression de la colonne", {
      stageId,
      error,
    });
  } finally {
    selectedStage.value = null;
  }
}

function startEditingStage(stage: Stage) {
  editingStageId.value = stage.id;
  editedStageName.value = stage.name;
  nextTick(() => {
    const input = document.getElementById(
      `stage-input-${stage.id}`,
    ) as HTMLInputElement;
    input?.focus();
    input?.select();
  });
}

async function saveStageName(stage: Stage) {
  if (!editedStageName.value.trim()) return;

  stage.name = editedStageName.value;
  editingStageId.value = null;

  await stageStore.updateStage(stage.id, stage.name);
}

function cancelEditingStage() {
  editingStageId.value = null;
}

// Affichage du menu des stages
const toggleStageMenu = (event: Event, stage: Stage) => {
  selectedStage.value = stage;
  stageMenu.value.toggle(event);
};

onMounted(() => {
  if (!scrollContainer.value) return;
  const el = scrollContainer.value;

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return;
    el.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  el.addEventListener("wheel", onWheel, { passive: false });

  onBeforeUnmount(() => {
    el.removeEventListener("wheel", onWheel);
  });
});
</script>

<style scoped>
@reference "tailwindcss";

.stages-container {
  @apply flex flex-col min-w-[300px] max-w-[400px] overflow-x-auto rounded-lg p-4;
  background-color: var(--p-surface-200);
}

.btn-add-container {
  @apply flex flex-col items-center justify-center min-w-[300px] overflow-x-auto rounded-lg ml-4 h-16 p-2;
  background-color: var(--p-surface-200);
}

.app-dark .btn-add-container {
  background-color: var(--p-surface-900);
}

.btn-add-stage {
  @apply flex items-center justify-center w-full;
  background-color: var(--p-surface-200);
}

.app-dark .btn-add-stage {
  background-color: var(--p-surface-900);
}

.app-dark .stages-container {
  background-color: var(--p-surface-900);
}

.stage-handle {
  user-select: none;
}
</style>
