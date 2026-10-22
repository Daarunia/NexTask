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

  <!-- Le Popover porte déjà le rôle dialog, il reçoit ici son nom accessible. Échap et le
       clic ailleurs sont gérés ici, pour qu'Échap ferme d'abord un renommage, le menu ⋯ ou
       une confirmation, et qu'un clic dans ces deux derniers laisse la liste ouverte. -->
  <Popover
    ref="popover"
    class="board-pop"
    :aria-label="t('boards.title')"
    :dismissable="false"
    :close-on-escape="false"
    @show="onShow"
    @hide="onHide"
  >
    <div class="pop" data-testid="board-switcher-menu" @keydown.esc="onEscape">
      <div class="pop-title" aria-hidden="true">{{ t('boards.title') }}</div>

      <div ref="list" class="pop-list" role="menu" :aria-label="t('boards.title')" @keydown="onListKeydown">
        <!-- Ordre par glisser-déposer sur la poignée, figé pendant un renommage. Ligne entière
             cliquable, sa poignée et son ⋯ gardent leur propre action. -->
        <draggable
          :list="local"
          itemKey="id"
          v-bind="DND_OPTIONS"
          handle=".board-grip"
          :disabled="editingId !== null"
          class="flex flex-col"
          @start="setDragging(true)"
          @end="onDragEnd"
        >
          <template #item="{ element: board, index }">
            <div
              role="menuitem"
              tabindex="0"
              data-testid="board-row"
              :data-board-id="board.id"
              :class="[
                'board-row',
                { current: board.id === current?.id, 'menu-open': menuBoard?.id === board.id && menuOpen },
              ]"
              :aria-current="board.id === current?.id ? 'true' : undefined"
              @click="onRowClick($event, board)"
              @keydown.enter.self.prevent="choose(board.id)"
              @keydown.space.self.prevent="choose(board.id)"
            >
              <span
                class="board-grip"
                data-testid="board-row-grip"
                data-row-control
                :title="t('boards.moveBoard', { name: board.name })"
              >
                <i class="pi pi-bars" aria-hidden="true"></i>
              </span>
              <BoardDot :color="board.color" />

              <!-- Renommage en place, Entrée enregistre, Échap annule -->
              <input
                v-if="editingId === board.id"
                :ref="setRenameInput"
                v-model="editedName"
                data-testid="board-row-rename"
                class="board-rename"
                spellcheck="false"
                autocomplete="off"
                :maxlength="BOARD_NAME_MAX_LENGTH"
                :aria-label="t('boards.renameLabel', { name: board.name })"
                :aria-invalid="renameInvalid || undefined"
                @input="renameInvalid = false"
                @keydown.enter.prevent.stop="commitRename(board)"
                @keydown.esc.prevent.stop="finishRename()"
                @blur="onRenameBlur(board)"
              />
              <template v-else>
                <span data-testid="board-row-name" class="board-row-name">{{ board.name }}</span>
                <span
                  data-testid="board-row-count"
                  class="n"
                  :title="
                    t('boards.taskCount', { count: boardStore.taskCount(board.id) }, boardStore.taskCount(board.id))
                  "
                >
                  {{ boardStore.taskCount(board.id) }}
                </span>
                <kbd v-if="index < BOARD_SHORTCUT_COUNT" class="kb">{{ t('boards.shortcut', { key: index + 1 }) }}</kbd>
                <button
                  type="button"
                  data-testid="board-row-menu"
                  data-row-control
                  class="more"
                  aria-haspopup="menu"
                  :aria-expanded="menuBoard?.id === board.id && menuOpen"
                  :aria-label="t('boards.menu.label', { name: board.name })"
                  @click="toggleRowMenu($event, board)"
                >
                  <i class="pi pi-ellipsis-h" aria-hidden="true"></i>
                </button>
              </template>
            </div>
          </template>
        </draggable>
      </div>

      <hr class="pop-sep" />
      <button type="button" class="pop-link" data-testid="board-new" @click="openCreate()">
        <i class="pi pi-plus" aria-hidden="true"></i>
        {{ t('boards.newBoard') }}
      </button>
    </div>
  </Popover>

  <!-- Actions d'un tableau, ouvertes par le ⋯ de sa ligne. Un clic dans ce menu laisse la
       liste ouverte (cf. onDocumentClick). -->
  <TieredMenu
    ref="rowMenu"
    :model="rowMenuItems"
    popup
    class="board-row-menu"
    data-testid="board-menu"
    :pt="rowMenuPt"
    @show="menuOpen = true"
    @hide="menuOpen = false"
  />

  <BoardCreateDialog v-model:visible="createVisible" :preset="createPreset" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import Popover from 'primevue/popover'
