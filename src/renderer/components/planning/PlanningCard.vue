<template>
  <div
    v-tooltip.top="infoTooltip(placeLabel, isDragging)"
    :class="['planning-card', dateState, { compact, colored: !!stage?.color }]"
    :style="stage?.color ? { '--stage-color': getTagColorStyle(stage.color).swatch } : undefined"
  >
    <div class="planning-card-head">
      <BoardDot v-if="showBoard" data-testid="planning-card-board" :color="board?.color ?? null" />
      <time v-if="date" data-testid="planning-card-date" :datetime="date.toISOString()" class="planning-card-date">
        {{ dateLabel }}
      </time>
      <span class="planning-card-title" data-testid="planning-card-title">{{ task.title }}</span>
    </div>

    <!-- Carte complète de la vue semaine, en lecture seule : la carte s'ouvre pour modifier -->
    <div v-if="!compact && hasFooter" class="planning-card-footer">
      <TagChip
        v-for="tag in task.tags"
        :key="tag.id"
        data-testid="planning-card-tag"
        :tagId="tag.id"
        :name="tag.name"
        size="small"
      />
      <ChecklistBadge data-testid="planning-card-checklist" :checklist="task.checklist" :tooltipDisabled="isDragging" />
      <i
        v-if="hasDescription(task.description)"
        v-tooltip.top="infoTooltip(descriptionExcerpt(task.description), isDragging)"
        data-testid="planning-card-description"
        class="pi pi-align-left planning-card-icon"
        :aria-label="descriptionExcerpt(task.description)"
      ></i>
      <i
        v-if="recurrence"
        v-tooltip.top="infoTooltip(recurrenceTooltip(recurrence), isDragging)"
        data-testid="planning-card-recurrence"
        class="pi pi-sync planning-card-icon"
        :aria-label="recurrenceTooltip(recurrence)"
      ></i>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoardDot from '../BoardDot.vue'
import ChecklistBadge from '../ChecklistBadge.vue'
import TagChip from '../TagChip.vue'
import { getTagColorStyle } from '../../constants/tag.constants'
import { useBoardStore } from '../../stores/Board'
import { useStageStore } from '../../stores/Stage'
import { useTaskStore } from '../../stores/Task'
import type { Task } from '../../types/task.types'
import { dayState, shortDateLabel, timeLabel } from '../../utils/date.helper'
import { descriptionExcerpt, hasDescription } from '../../utils/description.helper'
import { isDragging } from '../../utils/dnd.helper'
import { useNow } from '../../utils/now.helper'
import { recurrenceTooltip } from '../../utils/recurrence.helper'
import { infoTooltip } from '../../utils/tooltip.helper'

/**
 * Carte d'une tâche au Planning : liseré à la couleur de sa colonne, pastille de
 * son tableau quand il y en a plusieurs, heure et titre. La vue semaine ajoute
 * ses tags, l'avancement de sa checklist et ses icônes.
 */
const props = withDefaults(
  defineProps<{
    task: Task
    compact?: boolean
    showBoard?: boolean
    // Date complète plutôt que l'heure seule, hors de la grille où le jour est déjà donné
    fullDate?: boolean
  }>(),
  { compact: false, showBoard: false, fullDate: false },
)

const stageStore = useStageStore()
const boardStore = useBoardStore()
const taskStore = useTaskStore()
const now = useNow()

const stage = computed(() => stageStore.getAllStages.find((candidate) => candidate.id === props.task.stageId))
const board = computed(() => boardStore.getAllBoards.find((candidate) => candidate.id === stage.value?.boardId))
const date = computed(() => (props.task.startDate ? new Date(props.task.startDate) : null))
const dateLabel = computed(() => {
  if (!date.value) return ''
  return props.fullDate ? shortDateLabel(date.value, now.value) : timeLabel(date.value)
})
const dateState = computed(() => (date.value ? dayState(date.value, now.value) : undefined))
const recurrence = computed(() => taskStore.getRecurrence(props.task.recurrenceId) ?? props.task.recurrence)

// Colonne de la tâche en infobulle, précédée de son tableau quand il y en a plusieurs
const placeLabel = computed(() => {
  const names = props.showBoard ? [board.value?.name, stage.value?.name] : [stage.value?.name]
  return names.filter(Boolean).join(' › ')
})

const hasFooter = computed(
  () =>
    !!props.task.tags?.length ||
    !!props.task.checklist?.items.length ||
    hasDescription(props.task.description) ||
    !!recurrence.value,
)
</script>

<style scoped>
@reference "tailwindcss";

.planning-card {
  @apply flex w-full min-w-0 flex-col gap-1 rounded px-1.5 py-1 text-left text-sm;
  --stage-color: transparent;
  background-color: var(--p-surface-100);
  border-left: 3px solid var(--stage-color);
  color: var(--p-text-color);
}

.app-dark .planning-card {
  background-color: var(--p-surface-800);
}

.planning-card.compact {
  @apply py-0.5 text-xs;
}

.planning-card-head {
  @apply flex min-w-0 items-center gap-1.5;
}

.planning-card:not(.compact) .planning-card-head {
  @apply flex-wrap;
}

.planning-card-date {
  @apply shrink-0;
  color: var(--p-text-muted-color);
}

/* Passé la date, l'heure prend la teinte des dates en retard du Kanban */
.planning-card.past .planning-card-date {
  color: var(--p-red-500);
}

.planning-card.today .planning-card-date {
  color: var(--p-primary-color);
}

.planning-card-title {
  @apply min-w-0 truncate;
}

.planning-card:not(.compact) .planning-card-title {
  @apply w-full whitespace-normal;
}

.planning-card-footer {
  @apply flex flex-wrap items-center gap-1 text-xs;
}

.planning-card-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
