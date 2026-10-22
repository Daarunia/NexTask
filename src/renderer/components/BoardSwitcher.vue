<template>
  <!-- Tableau affiché, un clic ouvre la liste des tableaux -->
  <button
    v-if="current"
    ref="button"
    type="button"
    class="switcher"
    data-testid="board-switcher"
    :data-board-id="current.id"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-label="t('boards.switcherLabel', { name: current.name })"
    @click="toggle"
  >
    <BoardDot :color="current.color" />
    <span data-testid="board-switcher-name" class="switcher-name">{{ current.name }}</span>
    <i class="pi pi-chevron-down switcher-chevron" aria-hidden="true"></i>
  </button>

  <!-- Le Popover porte déjà le rôle dialog, il reçoit ici son nom accessible -->
  <Popover ref="popover" class="board-pop" :aria-label="t('boards.title')" @show="onShow" @hide="open = false">
    <div class="pop" data-testid="board-switcher-menu">
      <div class="pop-title" aria-hidden="true">{{ t('boards.title') }}</div>

      <div ref="list" class="pop-list" role="menu" :aria-label="t('boards.title')" @keydown="onListKeydown">
        <button
          v-for="(board, index) in boards"
          :key="board.id"
          type="button"
          role="menuitem"
          data-testid="board-row"
          :data-board-id="board.id"
          :class="['board-row', { current: board.id === current?.id }]"
          :aria-current="board.id === current?.id ? 'true' : undefined"
          @click="choose(board.id)"
        >
          <BoardDot :color="board.color" />
          <span data-testid="board-row-name" class="board-row-name">{{ board.name }}</span>
          <span
            data-testid="board-row-count"
            class="n"
            :title="t('boards.taskCount', { count: boardStore.taskCount(board.id) }, boardStore.taskCount(board.id))"
          >
            {{ boardStore.taskCount(board.id) }}
          </span>
          <kbd v-if="index < BOARD_SHORTCUT_COUNT" class="kb">{{ t('boards.shortcut', { key: index + 1 }) }}</kbd>
        </button>
      </div>

      <hr class="pop-sep" />
      <button type="button" class="pop-link" data-testid="board-new" @click="openCreate()">
        <i class="pi pi-plus" aria-hidden="true"></i>
        {{ t('boards.newBoard') }}
      </button>
    </div>
  </Popover>

  <BoardCreateDialog v-model:visible="createVisible" :preset="createPreset" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Popover from 'primevue/popover'
import { useI18n } from 'vue-i18n'
import BoardDot from './BoardDot.vue'
import BoardCreateDialog, { type BoardCreatePreset } from './BoardCreateDialog.vue'
import { useBoardStore } from '../stores/Board'
import { BOARD_SHORTCUT_COUNT } from '../../main/shared/board.constants'
import { isInOverlay } from '../utils/keyboard.helper'

const boardStore = useBoardStore()
const { t } = useI18n()

const button = ref<HTMLButtonElement | null>(null)
const popover = ref<InstanceType<typeof Popover> | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)

// Dialogue de création, et ses valeurs de départ
const createVisible = ref(false)
const createPreset = ref<BoardCreatePreset>({ name: '', color: null, mode: 'default', fromBoardId: 0 })

// Tableaux dans l'ordre choisi, et tableau affiché (null avant le chargement)
const boards = computed(() => boardStore.getAllBoards)
const current = computed(() => boardStore.current)

/**
 * Ouvre ou ferme la liste des tableaux, sous le bouton.
 * @param event Clic sur le bouton
 */
function toggle(event: MouseEvent) {
  popover.value?.toggle(event)
}

/**
 * Liste ouverte, le focus va sur la ligne du tableau affiché.
 */
function onShow() {
  open.value = true
  void nextTick(() =>
    rows()
      .find((row) => row.getAttribute('aria-current') === 'true')
      ?.focus(),
  )
}

/** Lignes de la liste ouverte, dans l'ordre affiché. */
function rows(): HTMLElement[] {
  return [...(list.value?.querySelectorAll<HTMLElement>('[data-testid="board-row"]') ?? [])]
}

/**
 * Flèches haut et bas d'une ligne à l'autre (en boucle), Début et Fin vers la
 * première et la dernière. Entrée sélectionne (clic du bouton), Échap ferme et
 * rend le focus au bouton (géré par le Popover).
 * @param event Touche pressée dans la liste
 */