import TieredMenu from 'primevue/tieredmenu'
import type { MenuItem } from 'primevue/menuitem'
import draggable from 'vuedraggable'
import { useI18n } from 'vue-i18n'
import BoardDot from './BoardDot.vue'
import BoardCreateDialog, { type BoardCreatePreset } from './BoardCreateDialog.vue'
import { useBoardStore } from '../stores/Board'
import { useStageStore } from '../stores/Stage'
import type { Board } from '../types/board.types'
import { BOARD_NAME_MAX_LENGTH, BOARD_SHORTCUT_COUNT } from '../../main/shared/board.constants'
import { boardKey } from '../../main/shared/board.helper'
import { duplicateName } from '../../main/shared/checklistTemplate.helper'
import type { TagColor } from '../../main/shared/tag.constants'
import { TAG_COLOR_STYLES, getTagColorStyle } from '../constants/tag.constants'
import { DND_OPTIONS } from '../constants/dnd.constants'
import { setDragging } from '../utils/dnd.helper'
import { httpStatus } from '../utils/api.helper'
import { isEditableTarget, isInOverlay } from '../utils/keyboard.helper'
import { getLogger } from '../utils/logger'
import { useErrorToast, useInfoToast } from '../utils/toast.helper'
import { useDangerConfirm } from '../utils/confirm.helper'

const boardStore = useBoardStore()
const { t } = useI18n()
const logger = getLogger()
const showError = useErrorToast()
const showInfo = useInfoToast()
const confirmDanger = useDangerConfirm()
const stageStore = useStageStore()

const button = ref<HTMLButtonElement | null>(null)
const popover = ref<InstanceType<typeof Popover> | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)

// Menu ⋯ d'une ligne, une seule instance pour toutes les lignes
const rowMenu = ref<InstanceType<typeof TieredMenu> | null>(null)
const menuBoard = ref<Board | null>(null) // tableau de la ligne dont le menu est ouvert
const menuOpen = ref(false)
let menuTrigger: HTMLElement | null = null // ⋯ du menu ouvert, ancre de la confirmation de suppression

// Renommage en place
const editingId = ref<number | null>(null)
const editedName = ref('')
const renameInvalid = ref(false)
let renameInput: HTMLInputElement | null = null

// Dialogue de création, et ses valeurs de départ
const createVisible = ref(false)
const createPreset = ref<BoardCreatePreset>({ name: '', color: null, mode: 'default', fromBoardId: 0 })

// Tableaux dans l'ordre choisi, et tableau affiché (null avant le chargement)
const boards = computed(() => boardStore.getAllBoards)
const current = computed(() => boardStore.current)

// Copie locale de la liste, que vuedraggable réordonne sur place
const local = ref<Board[]>([])
watch(
  boards,
  (all) => {
    local.value = [...all]
  },
  { immediate: true },
)

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
  document.addEventListener('click', onDocumentClick)
  void nextTick(() =>
    rows()
      .find((row) => row.getAttribute('aria-current') === 'true')
      ?.focus(),
  )
}

/**
 * Liste fermée, un renommage en cours est abandonné (la perte de focus qui
 * précède un clic ailleurs l'a déjà enregistré).
 */
function onHide() {
  open.value = false
  editingId.value = null
  document.removeEventListener('click', onDocumentClick)
}

/**
 * Un clic hors de la liste la ferme, sauf sur le bouton (qui la referme
 * lui-même), dans le menu ⋯ ou dans la confirmation de suppression, ajoutés
 * au body. Le chemin de l'événement est celui du clic, même si l'entrée
 * cliquée a déjà disparu (menu refermé par son entrée).
 * @param event Clic dans la fenêtre
 */
function onDocumentClick(event: MouseEvent) {
  const inside = event
    .composedPath()
    .some(
      (node) =>
        node === button.value ||
        (node instanceof Element && node.matches('.board-pop, .board-row-menu, .p-confirmpopup')),
    )
  if (!inside) popover.value?.hide()
}

