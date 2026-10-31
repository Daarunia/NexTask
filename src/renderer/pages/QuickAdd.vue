<template>
  <!-- Fenêtre d'ajout rapide (raccourci global) : sa hauteur suit ce formulaire -->
  <form ref="formRef" data-testid="quick-add" class="quick-add" @submit.prevent="submit" @keydown.esc.prevent="close">
    <div class="flex items-center gap-3">
      <i class="pi pi-plus-circle quick-add-icon" aria-hidden="true"></i>
      <InputText
        ref="inputRef"
        v-model="title"
        data-testid="quick-add-title"
        :aria-label="t('quickAdd.titleLabel')"
        :placeholder="t('quickAdd.placeholder')"
        :maxlength="LABEL_MAX_LENGTH"
        :disabled="saving"
        autofocus
        class="flex-1"
      />
    </div>

    <!-- Tableau de la tâche, le dernier affiché par défaut. Ceux sans colonne ne sont pas proposés -->
    <SelectButton
      v-if="boards.length > 1"
      v-model="boardId"
      data-testid="quick-add-board"
      :aria-label="t('quickAdd.boardLabel')"
      :options="boards"
      optionLabel="name"
      optionValue="id"
      :allowEmpty="false"
      size="small"
      class="flex-wrap"
    >
      <template #option="{ option }">
        <span class="quick-add-board">
          <BoardDot :color="option.color" />
          <span>{{ option.name }}</span>
        </span>
      </template>
    </SelectButton>

    <!-- Colonne de la tâche dans ce tableau, la première par défaut -->
    <SelectButton
      v-if="stages.length > 1"
      v-model="stageId"
      data-testid="quick-add-stage"
      :aria-label="t('quickAdd.stageLabel')"
      :options="stages"
      optionLabel="name"
      optionValue="id"
      :allowEmpty="false"
      size="small"
      class="flex-wrap"
    />

    <!-- Modèle de checklist facultatif, en boutons comme les colonnes : la fenêtre suit la
         hauteur du formulaire, une liste déroulante y serait coupée. Un second clic le retire -->
    <div v-if="templates.length" class="flex items-start gap-2">
      <i class="pi pi-check-square quick-add-muted mt-1.5" :title="t('quickAdd.templateLabel')" aria-hidden="true"></i>
      <SelectButton
        v-model="templateId"
        data-testid="quick-add-template"
        :aria-label="t('quickAdd.templateLabel')"
        :options="templates"
        optionLabel="name"
        optionValue="id"
        size="small"
        class="flex-wrap"
      />
    </div>

    <p v-if="error" data-testid="quick-add-error" class="quick-add-error text-sm">{{ error }}</p>
    <p v-else class="quick-add-muted text-xs">{{ t('quickAdd.hint') }}</p>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import BoardDot from '../components/BoardDot.vue'
import { useStageStore } from '../stores/Stage'
import { useBoardStore } from '../stores/Board'
import { useSettingsStore } from '../stores/Settings'
import { useTaskStore } from '../stores/Task'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import type { Board } from '../types/board.types'
import type { ChecklistTemplate } from '../types/checklistTemplate.types'
import { httpStatus } from '../utils/api.helper'
import { getLogger } from '../utils/logger'
import { LABEL_MAX_LENGTH } from '../../main/shared/validation.constants'
import { useI18n } from 'vue-i18n'

const logger = getLogger()
const stageStore = useStageStore()
const boardStore = useBoardStore()
const taskStore = useTaskStore()
const templateStore = useChecklistTemplateStore()
const settings = useSettingsStore()
const { t } = useI18n()

const formRef = ref<HTMLFormElement | null>(null)
const inputRef = ref<{ $el: HTMLInputElement } | null>(null)
const title = ref('')
// Tableaux proposés, ceux qui ont au moins une colonne, et tableau choisi.
// Celui-ci reste null si les tableaux n'ont pas pu être chargés, toutes les
// colonnes sont alors proposées
const boards = ref<Board[]>([])
const boardId = ref<number | null>(null)
const stageId = ref<number | null>(null)
const templates = ref<ChecklistTemplate[]>([])
const templateId = ref<number | null>(null)
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
 * Colonnes proposées, celles du tableau choisi dans leur ordre (toutes si les
 * tableaux n'ont pas pu être chargés)
 */
const stages = computed(() =>
  boardId.value === null
    ? [...stageStore.getAllStages].sort((a, b) => a.position - b.position || a.id - b.id)
    : stageStore.getStagesOfBoard(boardId.value),
)

// Changer de tableau présélectionne sa première colonne
watch(boardId, () => {
  stageId.value = stages.value[0]?.id ?? null
})

/**
 * Colonnes, chargées en parallèle des tableaux. Sans elles, la tâche peut
 * encore être ajoutée, car le serveur la met dans la première colonne.
 * @returns Vrai si les colonnes sont chargées
 */
async function loadStages(): Promise<boolean> {
  try {
    await stageStore.loadAllStages()
    return true
  } catch (err) {
    logger.error('Ajout rapide : colonnes non chargées, la tâche ira dans la première colonne', err)
    return false
  }
}

/**
 * Tableaux, chargés en parallèle des colonnes. Sans eux, toutes les colonnes
 * sont proposées, comme avant les tableaux.
 * @returns Vrai si les tableaux sont chargés
 */
async function loadBoards(): Promise<boolean> {
  try {
    await boardStore.loadAllBoards()
    return true
  } catch (err) {
    logger.error('Ajout rapide : tableaux non chargés, toutes les colonnes sont proposées', err)
    return false
  }
}

/**
 * Tableaux et colonnes proposés, avec la présélection du dernier tableau
 * affiché dans la fenêtre principale (paramètre `lastBoardId`, relu à chaque
 * ouverture car la fenêtre est recréée), puis de sa première colonne. Un
 * tableau sans colonne n'est pas proposé, le premier qui en a une le remplace.
 */
async function loadPlaces() {
  const [stagesLoaded, boardsLoaded] = await Promise.all([loadStages(), loadBoards(), settings.whenLoaded()])
  if (!stagesLoaded) return

  if (boardsLoaded) {
    boards.value = boardStore.getAllBoards.filter((board) => stageStore.getStagesOfBoard(board.id).length)
    const preferred = boards.value.find((board) => board.id === boardStore.current?.id) ?? boards.value[0]
    boardId.value = preferred?.id ?? null
  }
  stageId.value = stages.value[0]?.id ?? null
}

/**
 * Modèles de checklist proposés, ceux qui ont au moins un point. Sans eux, la
 * tâche s'ajoute sans checklist, comme avant.
 */
async function loadTemplates() {
  try {
    await templateStore.loadAllTemplates()
    templates.value = templateStore.getAllTemplates.filter((template) => template.items.length)
  } catch (err) {
    logger.error('Ajout rapide : modèles de checklist non chargés, choix masqué', err)
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
    const task = await taskStore.quickAddTask(value, stageId.value ?? undefined, templateId.value ?? undefined)
    globalThis.quickAdd.notifyCreated(task)
    close()
  } catch (err) {
    error.value = httpStatus(err) === 409 ? t('quickAdd.noStage') : t('quickAdd.failed')
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
  loadPlaces()
  loadTemplates()
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

/* Pastille et nom d'un tableau, dans son bouton */
.quick-add-board {
  @apply inline-flex items-center gap-1.5;
}

.quick-add-muted {
  color: var(--p-text-muted-color);
}

.quick-add-error {
  color: var(--p-red-500);
}
</style>