function onListKeydown(event: KeyboardEvent) {
  const items = rows()
  if (!items.length) return

  const index = items.indexOf(document.activeElement as HTMLElement)
  const target = {
    ArrowDown: (index + 1) % items.length,
    ArrowUp: (index - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[event.key]
  if (target === undefined) return

  event.preventDefault()
  items[target].focus()
}

/**
 * Affiche un tableau, puis ferme la liste et rend le focus au bouton.
 * @param id Id du tableau
 */
function choose(id: number) {
  popover.value?.hide()
  void boardStore.select(id)
  button.value?.focus()
}

/**
 * Ferme la liste et ouvre le dialogue de création, vide par défaut (colonnes
 * par défaut, copie proposée depuis le tableau affiché).
 * @param preset Valeurs de départ du dialogue
 */
function openCreate(preset?: BoardCreatePreset) {
  popover.value?.hide()
  createPreset.value = preset ?? { name: '', color: null, mode: 'default', fromBoardId: current.value?.id ?? 0 }
  createVisible.value = true
}

/**
 * Ctrl+1 à Ctrl+9 affichent les neuf premiers tableaux, sans ouvrir la liste.
 * La touche se lit par son code, car sur un clavier AZERTY Ctrl+1 donne « & ».
 * Ignorés avec Alt, Maj ou Méta, et dans un dialogue ou un menu ouvert (la
 * liste des tableaux comprise).
 * @param event Touche pressée
 */
function onGlobalKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.defaultPrevented) return

  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
  if (!digit || isInOverlay(event.target) || isInOverlay(document.activeElement)) return

  event.preventDefault()
  const board = boards.value[Number(digit) - 1]
  if (board && board.id !== current.value?.id) void boardStore.select(board.id)
}

// Écouteur posé tant que le sélecteur est affiché, donc sur la page du tableau seulement
onMounted(() => globalThis.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onGlobalKeydown))
</script>

<style scoped>
@reference "tailwindcss";

.switcher {
  @apply inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-md;
  height: 34px;
  max-width: 240px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--p-form-field-border-color);
  background: var(--p-form-field-background);
  color: var(--p-text-color);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  transition: border-color 0.15s;
}

.switcher:hover,
.switcher[aria-expanded='true'] {
  border-color: var(--p-primary-color);
}

.switcher:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.switcher-name {
  @apply min-w-0 truncate;
}

.switcher-chevron {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

/* Contenu du popover (rendu dans le body, le style scoped s'applique au contenu du slot) */
.pop {
  @apply flex flex-col;
  width: 278px; /* 290 px avec la marge intérieure du popover */
}

.pop-title {
  padding: 6px 8px 4px;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.pop-list {
  @apply flex flex-col overflow-y-auto;
  max-height: 22rem;
}

.board-row {
  @apply flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent text-left;
  padding: 7px 6px 7px 8px;
  font: inherit;
  font-size: 14px;
  color: var(--p-text-color);
}

.board-row:hover,
.board-row:focus-visible {
  background-color: var(--p-content-hover-background);
  outline: none;
}

.board-row.current {
  background-color: var(--p-highlight-background);
}

.board-row.current .board-row-name {
  color: var(--p-primary-color);
  font-weight: 600;
}

/* Ligne courante au clavier, le fond teinté est déjà pris */
.board-row.current:focus-visible {
  box-shadow: inset 0 0 0 1px var(--p-primary-color);
}

.board-row-name {
  @apply min-w-0 flex-1 truncate;
}

.n {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.pop-sep {
  border: 0;
  border-top: 1px solid var(--p-content-border-color);
  margin: 4px 2px;
}

/* Entrée « Nouveau tableau », en lien d'accent */
.pop-link {
  @apply flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent text-left;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  color: var(--p-primary-color);
}

.pop-link .pi {
  font-size: 0.75rem;
}

.pop-link:hover,
.pop-link:focus-visible {
  background-color: var(--p-highlight-background);
  outline: none;
}

.kb {
  font: inherit;
  font-size: 11px;
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-form-field-border-color);
  border-radius: 4px;
  padding: 0 4px;
}
</style>

<style>
/* Popover des tableaux, ajouté au body, sans flèche, collé au bouton, bordure
   et ombre de la maquette */
.board-pop.p-popover {
  margin-top: 4px;
  border-color: var(--p-content-border-color);
  border-radius: 8px;
  box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.45);
}

.board-pop.p-popover-flipped {
  margin-top: -4px;
}

.board-pop.p-popover::before,
.board-pop.p-popover::after {
  display: none;
}

.board-pop .p-popover-content {
  padding: 6px;
}
</style>