/**
 * Échap dans la liste, hors renommage (qui l'arrête), la ferme et rend le
 * focus au bouton. Le menu ⋯ et la confirmation, ajoutés au body, gardent
 * leur Échap.
 */
function onEscape() {
  popover.value?.hide()
  button.value?.focus()
}

/** Lignes de la liste ouverte, dans l'ordre affiché. */
function rows(): HTMLElement[] {
  return [...(list.value?.querySelectorAll<HTMLElement>('[data-testid="board-row"]') ?? [])]
}

/**
 * Ligne d'un tableau dans la liste ouverte.
 * @param id Id du tableau
 */
function rowOf(id: number): HTMLElement | undefined {
  return rows().find((row) => row.dataset.boardId === String(id))
}

/**
 * Flèches haut et bas d'une ligne à l'autre (en boucle), Début et Fin vers la
 * première et la dernière, depuis une ligne ou son ⋯. Entrée et Espace
 * sélectionnent (cf. la ligne). Ignorées pendant un renommage.
 * @param event Touche pressée dans la liste
 */
function onListKeydown(event: KeyboardEvent) {
  const items = rows()
  if (!items.length || isEditableTarget(event.target)) return

  const index = items.findIndex((row) => row.contains(document.activeElement))
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
 * Clic sur une ligne, qui affiche son tableau. Ignoré sur ses boutons et
 * pendant son renommage.
 * @param event Clic
 * @param board Tableau de la ligne
 */
function onRowClick(event: MouseEvent, board: Board) {
  if (editingId.value === board.id) return
  if ((event.target as Element).closest('[data-row-control]')) return
  choose(board.id)
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
 * Fin d'un glisser-déposer. Les positions changées sont appliquées tout de
 * suite (Ctrl+1 à Ctrl+9 suivent le nouvel ordre), puis enregistrées. Un
 * échec remet l'ordre précédent et prévient par un toast.
 */
async function onDragEnd() {
  setDragging(false)

  const previous = new Map(boards.value.map((board) => [board.id, board.position]))
  const moves = local.value
    .map((board, position) => ({ board, position }))
    .filter(({ board, position }) => board.position !== position)
  if (!moves.length) return

  for (const { board, position } of moves) board.position = position

  try {
    await boardStore.reorderBoards(moves.map(({ board, position }) => ({ id: board.id, position })))
  } catch {
    for (const { board } of moves) board.position = previous.get(board.id) ?? board.position
    local.value = [...boards.value]
    showError(t('boards.reorderFailed'))
  }
}

/**
 * Ouvre ou ferme le menu ⋯ d'une ligne, ancré sur son bouton.
 * @param event Clic sur le ⋯
 * @param board Tableau de la ligne
 */
function toggleRowMenu(event: MouseEvent, board: Board) {
  menuBoard.value = board
  menuTrigger = event.currentTarget as HTMLElement
  rowMenu.value?.toggle(event)
}

/**
 * Titre (infobulle) d'une entrée du menu ⋯, posé sur son élément de liste.
 * Sert à expliquer une entrée désactivée.
 */
const rowMenuPt = {
  item: ({ context }: { context: { item: MenuItem } }) => ({ title: context.item.title }),
}

/**
 * Entrées du menu ⋯ pour le tableau de la ligne. Calculé pour suivre la
 * langue de l'interface. Les actions qui posent le focus attendent la
 * fermeture du menu, qui rendrait sinon le focus à son bouton.
 */
const rowMenuItems = computed<MenuItem[]>(() => {
  const board = menuBoard.value
  if (!board) return []
  const last = boards.value.length <= 1

  return [
    {
      label: t('boards.menu.rename'),
      icon: 'pi pi-pencil',
      command: () => setTimeout(() => startRename(board)),
    },
    {
      label: t('boards.menu.color'),
      // Pastille à la couleur du tableau, cercle vide sans couleur
      icon: board.color ? 'pi pi-circle-fill' : 'pi pi-circle',
      class: board.color ? 'menu-swatch-option' : undefined,
      style: board.color ? { '--swatch': getTagColorStyle(board.color).swatch } : undefined,
      items: [
        {
          label: t('board.noColor'),
          icon: 'pi pi-ban',
          class: board.color ? undefined : 'menu-option-current',
          command: () => setColor(board, null),
        },
        ...TAG_COLOR_STYLES.map((color) => ({
          label: t(`tagColors.${color.name}`),
          icon: 'pi pi-circle-fill',
          class: ['menu-swatch-option', { 'menu-option-current': board.color === color.name }],
          style: { '--swatch': color.swatch },
          command: () => setColor(board, color.name),
        })),
      ],
    },
    {
      label: t('boards.menu.duplicateColumns'),
      icon: 'pi pi-copy',
      command: () => setTimeout(() => duplicateColumns(board)),
    },
    { separator: true },
    {
      label: t('common.delete'),
      icon: 'pi pi-trash',
      class: 'board-menu-danger',
      // Dernier tableau, aucun appel au serveur, l'infobulle explique pourquoi
      disabled: last,
      title: last ? t('boards.menu.lastBoard') : undefined,
      // Après la fermeture du menu, pour que la confirmation ne soit pas refermée aussitôt
      command: () => setTimeout(() => askDelete(board)),
    },
  ]
})

/**
 * Change la couleur d'un tableau, affichée tout de suite et rétablie si
 * l'enregistrement échoue.
 * @param board Tableau
 * @param color Couleur de la palette, `null` pour la retirer
 */
async function setColor(board: Board, color: TagColor | null) {
  const previous = board.color
  if (previous === color) return
  board.color = color

  try {
    await boardStore.setBoardColor(board.id, color)
  } catch {
    board.color = previous
    showError(t('board.colorNotSaved'))
  }
}

/**
 * Ref de fonction du champ de renommage, seul de la liste.
 * @param el Champ monté, `null` au démontage
 */
function setRenameInput(el: Element | ComponentPublicInstance | null) {
  renameInput = el as HTMLInputElement | null
}

/**
 * Passe la ligne d'un tableau en renommage, nom actuel sélectionné.
 * @param board Tableau
 */
function startRename(board: Board) {
  editingId.value = board.id
  editedName.value = board.name
  renameInvalid.value = false
  void nextTick(() => {
    renameInput?.focus()
    renameInput?.select()
  })
}

/**
 * Termine le renommage sans rien enregistrer, et rend le focus à la ligne.
 */
function finishRename() {
  const id = editingId.value
  editingId.value = null
  if (id !== null) void nextTick(() => rowOf(id)?.focus())
}

/**
 * Entrée dans le champ. Un nom vide est refusé (le champ reste ouvert), un
 * nom inchangé termine sans appel au serveur.
 * @param board Tableau renommé
 */
function commitRename(board: Board) {
  if (editingId.value !== board.id) return
  const name = editedName.value.trim()
  if (!name) {
    renameInvalid.value = true
    return
  }
  if (name === board.name) {
    finishRename()
    return
  }
  void saveName(board, name)
}

/**
 * Perte de focus du champ. Enregistre un nom changé, abandonne un nom vide ou
 * inchangé. Ignorée si le renommage est déjà terminé (le retrait du champ,
 * après Entrée ou Échap, peut la déclencher).
 * @param board Tableau renommé
 */
function onRenameBlur(board: Board) {
  if (editingId.value !== board.id) return
  const name = editedName.value.trim()
  if (!name || name === board.name) {
    editingId.value = null
    return
  }
  void saveName(board, name)
}

/**
 * Enregistre le nouveau nom, affiché tout de suite. Un refus du serveur (nom
 * déjà pris, 409) remet l'ancien nom et l'explique dans un toast.
 * @param board Tableau renommé
 * @param name Nouveau nom, nettoyé
 */
async function saveName(board: Board, name: string) {
  const previous = board.name
  board.name = name
  finishRename()

  try {
    await boardStore.renameBoard(board.id, name)
  } catch (error) {
    board.name = previous
    if (httpStatus(error) === 409) {
      showError(t('board.renameCanceled'), t('boards.create.nameTaken'))
    } else {
      logger.error(`Erreur lors du renommage du tableau ${board.id} depuis le sélecteur :`, error)
      showError(t('board.renameCanceled'))
    }
  }
}

/**
 * « Dupliquer les colonnes », le dialogue de création en mode copie de ce
 * tableau, avec sa couleur et le nom « Nom (copie) », numéroté s'il est pris.
 * @param board Tableau dont les colonnes sont copiées
 */
function duplicateColumns(board: Board) {
  const taken = new Set(boards.value.map((b) => boardKey(b.name)))
  openCreate({
    name: duplicateName(t('boards.copyName', { name: board.name }), taken, BOARD_NAME_MAX_LENGTH),
    color: board.color,
    mode: 'copy',
    fromBoardId: board.id,
  })
}

/**
 * « Supprimer », après confirmation dans une bulle ancrée sur le ⋯ de la
 * ligne, qui donne le nombre de colonnes supprimées et de tâches archivées.
 * @param board Tableau à supprimer
 */
function askDelete(board: Board) {
  const stages = stageStore.getStagesOfBoard(board.id).length
  const tasks = boardStore.taskCount(board.id)

  confirmDanger({
    target: menuTrigger ?? undefined,
    message: t('boards.deleteConfirm', {
      name: board.name,
      stages: t('boards.deleteConfirmStages', { count: stages }, stages),
      tasks: t('boards.deleteConfirmTasks', { count: tasks }, tasks),
    }),
    acceptLabel: t('common.delete'),
    accept: () => deleteBoard(board),
  })
}

/**
 * Supprime un tableau, ses tâches actives étant archivées par le serveur. Le
 * premier tableau restant est affiché si c'était le tableau affiché. Pas
 * d'annulation, un toast dit où sont passées les tâches.
 * @param board Tableau à supprimer
 */
async function deleteBoard(board: Board) {
  try {
    const archived = await boardStore.deleteBoard(board.id)
    showInfo(t('boards.deleted'), t('boards.deletedDetail', { count: archived }, archived))
  } catch (error) {
    logger.error(`Erreur lors de la suppression du tableau ${board.id} depuis le sélecteur :`, error)
    showError(t('boards.deleteFailed'))
  }
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
onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('click', onDocumentClick)
})
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
  @apply flex w-full cursor-pointer items-center gap-2.5 rounded-md text-left;
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

/* Poignée visible au survol de la ligne */
.board-grip {
  @apply flex shrink-0 cursor-grab opacity-0;
  margin-left: -4px;
  color: var(--p-text-muted-color);
}

.board-grip .pi {
  font-size: 0.75rem;
}

.board-row:hover .board-grip {
  opacity: 0.8;
}

/* Emplacement de dépôt et ligne tenue pendant un glisser-déposer */
.board-row.dnd-ghost {
  background-color: var(--p-highlight-background);
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
}

.board-row.dnd-ghost > * {
  visibility: hidden;
}

.board-row.dnd-dragging {
  background-color: var(--p-content-background);
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.2);
}

