<template>
  <div class="flex flex-col justify-between flex-1">
    <draggable
      :list="tasks"
      group="tasks"
      itemKey="id"
      class="flex flex-col w-full"
      @end="$emit('tasks-drop')"
    >
      <template #item="{ element }">
        <div class="group draggable-item">
          <strong>{{ element.title }}</strong>

          <div class="opacity-0 group-hover:opacity-100 h-6 flex gap-2">
            <Button
              severity="success"
              class="draggable-button"
              @click="$emit('edit-task', element)"
            >
              <i class="pi pi-pencil text-white"></i>
            </Button>

            <Button
              severity="danger"
              class="draggable-button"
              @click="$emit('archive-task', element)"
            >
              <i class="pi pi-trash text-white"></i>
            </Button>
          </div>
        </div>
      </template>
    </draggable>

    <Button class="btn-edit-task mt-3" text @click="$emit('create-task')">
      <i class="pi pi-plus absolute left-3"></i>
      <span>Ajouter une tâche</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import draggable from "vuedraggable";
import Button from "primevue/button";
import { Task } from "../types/task.types";

defineProps<{
  tasks: Task[];
}>();

defineEmits(["tasks-drop", "edit-task", "archive-task", "create-task"]);
</script>

<style scoped>
@reference "tailwindcss";

.btn-edit-task {
  @apply w-full flex items-center justify-center relative pl-8;
}

.draggable-item {
  @apply flex justify-between items-center rounded-md p-2 mb-2 shadow-md cursor-grab;
  background-color: var(--p-surface-300);
}

.app-dark .draggable-item {
  background-color: var(--p-surface-800);
}

.draggable-item:hover {
  background-color: var(--p-surface-400);
}

.app-dark .draggable-item:hover {
  background-color: var(--p-surface-700);
}

.draggable-button {
  @apply w-6 cursor-pointer transition-opacity duration-200;
}
</style>
