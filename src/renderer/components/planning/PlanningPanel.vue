<template>
  <aside
    ref="root"
    class="planning-panel select-none"
    data-testid="planning-panel"
    :aria-label="t('planning.panel.title')"
  >
    <h3 class="planning-panel-title">{{ t('planning.panel.title') }}</h3>

    <!-- Cible d'un dépôt depuis la grille, qui retire la date, repérée pendant le drag -->
    <section
      ref="unscheduledZone"
      :class="['planning-panel-section flex-1', { 'is-drop-target': dropTarget }]"
      data-testid="planning-unscheduled"
    >
      <h4 class="planning-panel-heading">
        {{ t('planning.panel.unscheduled') }}
        <span class="planning-panel-count" data-testid="planning-unscheduled-count">{{ unscheduled.length }}</span>
      </h4>
      <button
        v-for="task in unscheduled"
        :key="task.id"
        type="button"
        class="planning-panel-card"
        data-testid="planning-panel-card"
        :data-planning-task-id="task.id"
        @click="$emit('open', task)"
      >
        <PlanningCard :task="task" compact :showBoard="showBoard" />
      </button>
      <p v-if="!unscheduled.length" class="planning-panel-empty">{{ t('planning.panel.unscheduledEmpty') }}</p>
    </section>

    <section v-if="overdue.length" class="planning-panel-section" data-testid="planning-overdue">
      <h4 class="planning-panel-heading">
        {{ t('planning.panel.overdue') }}
        <span class="planning-panel-count" data-testid="planning-overdue-count">{{ overdue.length }}</span>
      </h4>
      <button
        v-for="task in overdue"
        :key="task.id"
        type="button"
        class="planning-panel-card"
        data-testid="planning-panel-card"
        :data-planning-task-id="task.id"
        @click="$emit('open', task)"
      >
        <PlanningCard :task="task" compact fullDate :showBoard="showBoard" />
      </button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PlanningCard from './PlanningCard.vue'
import type { Task } from '../../types/task.types'

/**
 * Panneau « À planifier » du Planning : tâches sans date, et tâches en retard
 * que la période affichée ne montre pas. Ses cartes se glissent sur un jour
 * (cf. Draggable dans Planning.vue), et une carte de la grille déposée sur
 * « Sans date » perd sa date.
 */
defineProps<{
  unscheduled: Task[]
  overdue: Task[]
  showBoard: boolean
  dropTarget: boolean // une carte de la grille est en cours de déplacement
}>()

defineEmits<{
  open: [task: Task]
}>()

const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const unscheduledZone = ref<HTMLElement | null>(null)

/**
 * Vrai si un point de l'écran est dans la zone « Sans date ».
 * @param x Abscisse dans la fenêtre
 * @param y Ordonnée dans la fenêtre
 */
function isInUnscheduledZone(x: number, y: number): boolean {
  const rect = unscheduledZone.value?.getBoundingClientRect()
  return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

defineExpose({ root, isInUnscheduledZone })
</script>

<style scoped>
@reference "tailwindcss";

.planning-panel {
  @apply flex w-64 shrink-0 flex-col gap-3 overflow-y-auto rounded-lg p-3;
  background-color: var(--p-surface-200);
}

.app-dark .planning-panel {
  background-color: var(--p-surface-900);
}

.planning-panel-title {
  @apply text-base;
  color: var(--p-text-color);
}

.planning-panel-section {
  @apply flex min-h-16 flex-col gap-1 rounded-md p-1;
}

.planning-panel-section.is-drop-target {
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
}

.planning-panel-heading {
  @apply flex items-center gap-2 text-sm;
  color: var(--p-text-muted-color);
}

.planning-panel-count {
  @apply rounded-full px-2 text-xs;
  background-color: var(--p-primary-100);
  color: var(--p-primary-700);
}

.app-dark .planning-panel-count {
  background-color: color-mix(in srgb, var(--p-primary-400) 18%, transparent);
  color: var(--p-primary-400);
}

.planning-panel-card {
  @apply block w-full cursor-grab rounded;
  background: none;
  border: none;
  padding: 0;
}

.planning-panel-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.planning-panel-empty {
  @apply text-sm;
  color: var(--p-text-muted-color);
}
</style>
