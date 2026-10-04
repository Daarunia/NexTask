<template>
  <!-- Fenêtre d'ajout rapide (raccourci global) : sa hauteur suit ce formulaire -->
  <form ref="formRef" data-testid="quick-add" class="quick-add" @submit.prevent="submit" @keydown.esc.prevent="close">
    <div class="flex items-center gap-3">
      <i class="pi pi-plus-circle quick-add-icon" aria-hidden="true"></i>
      <InputText
        ref="inputRef"
        v-model="title"
        data-testid="quick-add-title"
        aria-label="Titre de la tâche"
        placeholder="Nouvelle tâche…"
        :maxlength="LABEL_MAX_LENGTH"
        :disabled="saving"
        autofocus
        class="flex-1"
      />
    </div>

    <!-- Colonne de la tâche, la première par défaut -->
    <SelectButton
      v-if="stages.length > 1"
      v-model="stageId"
      data-testid="quick-add-stage"
      :options="stages"
      optionLabel="name"
      optionValue="id"
      :allowEmpty="false"
      size="small"
      class="flex-wrap"
    />

    <p v-if="error" data-testid="quick-add-error" class="quick-add-error text-sm">{{ error }}</p>
    <p v-else class="quick-add-muted text-xs">Entrée pour ajouter · Échap pour fermer</p>
  </form>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import { useStageStore } from '../stores/Stage'
import { useTaskStore } from '../stores/Task'
import type { Stage } from '../types/stage.types'
import { httpStatus } from '../utils/api.helper'
import { getLogger } from '../utils/logger'
import { LABEL_MAX_LENGTH } from '../../main/shared/validation.constants'

const logger = getLogger()
const stageStore = useStageStore()
const taskStore = useTaskStore()

const formRef = ref<HTMLFormElement | null>(null)
const inputRef = ref<{ $el: HTMLInputElement } | null>(null)
const title = ref('')
const stages = ref<Stage[]>([])
const stageId = ref<number | null>(null)
const saving = ref(false)
const error = ref('')

/** Place le curseur dans le champ du titre. */
function focusTitle() {
  nextTick(() => inputRef.value?.$el.focus())
}

/** Ferme la fenêtre (Échap, tâche ajoutée). */
function close() {
  globalThis.quickAdd.close()
}

/**
 * Colonnes proposées, dans l'ordre du tableau. Sans elles, la tâche peut
 * encore être ajoutée : le serveur la met dans la première colonne.
 */
async function loadStages() {
  try {
    await stageStore.loadAllStages()
    stages.value = [...stageStore.getAllStages].sort((a, b) => a.position - b.position)
    stageId.value = stages.value[0]?.id ?? null
  } catch (err) {
    logger.error('Ajout rapide : colonnes non chargées, la tâche ira dans la première colonne', err)
  }
}

/**
 * Crée la tâche, prévient la fenêtre principale (qui l'affiche sans recharger)
 * puis ferme la fenêtre. En cas d'échec, la saisie est gardée pour réessayer.
 */
async function submit() {
  const value = title.value.trim()
  if (!value || saving.value) return

  saving.value = true
  error.value = ''

  try {
    const task = await taskStore.quickAddTask(value, stageId.value ?? undefined)
    globalThis.quickAdd.notifyCreated(task)
    close()
  } catch (err) {
    error.value =
      httpStatus(err) === 409
        ? 'Ajoute une colonne au tableau pour y noter la tâche.'
        : "La tâche n'a pas été ajoutée. Réessaie avec Entrée."
    saving.value = false
    focusTitle()
  }
}

// Hauteur de la fenêtre ajustée au formulaire (colonnes sur plusieurs lignes, message d'erreur)
const resizeObserver = new ResizeObserver(() => {
  if (formRef.value) globalThis.quickAdd.resize(formRef.value.offsetHeight)
})

onMounted(() => {
  if (formRef.value) resizeObserver.observe(formRef.value)
  globalThis.addEventListener('focus', focusTitle)
  focusTitle()
  loadStages()
})

onBeforeUnmount(() => {
  resizeObserver.disconnect()
  globalThis.removeEventListener('focus', focusTitle)
})
</script>

<style scoped>
@reference "tailwindcss";

/* Fenêtre sans cadre : la bordure du formulaire en tient lieu */
.quick-add {
  @apply flex flex-col gap-3 p-4;
  border: 1px solid var(--p-content-border-color);
  background-color: var(--p-surface-100);
}

.app-dark .quick-add {
  background-color: var(--p-surface-900);
}

.quick-add-icon {
  @apply text-xl;
  color: var(--p-primary-color);
}

.quick-add-muted {
  color: var(--p-text-muted-color);
}

.quick-add-error {
  color: var(--p-red-500);
}
</style>
