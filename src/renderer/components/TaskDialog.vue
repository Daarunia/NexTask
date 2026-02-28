<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :show-header="false"
    :draggable="true"
    class="max-w-md w-full"
  >
    <div class="pt-4 flex flex-col gap-4">
      <!-- Titre -->
      <div class="flex flex-col gap-2 w-full">
        <label for="inputValue" class="text-white font-medium">Titre</label>
        <InputText
          id="inputValue"
          v-model="title"
          class="value-input"
          placeholder="Décris ton titre ici..."
        />
      </div>

      <!-- Description -->
      <div class="flex flex-col gap-2 w-full">
        <label for="description" class="text-white font-medium">
          Description
        </label>
        <Textarea
          id="description"
          v-model="description"
          autoResize
          rows="4"
          class="resize-y value-input"
          placeholder="Décris ta tâche ici..."
        />
      </div>

      <!-- Version -->
      <div class="flex flex-col gap-2 w-full">
        <label for="version" class="text-white font-medium">Version</label>
        <Select
          id="version"
          v-model="selectedVersion"
          :options="versions"
          optionLabel="label"
          optionValue="value"
          placeholder="Sélectionne une version"
          overlayClass="!bg-gray-600"
          class="value-input"
        />
      </div>

      <!-- Boutons -->
      <div class="flex gap-2 w-full">
        <Button
          type="button"
          label="Cancel"
          severity="secondary"
          class="flex-1"
          @click="visible = false"
        />
        <Button
          type="button"
          label="Save"
          severity="success"
          class="flex-1"
          @click="saveTask"
        />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, PropType } from "vue";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Select from "primevue/select";
import Button from "primevue/button";
import { Task } from "../types/task.types";
import { useTaskStore } from "../stores/Task";
import { getLogger } from "../utils/logger";

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  stageId: {
    type: Number,
    required: true,
  },
  position: {
    type: Number,
    required: true,
  },
  editTask: {
    type: Object as PropType<Task | null | undefined>,
  },
  creationMode: {
    type: Boolean,
    required: true,
  },
});

// Emits
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "task-saved", task: Task): void;
}>();

// State
const visible = ref(props.modelValue);
const stageId = ref(props.stageId);
const position = ref(props.position);

const title = ref("");
const description = ref("");
const selectedVersion = ref("1.5.0");

const versions = ref([
  { label: "1.4.4", value: "1.4.4" },
  { label: "1.4.5", value: "1.4.5" },
  { label: "1.5.0", value: "1.5.0" },
]);

// Logger & Store
const logger = getLogger();
const taskStore = useTaskStore();

// Sync ouverture / fermeture
watch(
  () => props.modelValue,
  (val) => {
    visible.value = val;

    if (val) {
      stageId.value = props.stageId;
      position.value = props.position;

      if (props.creationMode) {
        initDefaultField();
      } else if (props.editTask) {
        title.value = props.editTask.title;
        selectedVersion.value = props.editTask.version;
        description.value = props.editTask.description;
      }
    }
  },
);

watch(visible, (val) => emit("update:modelValue", val));

// Init champs par défaut
function initDefaultField() {
  title.value = "";
  selectedVersion.value = "1.5.0";
  description.value = "";
}

// Sauvegarde
async function saveTask() {
  logger.debug("Début sauvegarde tâche :", {
    stageId: stageId.value,
    title: title.value,
    selectedVersion: selectedVersion.value,
    position: position.value,
  });

  try {
    let savedTask: Task | undefined;

    if (props.creationMode) {
      const newTask: Omit<Task, "id"> = {
        stageId: stageId.value,
        title: title.value,
        version: selectedVersion.value,
        position: position.value,
        description: description.value || "",
        isHistorized: false,
        historizationDate: undefined,
        redmine: undefined,
      };

      savedTask = await taskStore.saveTask(newTask);
      logger.info("Tâche créée avec succès", savedTask);
    } else if (props.editTask) {
      const updatedTask: Task = {
        id: props.editTask.id,
        stageId: stageId.value,
        title: title.value,
        version: selectedVersion.value,
        position: position.value,
        description: description.value || "",
        isHistorized: props.editTask.isHistorized,
        historizationDate: props.editTask.historizationDate,
        redmine: props.editTask.redmine,
      };

      savedTask = await taskStore.updateTask(updatedTask);
      logger.info("Tâche mise à jour avec succès", savedTask);
    } else {
      logger.error("Aucune tâche à mettre à jour");
      return;
    }

    if (savedTask) {
      emit("task-saved", savedTask);
    }

    emit("update:modelValue", false);
  } catch (error) {
    logger.error("Erreur lors de la sauvegarde", error);
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.value-input {
  @apply w-full hover:!border-gray-500 focus:!border-gray-500 !bg-gray-600;
}

:deep(.p-select.p-focus) {
  border-color: #6b7280 !important;
  box-shadow: none !important;
}
</style>
