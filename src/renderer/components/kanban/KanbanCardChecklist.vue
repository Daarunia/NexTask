<template>
  <!-- Badge d'avancement cliquable, absent sans point (cf. ChecklistBadge) -->
  <button
    v-if="items.length"
    type="button"
    data-testid="btn-card-checklist"
    class="card-checklist-btn"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="toggle"
  >
    <ChecklistBadge data-testid="task-card-checklist" :checklist="task.checklist" :tooltipDisabled="disabled || open" />
  </button>

  <!-- Le Popover porte déjà le rôle dialog, il reçoit ici son nom accessible -->
  <Popover ref="popover" :aria-label="task.title" @show="open = true" @hide="open = false">
    <div class="card-checklist" data-testid="card-checklist-popover">
      <div class="cc-head">
        <strong class="cc-title">{{ task.title }}</strong>
        <span :class="['cc-progress', { done: complete }]">{{ progress.done }}/{{ progress.total }}</span>
      </div>

      <ul class="cc-items">
        <li v-for="item in items" :key="item.id" :class="['cc-item', { checked: item.isChecked }]">
          <Checkbox
            :inputId="`card-checklist-${task.id}-${item.id}`"
            :modelValue="item.isChecked"
            binary
            data-testid="card-checklist-check"
            @update:modelValue="(checked: boolean) => emit('check-item', item.id, checked)"
          />
          <label :for="`card-checklist-${task.id}-${item.id}`" data-testid="card-checklist-text">{{ item.text }}</label>
        </li>
      </ul>

      <Button
        type="button"
        icon="pi pi-pencil"
        :label="t('checklist.openTask')"
        data-testid="btn-card-checklist-open"
        class="cc-open"
        severity="secondary"
        size="small"
        text
        @click="openTask"
      />
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Popover from 'primevue/popover'
import ChecklistBadge from '../ChecklistBadge.vue'
import type { Task } from '../../types/task.types'
import { checklistProgress } from '../../utils/checklist.helper'

/**
 * Checklist d'une carte du tableau, dont le badge d'avancement ouvre une bulle
 * où cocher les points sans ouvrir le dialogue de la tâche. Chaque coche remonte
 * au Kanban, qui l'affiche aussitôt et l'enregistre. Les textes et l'ordre des
 * points ne se modifient que dans le dialogue.
 */
const props = withDefaults(
  defineProps<{
    task: Task
    // Glisser-déposer en cours : infobulle coupée et bulle refermée
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  // Case d'un point cochée ou décochée
  'check-item': [itemId: number, isChecked: boolean]
  // Lien « Ouvrir la tâche » de la bulle
  open: []
}>()

const { t } = useI18n()

const popover = ref<InstanceType<typeof Popover> | null>(null)
const open = ref(false)

const items = computed(() => props.task.checklist?.items ?? [])
const progress = computed(() => checklistProgress(items.value))
const complete = computed(() => progress.value.total > 0 && progress.value.done === progress.value.total)

// Un drag qui démarre referme la bulle, qui resterait sinon ancrée dans le vide
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) popover.value?.hide()
  },
)

/**
 * Ouvre ou referme la bulle sous le badge.
 * @param event Clic sur le badge
 */
function toggle(event: MouseEvent) {
  popover.value?.toggle(event)
}

/** Referme la bulle et ouvre la tâche dans son dialogue. */
function openTask() {
  popover.value?.hide()
  emit('open')
}
</script>

<style scoped>
@reference "tailwindcss";

/* Bouton sans habillage, le badge garde son aspect */
.card-checklist-btn {
  @apply inline-flex shrink-0 cursor-pointer rounded p-0;
  background: none;
  border: none;
}

.card-checklist-btn:hover :deep(.checklist-badge),
.card-checklist-btn[aria-expanded='true'] :deep(.checklist-badge) {
  outline: 1px solid var(--p-content-border-color);
}

.card-checklist-btn:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.card-checklist {
  @apply flex flex-col gap-2;
  width: 260px;
  max-width: 80vw;
}

.cc-head {
  @apply flex items-baseline gap-2;
}

.cc-title {
  @apply flex-1 min-w-0 truncate text-sm;
}

.cc-progress {
  @apply text-xs;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.cc-progress.done {
  @apply font-semibold;
  color: var(--p-green-600);
}

.app-dark .cc-progress.done {
  color: var(--p-green-400);
}

/* Longue checklist : la liste défile, l'en-tête et le lien restent visibles */
.cc-items {
  @apply flex flex-col gap-1 overflow-y-auto;
  max-height: 260px;
  --p-checkbox-width: 18px;
  --p-checkbox-height: 18px;
  --p-checkbox-icon-size: 12px;
}

.cc-item {
  @apply flex items-start gap-2 text-sm;
}

.cc-item label {
  @apply flex-1 min-w-0 cursor-pointer;
  overflow-wrap: anywhere;
}

.cc-item.checked label {
  @apply line-through;
  color: var(--p-text-muted-color);
}

.cc-open {
  @apply self-end;
}
</style>
