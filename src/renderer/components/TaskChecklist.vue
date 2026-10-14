<template>
  <section class="task-checklist" data-testid="task-checklist" :aria-label="t('checklist.title')">
    <!-- En-tête : libellé, avancement, actions -->
    <div class="cl-head">
      <span class="field-label"><i class="pi pi-check-square" aria-hidden="true"></i>{{ t('checklist.title') }}</span>
      <span
        v-if="progress.total"
        data-testid="task-checklist-progress"
        :class="['cl-progress', { done: complete }]"
      >
        {{ progress.done }}/{{ progress.total }}
      </span>
      <span class="flex-1"></span>
    </div>

    <!-- Barre de progression, verte quand tout est coché -->
    <div
      v-if="progress.total"
      data-testid="task-checklist-bar"
      role="progressbar"
      :class="['bar', { done: complete }]"
      :aria-label="t('checklist.progressBar')"
      aria-valuemin="0"
      :aria-valuemax="progress.total"
      :aria-valuenow="progress.done"
      :aria-valuetext="progressLabel(progress.done, progress.total)"
    >
      <i :style="{ width: `${percent}%` }"></i>
    </div>

    <ChecklistItemsEditor
      ref="editor"
      :modelValue="modelValue"
      checkable
      @update:modelValue="(items) => emit('update:modelValue', items)"
    />

    <Message v-if="error" severity="error" size="small" variant="simple" data-testid="task-checklist-error">
      {{ error }}
    </Message>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Message from 'primevue/message'
import { useI18n } from 'vue-i18n'
import ChecklistItemsEditor, { type ChecklistEditorItem } from './ChecklistItemsEditor.vue'
import { checklistProgress, progressLabel, progressPercent } from '../utils/checklist.helper'

/**
 * Section « Checklist » du dialogue de tâche (parcours P1 et P3), sous la
 * description. Les points font partie de la valeur du formulaire, rien n'est
 * écrit avant « Enregistrer » et « Annuler » abandonne tout.
 */

const props = defineProps<{
  modelValue: ChecklistEditorItem[]
  error?: string // erreur de validation du champ
}>()

const emit = defineEmits<{
  'update:modelValue': [items: ChecklistEditorItem[]]
}>()

const { t } = useI18n()

const editor = ref<InstanceType<typeof ChecklistItemsEditor> | null>(null)

const progress = computed(() => checklistProgress(props.modelValue))
const complete = computed(() => progress.value.total > 0 && progress.value.done === progress.value.total)
const percent = computed(() => progressPercent(progress.value))

/**
 * Ajoute le point en cours de saisie dans « Ajouter un point », à appeler
 * avant d'enregistrer la tâche par un raccourci (le champ garde le focus)
 */
function commitPending() {
  editor.value?.commitPending()
}

defineExpose({ commitPending })
</script>

<style scoped>
@reference "tailwindcss";

.task-checklist {
  @apply relative flex flex-col gap-1.5;
}

.cl-head {
  @apply flex min-h-7 items-center gap-2;
}

.cl-head .field-label {
  @apply flex-none;
}

/* Avancement « 3/6 », chiffres à chasse fixe, vert quand tout est coché */
.cl-progress {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.cl-progress.done {
  @apply font-semibold;
  color: var(--p-green-600);
}

.app-dark .cl-progress.done {
  color: var(--p-green-400);
}

/* Barre de progression, sur la surface des colonnes */
.bar {
  @apply overflow-hidden;
  height: 5px;
  border-radius: 3px;
  background-color: var(--p-surface-200);
}

.app-dark .bar {
  background-color: var(--p-surface-900);
}

.bar i {
  @apply block h-full;
  border-radius: 3px;
  background-color: var(--p-primary-color);
  transition: width 0.25s ease;
}

.bar.done i {
  background-color: var(--p-green-600);
}

.app-dark .bar.done i {
  background-color: var(--p-green-400);
}

@media (prefers-reduced-motion: reduce) {
  .bar i {
    transition: none;
  }
}
</style>
