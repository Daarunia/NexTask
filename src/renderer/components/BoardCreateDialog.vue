<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :show-header="false"
    class="board-create-dialog"
    :aria-label="t('boards.create.title')"
    @show="onShow"
  >
    <form data-testid="board-create-dialog" class="flex flex-col gap-3.5 pt-4" @submit.prevent="create">
      <div class="-mt-2 flex items-center justify-between gap-2">
        <span class="dialog-heading">{{ t('boards.create.title') }}</span>
        <Button
          type="button"
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="t('task.dialog.close')"
          @click="visible = false"
        />
      </div>

      <!-- Nom, obligatoire et unique sans tenir compte de la casse -->
      <div class="flex flex-col gap-1">
        <label :for="nameId" class="field-label">{{ t('boards.create.nameLabel') }}</label>
        <InputText
          :id="nameId"
          ref="nameInput"
          v-model="name"
          data-testid="board-create-name"
          spellcheck="false"
          autocomplete="off"
          :placeholder="t('boards.create.namePlaceholder')"
          :maxlength="BOARD_NAME_MAX_LENGTH"
          :invalid="!!nameError"
          :aria-describedby="nameError ? errorId : undefined"
          @input="nameError = ''"
        />
        <span v-if="nameError" :id="errorId" data-testid="board-create-name-error" class="field-error">
          {{ nameError }}
        </span>
      </div>

      <!-- Couleur facultative, palette des tags -->
      <div class="flex flex-col gap-1.5">
        <span :id="colorLabelId" class="field-label">{{ t('boards.create.colorLabel') }}</span>
        <fieldset class="swatches" :aria-labelledby="colorLabelId">
          <button
            v-for="option in colorOptions"
            :key="option ?? 'none'"
            type="button"
            data-testid="board-create-color"
            :data-color="option ?? 'none'"
            :class="['sw', { on: color === option }]"
            :aria-pressed="color === option"
            :aria-label="option ? t(`tagColors.${option}`) : t('board.noColor')"
            :title="option ? t(`tagColors.${option}`) : t('board.noColor')"
            @click="color = option"
          >
            <BoardDot :color="option" />
          </button>
        </fieldset>
      </div>

      <!-- Colonnes de départ, le tableau à copier se choisit dans sa ligne -->
      <div class="flex flex-col gap-1.5">
        <span :id="modeLabelId" class="field-label">{{ t('boards.create.columnsLabel') }}</span>
        <div class="radios" role="radiogroup" :aria-labelledby="modeLabelId">
          <div
            v-for="option in BOARD_COLUMNS_MODES"
            :key="option"
            data-testid="board-create-mode"
            :data-mode="option"
            :class="['radio', { on: mode === option }]"
            @click="mode = option"
          >
            <RadioButton v-model="mode" :inputId="`${modeLabelId}-${option}`" :value="option" :name="modeLabelId" />
            <div class="radio-text">
              <label :for="`${modeLabelId}-${option}`">{{ t(`boards.create.modes.${option}`) }}</label>
              <small>{{ t(`boards.create.modeHints.${option}`) }}</small>
              <Select
                v-if="option === 'copy' && mode === 'copy'"
                v-model="copyFromId"
                data-testid="board-create-copy-from"
                class="copy-from"
                size="small"
                :options="boards"
                optionLabel="name"
                optionValue="id"
                :aria-label="t('boards.create.copyFrom')"
              >
                <template #option="{ option: board }">
                  <span class="flex min-w-0 items-center gap-2">
                    <BoardDot :color="board.color" />
                    <span class="truncate">{{ board.name }}</span>
                  </span>
                </template>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-0.5">
        <span class="flex-1"></span>
        <Button
          type="button"
          :label="t('common.cancel')"
          data-testid="btn-board-create-cancel"
          severity="secondary"
          text
          @click="visible = false"
        />
        <Button
          type="submit"
          :label="t('boards.create.submit')"
          data-testid="btn-board-create-confirm"
          :loading="saving"
        />
      </div>
    </form>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import { useI18n } from 'vue-i18n'
import BoardDot from './BoardDot.vue'
import { useBoardStore } from '../stores/Board'
import type { Board, BoardColumns } from '../types/board.types'
import { httpStatus } from '../utils/api.helper'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { BOARD_COLUMNS_MODES, BOARD_NAME_MAX_LENGTH, type BoardColumnsMode } from '../../main/shared/board.constants'
import { boardKey } from '../../main/shared/board.helper'
import { TAG_COLORS, type TagColor } from '../../main/shared/tag.constants'

/**
 * Création d'un tableau depuis le sélecteur de l'en-tête. Nom, couleur
 * facultative et colonnes de départ (par défaut, copiées d'un tableau ou
 * aucune). Le tableau créé devient le tableau affiché.
 *
 * Ouvert avec `preset`, il sert aussi à « Dupliquer les colonnes » d'un
 * tableau, mode copie et nom prérempli.
 */

