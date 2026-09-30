<template>
  <div :class="['task-list flex flex-col justify-between flex-1', { 'is-dragging': isDragging }]">
    <!-- Liste étirée sur toute la hauteur libre : dépôt possible n'importe où dans la colonne -->
    <draggable
      :list="tasks"
      group="tasks"
      itemKey="id"
      v-bind="DND_OPTIONS"
      :disabled="filterActive"
      class="flex flex-col flex-1 w-full min-h-16"
      @start="setDragging(true)"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div data-testid="task-card" :class="['group draggable-item', { 'drag-disabled': filterActive }]">
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
          <div v-if="cardTags.get(element.id)?.length" class="flex flex-wrap gap-1">
            <TagChip
              v-for="tag in cardTags.get(element.id)"
              :key="tag.id"
              data-testid="task-card-tag"
              :tagId="tag.id"
              :name="tag.name"
              size="small"
              removable
              removeOnHover
              removeTestId="task-card-tag-remove"
              @remove="$emit('remove-tag', element, tag.id)"
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
import { computed } from 'vue'
import draggable from 'vuedraggable'
import Button from 'primevue/button'
import TagChip from './TagChip.vue'
import { Task } from '../types/task.types'
import { Tag } from '../types/tag.types'
import { useTagStore } from '../stores/Tag'
import { compareTagNames } from '../utils/tag.helper'
import { DND_OPTIONS } from '../constants/dnd.constants'
import { isDragging, setDragging } from '../utils/dnd.helper'

const props = withDefaults(
  defineProps<{
    tasks: Task[]
    // Filtre actif : DnD des tâches désactivé, les index de la vue filtrée ne
    // correspondant plus aux positions réelles de la colonne
    filterActive?: boolean
  }>(),
  { filterActive: false },
)

const emit = defineEmits(['tasks-drop', 'edit-task', 'archive-task', 'create-task', 'remove-tag'])

/** Fin d'un drag de carte : fin du curseur de drag, puis sauvegarde par le parent. */
function onDragEnd() {
  setDragging(false)
  emit('tasks-drop')
}

const tagStore = useTagStore()

/**
 * Tags de chaque carte, calculés une fois par rendu : nom et couleur lus dans le
 * store (source de vérité), triés par nom sans tenir compte de la casse (le tri
 * de l'API y est sensible). Un tag supprimé disparaît ; un tag que le cache ne
 * connaît pas encore reste affiché avec le nom porté par la tâche.
 */
const cardTags = computed(() => {
  const map = new Map<number, Pick<Tag, 'id' | 'name'>[]>()

  for (const task of props.tasks) {
    const tags = (task.tags ?? [])
      .filter((t) => !tagStore.wasDeleted(t.id))
      .map((t) => tagStore.getTagById(t.id) ?? t)
      .sort(compareTagNames)
      .map((t) => ({ id: t.id, name: t.name }))
    map.set(task.id, tags)
  }

  return map
})
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

/* Survol en pause pendant un drag : seules les cartes déplacées changent d'aspect */
.task-list:not(.is-dragging) .draggable-item:hover {
  background-color: var(--p-surface-400);
}

.app-dark .task-list:not(.is-dragging) .draggable-item:hover {
  background-color: var(--p-surface-700);
}

/* Emplacement de dépôt : cadre en pointillés teinté, contenu masqué */
.draggable-item.dnd-ghost {
  background-color: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
  box-shadow: none;
}

.draggable-item.dnd-ghost > * {
  visibility: hidden;
}

/* Carte tenue : légèrement inclinée et soulevée (rotate et scale se cumulent
   au transform posé par SortableJS pour suivre la souris) */
.draggable-item.dnd-dragging {
  rotate: 2deg;
  scale: 1.03;
  box-shadow: 0 12px 24px rgb(0 0 0 / 0.25);
}

.draggable-item.drag-disabled {
  @apply cursor-default;
}

.draggable-button {
  @apply w-6 cursor-pointer transition-opacity duration-200;
}
</style>
