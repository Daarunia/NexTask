<template>
  <div class="flex flex-col justify-between flex-1">
    <draggable
      :list="tasks"
      group="tasks"
      itemKey="id"
      :forceFallback="true"
      :fallbackTolerance="3"
      class="flex flex-col w-full"
      @end="$emit('tasks-drop')"
    >
      <template #item="{ element }">
        <div data-testid="task-card" class="group draggable-item">
          <div class="flex justify-between items-center gap-2">
            <strong>{{ element.title }}</strong>

            <div class="opacity-0 group-hover:opacity-100 h-6 flex gap-2 shrink-0">
              <Button
                severity="success"
                data-testid="btn-edit-task"
                class="draggable-button"
                @click="$emit('edit-task', element)"
              >
                <i class="pi pi-pencil text-white"></i>
              </Button>

              <Button
                severity="danger"
                data-testid="btn-archive-task"
                class="draggable-button"
                @click="$emit('archive-task', element)"
              >
                <i class="pi pi-trash text-white"></i>
              </Button>
            </div>
          </div>

          <!-- Tags de la carte : nom et couleur lus dans le store, jamais dans task.tags -->
          <div v-if="cardTagIds(element).length" class="flex flex-wrap gap-1">
            <TagChip
              v-for="tagId in cardTagIds(element)"
              :key="tagId"
              data-testid="task-card-tag"
              :tagId="tagId"
              size="small"
            />
          </div>
        </div>
      </template>
    </draggable>

    <Button class="btn-edit-task mt-3" data-testid="btn-add-task" text @click="$emit('create-task')">
      <i class="pi pi-plus absolute left-3"></i>
      <span>Ajouter une tâche</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable'
import Button from 'primevue/button'
import TagChip from './TagChip.vue'
import { Task } from '../types/task.types'
import { Tag } from '../types/tag.types'
import { useTagStore } from '../stores/Tag'

defineProps<{
  tasks: Task[]
}>()

defineEmits(['tasks-drop', 'edit-task', 'archive-task', 'create-task'])

const tagStore = useTagStore()

/**
 * Ids des tags d'une carte, triés par nom actuel sans tenir compte de la casse
 * (le tri de l'API est sensible à la casse). `task.tags` ne sert qu'à connaître
 * les ids : les tags supprimés depuis sont écartés, les renommés re-triés.
 * @param task Tâche de la carte
 */
function cardTagIds(task: Task): number[] {
  return (task.tags ?? [])
    .map((t) => tagStore.getTagById(t.id))
    .filter((tag): tag is Tag => tag !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((tag) => tag.id)
}
</script>

<style scoped>
@reference "tailwindcss";

.btn-edit-task {
  @apply w-full flex items-center justify-center relative pl-8;
}

.draggable-item {
  @apply flex flex-col gap-1 rounded-md p-2 mb-2 shadow-md cursor-grab;
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