/* ⋯ d'une ligne, visible au survol, au focus clavier et menu ouvert */
.more {
  @apply grid shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 opacity-0;
  width: 24px;
  height: 24px;
  color: var(--p-text-muted-color);
}

.more .pi {
  font-size: 0.875rem;
}

.board-row:hover .more,
.board-row:focus-visible .more,
.more:focus-visible,
.board-row.menu-open .more {
  opacity: 1;
}

.more:hover,
.more:focus-visible,
.board-row.menu-open .more {
  background-color: var(--p-content-hover-background);
  color: var(--p-text-color);
  outline: none;
}

/* Champ du renommage en place, à la place du nom */
.board-rename {
  @apply min-w-0 flex-1 bg-transparent outline-none;
  border: 0;
  border-bottom: 1px solid var(--p-primary-color);
  padding: 0;
  height: 24px; /* hauteur du ⋯ remplacé, la ligne ne bouge pas */
  font: inherit;
  color: var(--p-text-color);
}

.board-rename[aria-invalid='true'] {
  border-bottom-color: var(--p-red-600);
}

.app-dark .board-rename[aria-invalid='true'] {
  border-bottom-color: var(--p-red-400);
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

/* « Supprimer » du menu ⋯ en rouge, comme dans la maquette */
.board-row-menu .board-menu-danger:not(.p-disabled) :is(.p-tieredmenu-item-label, .p-tieredmenu-item-icon) {
  color: var(--p-red-600);
}

.app-dark .board-row-menu .board-menu-danger:not(.p-disabled) :is(.p-tieredmenu-item-label, .p-tieredmenu-item-icon) {
  color: var(--p-red-400);
}
</style>
