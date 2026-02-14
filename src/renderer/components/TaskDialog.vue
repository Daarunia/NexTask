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
        <label for="description" class="text-white font-medium"
          >Description</label
        >
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
          @click="saveTask()"
        />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, PropType } from "vue";
import Dialog from "primevue/dialog";
import { Task } from "../types/task.types";
import InputText from "primevue/inputtext";
import { useLogger } from "vue-logger-plugin";
import { useTaskStore } from "../stores/Task";

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  stage: {
    type: String,
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

// Émission d'événement pour le v-model
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "task-saved", task: Task): void;
}>();

// Paramètres
const visible = ref(props.modelValue);
const stage = ref(props.stage);
const position = ref(props.position);

// Données saisiee
const title = ref("");
const description = ref("");
const selectedVersion = ref("1.5.0");
const versions = ref([
  { label: "1.4.4", value: "1.4.4" },
  { label: "1.4.5", value: "1.4.5" },
  { label: "1.5.0", value: "1.5.0" },
]);

// Logger
const logger = useLogger();

// Store des tâches
const taskStore = useTaskStore();

// Synchroniser l’état interne <-> parent de l'état d'ouverture
watch(
  () => props.modelValue,
  (val) => {
    visible.value = val;

    if (val) {
      // Initialiser les refs locales avec les props
      stage.value = props.stage;
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

/**
 * Initialisation des champs de la boite de dialogue avec les valeurs par défaut
 */
function initDefaultField() {
  title.value = "";
  selectedVersion.value = "1.5.0";
  description.value = "";
}

/**
 * Sauvegarde d'une tâche
 * @param task tâche à supprimer
 */
async function saveTask() {
  logger.debug("Début de la sauvegarde de la tâche : ", {
    stage: stage.value,
    title: title.value,
    selectedVersion: selectedVersion.value,
    position: position.value,
  });

  try {
    // Requête de sauvegarde
    let savedTask;

    if (props.creationMode) {
      // Création de la nouvelle tâche sans l'ID
      const newTask: Omit<Task, "id"> = {
        stage: stage.value,
        title: title.value,
        version: selectedVersion.value,
        position: position.value,
        description: description.value || "",
        isHistorized: false,
        historizationDate: undefined,
      };

      // Sauvegarde de la nouvelle tâche
      savedTask = await taskStore.saveTask(newTask);
      emit("task-saved", savedTask);
      logger.info("Tâche sauvegardée avec succès", savedTask);
    } else if (props.editTask) {
      // Mise à jour de la tâche existante avec l'ID
      const updatedTask: Task = {
        id: props.editTask.id,
        stage: stage.value,
        title: title.value,
        version: selectedVersion.value,
        position: position.value,
        description: description.value || "",
        isHistorized: props.editTask.isHistorized,
        historizationDate: props.editTask.historizationDate,
      };

      // Mise à jour de la tâche existante
      savedTask = await taskStore.updateTask(updatedTask);
      emit("task-saved", savedTask);
      logger.info("Tâche mise à jour avec succès", savedTask);
    } else {
      logger.error("Tâche à mettre à jour introuvable");
    }

    // Fermeture de la boite de dialogue
    logger.info("Tâche sauvegardée avec succès", savedTask);
    emit("update:modelValue", false);
  } catch (error) {
    logger.error("Erreur lors de la sauvegarde de la tâche", error);
  }

  emit("update:modelValue", false);
}
</script>

<style scoped>
@reference "tailwindcss";

/* Style des inputs  */
.value-input {
  @apply w-full hover:!border-gray-500 focus:!border-gray-500 !bg-gray-600;
}

/* Permet de changer la couleur du focus pour le sélecteur*/
:deep(.p-select.p-focus) {
  border-color: #6b7280 !important;
  box-shadow: none !important;
}
</style>
