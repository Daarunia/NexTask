<template>
  <span
    v-if="progress.total"
    v-tooltip.top="infoTooltip(label, tooltipDisabled)"
    role="img"
    :class="['checklist-badge', { done: complete }]"
    :data-done="progress.done"
    :data-total="progress.total"
    :aria-label="label"
  >
    <i class="pi pi-check-square" aria-hidden="true"></i>{{ progress.done }}/{{ progress.total }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TaskChecklist } from '../types/checklist.types'
import { checklistProgress, progressLabel } from '../utils/checklist.helper'
import { infoTooltip } from '../utils/tooltip.helper'

/**
 * Badge d'avancement de la checklist d'une tâche (« 2/6 »), sur les cartes du
 * tableau et aux Archives. Vert quand tous les points sont cochés, rien n'est
 * affiché sans point. Le libellé complet sert d'infobulle et de nom accessible.
 * Le `data-testid` est posé par le parent, propre à chaque usage.
 */
const props = withDefaults(
  defineProps<{
    checklist?: TaskChecklist | null
    // Infobulle désactivée (ex : pendant un glisser-déposer)
    tooltipDisabled?: boolean
  }>(),
  { checklist: null, tooltipDisabled: false },
)

const progress = computed(() => checklistProgress(props.checklist?.items))
const complete = computed(() => progress.value.total > 0 && progress.value.done === progress.value.total)
const label = computed(() => progressLabel(progress.value.done, progress.value.total))
</script>

<style scoped>
@reference "tailwindcss";

/* Chiffres à chasse fixe, le badge ne bouge pas quand un point est coché */
.checklist-badge {
  @apply inline-flex shrink-0 items-center rounded px-1;
  gap: 3px;
  height: 18px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.checklist-badge .pi {
  font-size: 13px;
}

/* Tous les points cochés, couleur succès */
.checklist-badge.done {
  @apply font-semibold;
  background-color: var(--p-green-100);
  color: var(--p-green-600);
}

.app-dark .checklist-badge.done {
  background-color: color-mix(in srgb, var(--p-green-400) 15%, transparent);
  color: var(--p-green-400);
}
</style>