/** Valeurs proposées à l'ouverture du dialogue. */
export interface BoardCreatePreset {
  name: string
  color: TagColor | null
  mode: BoardColumnsMode
  fromBoardId: number // tableau à copier en mode copie
}

const props = defineProps<{
  preset: BoardCreatePreset // valeurs de départ, relues à chaque ouverture
}>()

const visible = defineModel<boolean>('visible', { required: true })

const { t } = useI18n()
const logger = getLogger()
const boardStore = useBoardStore()
const showError = useErrorToast()
const nameId = useId()
const errorId = useId()
const colorLabelId = useId()
const modeLabelId = useId()

// Sans couleur d'abord, puis la palette des tags
const colorOptions: (TagColor | null)[] = [null, ...TAG_COLORS]

const nameInput = ref<{ $el: HTMLInputElement } | null>(null)
const name = ref('')
const nameError = ref('')
const color = ref<TagColor | null>(null)
const mode = ref<BoardColumnsMode>('default')
const copyFromId = ref<number | null>(null)
const saving = ref(false)

const boards = computed(() => boardStore.getAllBoards)

// Valeurs de départ reprises à chaque ouverture, la saisie précédente est oubliée
watch(
  visible,
  (open) => {
    if (!open) return
    name.value = props.preset.name
    color.value = props.preset.color
    mode.value = props.preset.mode
    copyFromId.value = props.preset.fromBoardId
    nameError.value = ''
  },
  { immediate: true },
)

/**
 * Dialogue affiché, le focus va au nom, tout sélectionné pour être remplacé d'une frappe
 */
function onShow() {
  nameInput.value?.$el.focus()
  nameInput.value?.$el.select()
}

/**
 * Motif de refus du nom, vide s'il est valable. Le serveur reste juge (409).
 * @param clean Nom nettoyé
 */
function nameProblem(clean: string): string {
  if (!clean) return t('boards.create.nameRequired')
  const key = boardKey(clean)
  return boards.value.some((board) => boardKey(board.name) === key) ? t('boards.create.nameTaken') : ''
}

/**
 * Colonnes demandées au serveur, le tableau à copier en mode copie seulement
 */
function columns(): BoardColumns {
  return mode.value === 'copy' && copyFromId.value !== null
    ? { mode: 'copy', fromBoardId: copyFromId.value }
    : { mode: mode.value === 'copy' ? 'default' : mode.value }
}

/**
 * Crée le tableau, referme le dialogue et affiche le nouveau tableau. Un nom
 * déjà pris garde le dialogue ouvert, l'erreur sous le champ.
 */
async function create() {
  if (saving.value) return
  const clean = name.value.trim()
  nameError.value = nameProblem(clean)
  if (nameError.value) return

  saving.value = true
  let board: Board
  try {
    board = await boardStore.createBoard(clean, color.value, columns())
  } catch (error) {
    if (httpStatus(error) === 409) {
      nameError.value = t('boards.create.nameTaken')
    } else {
      logger.error('Erreur lors de la création du tableau depuis le sélecteur :', error)
      showError(t('boards.create.failed'))
    }
    return
  } finally {
    saving.value = false
  }

  visible.value = false
  boardStore.select(board.id)
}
</script>

<style scoped>
@reference "tailwindcss";

.dialog-heading {
  font-size: 17px;
  font-weight: 600;
  color: var(--p-text-color);
}

.field-label {
  font-size: 13px;
  color: var(--p-text-muted-color);
}

.field-error {
  font-size: 12.5px;
  color: var(--p-red-600);
}

.app-dark .field-error {
  color: var(--p-red-400);
}

.swatches {
  @apply flex flex-wrap gap-2 m-0 p-0 border-0 min-w-0;
}

/* Pastille de 18 px dans un rond de 24 px, cerclé à la couleur d'accent si choisie */
.sw {
  @apply grid cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0;
  width: 24px;
  height: 24px;
}

.sw :deep(.board-dot) {
  width: 18px;
  height: 18px;
}

.sw.on {
  box-shadow: 0 0 0 2px var(--p-primary-color);
}

.sw:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.radios {
  @apply flex flex-col gap-1.5;
}

/* Choix des colonnes en cartes, la carte choisie teintée */
.radio {
  @apply flex cursor-pointer items-start gap-2.5 rounded-lg;
  padding: 9px 10px;
  border: 1px solid var(--p-form-field-border-color);
  color: var(--p-text-color);
}

.radio.on {
  border-color: var(--p-primary-color);
  background-color: var(--p-highlight-background);
}

.radio-text {
  @apply flex min-w-0 flex-1 flex-col;
}

.radio-text label {
  font-size: 14px;
  cursor: pointer;
}

.radio-text small {
  font-size: 12.5px;
  color: var(--p-text-muted-color);
}

.copy-from {
  @apply mt-1.5 self-start;
  max-width: 100%;
  min-width: 12rem;
}
</style>

<style>
/* Largeur de la maquette, dans la limite de l'écran */
.board-create-dialog.p-dialog {
  width: 470px;
  max-width: calc(100vw - 2rem);
}
</style>
