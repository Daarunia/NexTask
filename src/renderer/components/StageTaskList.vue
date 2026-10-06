<template>
  <div :class="['task-list flex flex-col justify-between flex-1 min-h-0', { 'is-dragging': isDragging }]">
    <!-- Liste étirée sur toute la hauteur libre : dépôt possible n'importe où dans la colonne.
         Elle défile seule quand les cartes débordent, en-tête et bouton d'ajout restent visibles -->
    <draggable
      :list="tasks"
      group="tasks"
      itemKey="id"
      v-bind="DND_OPTIONS"
      :disabled="filterActive"
      data-testid="task-list-scroll"
      class="task-list-scroll flex flex-col flex-1 w-full min-h-16"
      @start="setDragging(true)"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div data-testid="task-card" :class="['group draggable-item', { 'drag-disabled': filterActive }]">
          <strong class="task-title">{{ element.title }}</strong>

          <!-- Pied de carte : tags à gauche, icône de récurrence calée à droite -->
          <div v-if="cardTags.get(element.id)?.length || cardRecurrences.get(element.id)" class="flex items-end gap-2">
            <!-- Tags de la carte : nom et couleur lus dans le store, jamais dans task.tags -->
            <div class="flex flex-wrap gap-1 flex-1 min-w-0">
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

            <!-- Tâche récurrente : résumé de la série et prochaine date au survol -->
            <i
              v-if="cardRecurrences.get(element.id)"
              data-testid="task-card-recurrence"
              :data-status="cardRecurrences.get(element.id)!.status"
              :class="[
                'pi pi-sync recurrence-icon',
                { inactive: cardRecurrences.get(element.id)!.status !== 'active' },
              ]"
              :title="recurrenceTooltip(cardRecurrences.get(element.id)!)"
              aria-label="Tâche récurrente"
            ></i>
          </div>

          <!-- Actions en surimpression : masquées, elles ne prennent pas de place au titre -->
          <div class="card-actions opacity-0 group-hover:opacity-100">
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
              @click="onArchiveClick($event, element)"
            >
              <i class="pi pi-trash text-white"></i>
            </Button>
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
import { useConfirm } from 'primevue/useconfirm'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { compareTagNames } from '../utils/tag.helper'
import { recurrenceTooltip } from '../utils/recurrence.helper'
import { useTaskStore } from '../stores/Task'
import type { RecurrenceSummary } from '../../main/shared/recurrence.constants'
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
const taskStore = useTaskStore()
const settings = useSettingsStore()
const confirm = useConfirm()

/**
 * Série de chaque carte récurrente, dans son dernier état connu (store Task) :
 * une série arrêtée depuis une autre occurrence grise aussi cette carte.
 */
const cardRecurrences = computed(() => {
  const map = new Map<number, RecurrenceSummary>()

  for (const task of props.tasks) {
    const recurrence = taskStore.getRecurrence(task.recurrenceId) ?? task.recurrence
    if (recurrence) map.set(task.id, recurrence)
  }

  return map
})

/**
 * Clic sur la corbeille d'une carte : archivage direct, ou après confirmation
 * dans une bulle ancrée sur le bouton si le paramètre est activé.
 * @param event Clic sur le bouton
 * @param task Tâche de la carte
 */
function onArchiveClick(event: MouseEvent, task: Task) {
  if (!settings.confirmArchive) {
    emit('archive-task', task)
    return
  }

  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: 'Archiver cette tâche ?',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Archiver', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: () => emit('archive-task', task),
  })
}

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

/* Marge intérieure compensée : l'ombre des cartes n'est pas rognée sur les côtés par le défilement */
.task-list-scroll {
  @apply -mx-2 px-2 overflow-y-auto;
}

.draggable-item {
  @apply relative flex flex-col gap-1 rounded-md p-2 mb-2 shadow-md cursor-grab;
  background-color: var(--p-surface-300);
}

/* Titre sur toute la largeur, un mot trop long est coupé plutôt que de déborder */
.task-title {
  overflow-wrap: anywhere;
}

/* Fond repris de la carte (survol compris) : le titre passe proprement sous les boutons */
.card-actions {
  @apply absolute top-2 right-2 h-6 flex gap-2 pl-2 rounded-md;
  background-color: inherit;
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

.recurrence-icon {
  @apply shrink-0 text-xs;
  color: var(--p-primary-color);
}

/* Série arrêtée ou en pause : icône grisée */
.recurrence-icon.inactive {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}
</style>
