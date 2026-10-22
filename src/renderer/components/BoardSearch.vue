<template>
  <div ref="root" class="board-search" data-testid="board-search" @focusin="onFocusIn" @focusout="onFocusOut">
    <div :class="['search-box', { 'is-focused': focused }]" @mousedown.self.prevent="input?.focus()">
      <i class="pi pi-search search-icon" aria-hidden="true"></i>

      <!-- Filtres rapides sur l'état des tâches (OU logique) -->
      <span v-for="status in boardFilter.statuses" :key="status" data-testid="search-status-chip" class="status-chip">
        <i :class="STATUS_ICONS[status]" aria-hidden="true"></i>
        <span class="truncate">{{ statusLabel(status) }}</span>
        <button
          type="button"
          data-testid="search-status-chip-remove"
          class="status-chip-remove"
          :aria-label="t('board.statusRemove', { name: statusLabel(status) })"
          @mousedown.prevent
          @click="boardFilter.removeStatus(status)"
        >
          <i class="pi pi-times"></i>
        </button>
      </span>

      <!-- Tags du filtre (OU logique) -->
      <TagChip
        v-for="tagId in boardFilter.tagIds"
        :key="tagId"
        data-testid="search-tag-chip"
        :tagId="tagId"
        size="small"
        removable
        removeTestId="search-tag-chip-remove"
        @remove="removeTag(tagId)"
      />

      <input
        ref="input"
        v-model="text"
        data-testid="search-input"
        class="search-input"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        :aria-label="t('board.searchLabel')"
        :aria-expanded="listOpen && items.length > 0"
        aria-controls="board-search-list"
        :aria-activedescendant="listOpen && activeItem ? optionId(activeItem) : undefined"
        :placeholder="boardFilter.tagIds.length || boardFilter.statuses.length ? '' : t('board.searchPlaceholder')"
        @click="listDismissed = false"
        @keydown="onKeydown"
      />

      <span v-if="!focused && !boardFilter.isActive && !text" class="search-shortcut" aria-hidden="true">
        {{ shortcutLabel }}
      </span>

      <!-- Filtre actif : le DnD est désactivé, expliqué en infobulle -->
      <i
        v-if="boardFilter.isActive"
        v-tooltip.bottom="infoTooltip(t('board.filterDndHint'))"
        data-testid="filter-dnd-hint"
        class="pi pi-lock search-hint"
        :aria-label="t('board.filterDndHint')"
      ></i>

      <button
        v-if="boardFilter.isActive || text"
        type="button"
        data-testid="search-clear"
        class="search-clear"
        :aria-label="t('board.searchClear')"
        @mousedown.prevent
        @click="clearAll"
      >
        <i class="pi pi-times"></i>
      </button>
    </div>

    <!-- Suggestions : recherche texte, tags et tâches correspondants -->
    <div v-if="listOpen" class="search-panel" @mousedown.prevent>
      <!-- Portée, le tableau affiché ou tous les tableaux, s'il y en a plusieurs -->
      <div
        v-if="multiBoard"
        data-testid="search-scope"
        class="search-scope"
        role="group"
        :aria-label="t('boards.searchScope')"
        @keydown.esc.prevent.stop="backToInput"
      >
        <button
          type="button"
          data-testid="search-scope-board"
          :class="['scope-chip', { 'is-on': scope === 'board' }]"
          :aria-pressed="scope === 'board'"
          @mouseenter="titleIfTruncated"
          @click="setScope('board')"
        >
          {{ boardStore.current?.name }}
        </button>
        <button
          type="button"
          data-testid="search-scope-all"
          :class="['scope-chip', { 'is-on': scope === 'all' }]"
          :aria-pressed="scope === 'all'"
          @click="setScope('all')"
        >
          {{ t('boards.allBoards') }}
        </button>
      </div>

      <ul
        v-if="items.length"
        id="board-search-list"
        data-testid="search-list"
        class="search-list"
        role="listbox"
        :aria-label="t('board.searchLabel')"
      >
        <template v-for="(group, groupIndex) in groups" :key="group.kind">
          <li v-if="groupIndex > 0" class="search-separator" role="presentation"></li>
          <li v-if="group.label" class="search-group" role="presentation">{{ group.label }}</li>

          <li
            v-for="item in group.items"
            :id="optionId(item)"
            :key="optionId(item)"
            :data-testid="`search-option-${item.kind}`"
            :class="['search-option', { 'is-active': item === activeItem }]"
            role="option"
            :aria-selected="item === activeItem"
            :aria-label="item.label"
            @mouseenter="activeIndex = items.indexOf(item)"
            @click="choose(item)"
          >
            <template v-if="item.kind === 'text'">
              <i class="pi pi-search option-icon" aria-hidden="true"></i>
              <span class="truncate">{{ t('board.searchText', { query: item.label }) }}</span>
              <span class="option-meta">↵</span>
            </template>

            <template v-else-if="item.kind === 'status'">
              <i :class="[STATUS_ICONS[item.status], 'option-icon']" aria-hidden="true"></i>
              <span class="truncate">{{ item.label }}</span>
              <span class="option-meta">{{ item.count }}</span>
            </template>

            <template v-else-if="item.kind === 'tag'">
              <i class="pi pi-tag option-icon" aria-hidden="true"></i>
              <TagChip :tagId="item.id" size="small" />
            </template>

            <template v-else>
              <i class="pi pi-file option-icon" aria-hidden="true"></i>
              <span class="option-task">
                <span class="truncate">
                  <template v-for="(part, index) in highlightParts(item.label, terms)" :key="index">
                    <mark v-if="part.match">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <span v-if="item.excerpt" class="option-excerpt truncate">
                  <template v-for="(part, index) in highlightParts(item.excerpt, terms)" :key="index">
                    <mark v-if="part.match">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
              </span>
              <!-- Tâche d'un autre tableau, sa pastille et « Tableau · Colonne » -->
              <span v-if="item.board" data-testid="search-option-board" class="option-meta option-place">
                <BoardDot :color="item.board.color" />
                <span class="truncate">{{ item.board.name }} · {{ item.stage }}</span>
              </span>
              <span v-else class="option-meta truncate">{{ item.stage }}</span>
            </template>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TagChip from './TagChip.vue'
import BoardDot from './BoardDot.vue'
import { useBoardFilterStore } from '../stores/BoardFilter'
import { useTaskStore } from '../stores/Task'
import { useBoardStore } from '../stores/Board'
import { useTagStore } from '../stores/Tag'
import { useStageStore } from '../stores/Stage'
import { useErrorToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import { infoTooltip, titleIfTruncated } from '../utils/tooltip.helper'
import {
  highlightParts,
  normalizeSearchText,
  searchTerms,
  taskHasStatus,
  taskMatchesFilter,
  taskMatchExcerpt,
  TASK_STATUSES,
  type TaskStatus,
} from '../utils/search.helper'
import type { Tag } from '../types/tag.types'
import type { Task } from '../types/task.types'
import type { Board } from '../types/board.types'

/**
 * Barre de recherche globale du board, dans l'en-tête.
 *
 * Un seul champ : le texte filtre le board en direct (titre et description),
 * les tags choisis deviennent des chips (OU logique, ET avec le texte). La
 * liste propose de garder la recherche texte, les tags dont le nom correspond
 * et les tâches trouvées (ouvertes au clic). Avec `#`, seuls les tags sont
 * proposés et le board n'est pas filtré sur ce texte.
 *
 * Les filtres rapides (en retard, aujourd'hui, checklist à terminer) sont
 * proposés dès le focus, puis tant que la saisie correspond à leur nom. Ils
 * s'affichent en chips devant celles des tags.
 *
 * Avec plusieurs tableaux, deux puces en tête de la liste choisissent la
 * portée des tâches proposées et des compteurs des filtres rapides, le
 * tableau affiché (par défaut, à chaque ouverture) ou tous les tableaux. Une
 * tâche d'un autre tableau y bascule avant de s'ouvrir. Les tags proposés et
 * le filtre du board ne dépendent pas de la portée.
 */

type SearchItem =
  | { kind: 'text'; label: string }
  | { kind: 'status'; status: TaskStatus; label: string; count: number }
  | { kind: 'tag'; id: number; label: string }
  | { kind: 'task'; id: number; label: string; excerpt: string; stage: string; board: Board | null }

// Délai avant de filtrer le board sur le texte saisi
const SEARCH_DEBOUNCE_MS = 150
// Nombre maximal de tâches proposées
const MAX_TASK_SUGGESTIONS = 5

// Icône de chaque filtre rapide, dans la liste et sur sa chip
const STATUS_ICONS: Record<TaskStatus, string> = {
  overdue: 'pi pi-exclamation-circle',
  today: 'pi pi-calendar',
  upcoming: 'pi pi-calendar-plus',
  checklist: 'pi pi-check-square',
}

const { t } = useI18n()
const boardFilter = useBoardFilterStore()
const taskStore = useTaskStore()
const boardStore = useBoardStore()
const tagStore = useTagStore()
const stageStore = useStageStore()
const showError = useErrorToast()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const text = ref(boardFilter.query)
const focused = ref(false)
const listDismissed = ref(false) // liste fermée par Échap ou un choix, rouverte à la frappe ou au clic
const activeIndex = ref(0)
// Portée des tâches proposées, remise au tableau affiché à chaque ouverture
const scope = ref<'board' | 'all'>('board')

const shortcutLabel = navigator.userAgent.includes('Mac') ? '⌘F' : 'Ctrl F'

// Saisie commençant par `#` : recherche de tag seulement
const tagMode = computed(() => text.value.trimStart().startsWith('#'))
const needle = computed(() => normalizeSearchText(tagMode.value ? text.value.trimStart().slice(1) : text.value))
const terms = computed(() => (tagMode.value ? [] : searchTerms(text.value)))

// Portée proposée seulement s'il y a plusieurs tableaux
const multiBoard = computed(() => boardStore.getAllBoards.length > 1)

/**
 * Tableau d'une tâche, celui de sa colonne pour une tâche d'un cache antérieur aux tableaux.
 * @param task Tâche active
 */
function boardIdOf(task: Task): number | null | undefined {
  return task.boardId ?? stageStore.getAllStages.find((stage) => stage.id === task.stageId)?.boardId
}

/**
 * Tâches actives de la portée choisie, toutes avec un seul tableau.
 */
const scopedTasks = computed(() => {
  const currentId = boardStore.current?.id
  if (!multiBoard.value || scope.value === 'all' || currentId === undefined) return taskStore.getAllTasks
  return taskStore.getAllTasks.filter((task) => boardIdOf(task) === currentId)
})

/**
 * Change la portée, sans quitter la liste.
 * @param value Tableau affiché ou tous les tableaux
 */
function setScope(value: 'board' | 'all') {
  scope.value = value
  activeIndex.value = 0
}

/**
 * Tags proposés : portés par au moins une tâche active, pas encore
 * sélectionnés, dont le nom contient la saisie. Triés par nom.
 */
const tagItems = computed<SearchItem[]>(() => {
  const ids = new Set<number>()
  for (const task of taskStore.getAllTasks) {
    for (const tag of task.tags ?? []) ids.add(tag.id)
  }

  return [...ids]
    .filter((id) => !boardFilter.tagIds.includes(id))
    .map((id) => tagStore.getTagById(id))
    .filter((tag): tag is Tag => tag !== undefined)
    .filter((tag) => normalizeSearchText(tag.name).includes(needle.value))
    .sort(compareTagNames)
    .map((tag) => ({ kind: 'tag', id: tag.id, label: tag.name }))
})

/**
 * Nom d'un filtre rapide dans la langue active.
 * @param status Filtre rapide
 */
function statusLabel(status: TaskStatus): string {
  return t(`board.status.${status}`)
}

/**
 * Filtres rapides proposés, pas encore sélectionnés, dont le nom contient la
 * saisie (tous sur une saisie vide), et qui gardent au moins une tâche. Le
 * nombre de tâches concernées est affiché à droite.
 */
const statusItems = computed<SearchItem[]>(() => {
  if (tagMode.value) return []

  const now = new Date()
  return TASK_STATUSES.filter((status) => !boardFilter.statuses.includes(status)).flatMap((status) => {
    const label = statusLabel(status)
    if (!normalizeSearchText(label).includes(needle.value)) return []
    const count = scopedTasks.value.filter((task) => taskHasStatus(task, status, now)).length
    return count ? [{ kind: 'status' as const, status, label, count }] : []
  })
})

/**
 * Tâches proposées : celles qui passent le filtre (tags et filtres rapides
 * compris) et contiennent les mots saisis, avec un extrait si la
 * correspondance est dans la description ou dans un point de la checklist.
 */
const taskItems = computed<SearchItem[]>(() => {
  if (tagMode.value || !terms.value.length) return []

  const currentId = boardStore.current?.id
  return scopedTasks.value
    .filter((task) => taskMatchesFilter(task, terms.value, boardFilter.tagIds, boardFilter.statuses))
    .slice(0, MAX_TASK_SUGGESTIONS)
    .map((task) => {
      const inTitle = terms.value.every((term) => normalizeSearchText(task.title).includes(term))
      const boardId = boardIdOf(task)
      return {
        kind: 'task',
        id: task.id,
        label: task.title,
        excerpt: inTitle ? '' : taskMatchExcerpt(task, terms.value),
        stage: stageStore.getAllStages.find((stage) => stage.id === task.stageId)?.name ?? '',
        // Tableau affiché seulement pour une tâche d'un autre tableau
        board: boardId === currentId ? null : (boardStore.getAllBoards.find((board) => board.id === boardId) ?? null),
      }
    })
})

// Groupes affichés, sections vides masquées
const groups = computed(() => {
  const result: { kind: string; label: string; items: SearchItem[] }[] = []
  if (!tagMode.value && terms.value.length) {
    result.push({ kind: 'text', label: '', items: [{ kind: 'text', label: text.value.trim() }] })
  }
  if (statusItems.value.length) {
    result.push({ kind: 'status', label: t('board.quickFilters'), items: statusItems.value })
  }
  if (tagItems.value.length && (tagMode.value || needle.value)) {
    result.push({ kind: 'tag', label: t('board.searchTags'), items: tagItems.value })
  }
  if (taskItems.value.length) {
    result.push({
      kind: 'task',
      label: `${t('board.searchTasks')} · ${taskItems.value.length}`,
      items: taskItems.value,
    })
  }
  return result
})

const items = computed(() => groups.value.flatMap((group) => group.items))
const activeItem = computed(() => items.value[activeIndex.value])
// Avec plusieurs tableaux, la liste s'ouvre même sans option, pour garder les puces de portée
const listOpen = computed(() => focused.value && !listDismissed.value && (items.value.length > 0 || multiBoard.value))

/**
 * Id DOM d'une option, pour `aria-activedescendant`.
 * @param item Option
 */
function optionId(item: SearchItem): string {
  if (item.kind === 'text') return 'search-option-text'
  return `search-option-${item.kind}-${item.kind === 'status' ? item.status : item.id}`
}

// Filtre texte du board, appliqué après un court délai (pas en mode `#`)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(text, (value) => {
  listDismissed.value = false
  activeIndex.value = 0
  clearTimeout(debounce)
  debounce = setTimeout(applyQuery, SEARCH_DEBOUNCE_MS, value)
})

/**
 * Reporte la saisie dans le filtre du board (vide en mode `#`).
 * @param value Texte saisi
 */
function applyQuery(value: string) {
  boardFilter.query = value.trimStart().startsWith('#') ? '' : value
}

// Filtre vidé ailleurs (ex : rechargement) : le champ suit
watch(
  () => boardFilter.query,
  (query) => {
    if (!tagMode.value && query !== text.value) text.value = query
  },
)

/**
 * Prévient l'utilisateur si le filtre de tags mémorisé n'a pas pu être enregistré.
 * @param save Enregistrement en cours
 */
function saveFilter(save: Promise<void>) {
  save.catch(() => showError(t('board.filterNotSaved')))
}

/**
 * Applique l'option choisie.
 * @param item Option de la liste
 */
function choose(item: SearchItem) {
  if (item.kind === 'tag') {
    saveFilter(boardFilter.addTag(item.id))
    setText('')
  } else if (item.kind === 'status') {
    boardFilter.addStatus(item.status)
    setText('')
  } else if (item.kind === 'task') {
    // Tâche d'un autre tableau, ce tableau est d'abord affiché
    void boardStore.showTask(item.id)
    input.value?.blur()
  }
  listDismissed.value = true
}

/**
 * Remplace la saisie et l'applique aussitôt au filtre.
 * @param value Nouveau texte
 */
function setText(value: string) {
  text.value = value
  clearTimeout(debounce)
  applyQuery(value)
}

/**
 * Retire un tag du filtre.
 * @param tagId Id du tag
 */
function removeTag(tagId: number) {
  saveFilter(boardFilter.removeTag(tagId))
}

/**
 * Vide texte et tags.
 */
function clearAll() {
  setText('')
  saveFilter(boardFilter.clear())
}

/**
 * Retour arrière sur une saisie vide, retire la dernière chip affichée, un
 * tag, sinon un filtre rapide.
 */
function removeLastChip() {
  const lastTag = boardFilter.tagIds.at(-1)
  const lastStatus = boardFilter.statuses.at(-1)
  if (lastTag !== undefined) removeTag(lastTag)
  else if (lastStatus) boardFilter.removeStatus(lastStatus)
}

/**
 * Navigation clavier dans le champ et la liste.
 * @param event Touche pressée
 */
function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault()
      if (!items.value.length) return
      listDismissed.value = false
      const step = event.key === 'ArrowDown' ? 1 : -1
      activeIndex.value = (activeIndex.value + step + items.value.length) % items.value.length
      break
    }
    case 'Enter':
      event.preventDefault()
      if (listOpen.value && activeItem.value) choose(activeItem.value)
      break
    case 'Escape':
      event.preventDefault()
      if (listOpen.value) listDismissed.value = true
      else {
        clearAll()
        input.value?.blur()
      }
      break
    case 'Backspace':
      if (!text.value) removeLastChip()
      break
  }
}

/**
 * Entrée du focus dans la barre ou sa liste. Venue de l'extérieur, c'est une
 * nouvelle ouverture, la portée revient au tableau affiché.
 */
function onFocusIn() {
  if (focused.value) return
  focused.value = true
  listDismissed.value = false
  scope.value = 'board'
}

/**
 * Sortie du focus. Un passage du champ aux puces de portée (Tab) garde la liste ouverte.
 * @param event Perte du focus, avec l'élément qui le reçoit
 */
function onFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)) return
  focused.value = false
}

/**
 * Échap sur une puce de portée, rend le focus au champ en fermant la liste.
 */
function backToInput() {
  input.value?.focus()
  listDismissed.value = true
}

/**
 * Ctrl+F / Cmd+F : focus dans la barre depuis n'importe où sur le board.
 * @param event Touche pressée
 */
function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    input.value?.focus()
    input.value?.select()
  }
}

onMounted(() => globalThis.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onGlobalKeydown)
  clearTimeout(debounce)
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<style scoped>
.board-search {
  position: relative;
  flex: 1;
  max-width: 30rem;
  min-width: 12rem;
}

.search-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  min-height: 2.25rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-form-field-background);
  cursor: text;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.search-box.is-focused {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-primary-color) 25%, transparent);
}

.search-icon,
.search-hint,
.option-icon {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.search-input {
  flex: 1;
  min-width: 6rem;
  background: transparent;
  border: none;
  outline: none;
  color: var(--p-text-color);
}

.search-input::placeholder {
  color: var(--p-text-muted-color);
}

.search-shortcut {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  padding: 0 0.3rem;
}

.search-clear {
  display: flex;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.search-clear:hover {
  color: var(--p-text-color);
}

.search-panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 0.375rem);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  max-height: 24rem;
  padding: 0.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-overlay-popover-background, var(--p-content-background));
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}

.search-list {
  min-height: 0;
  overflow-y: auto;
}

/* Portée de la recherche, deux puces comme la maquette */
.search-scope {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem 0.25rem 0.375rem;
}

.scope-chip {
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.125rem 0.5625rem;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.scope-chip:hover {
  color: var(--p-text-color);
}

.scope-chip.is-on {
  border-color: var(--p-primary-color);
  background: var(--p-highlight-background);
  color: var(--p-primary-color);
}

.scope-chip:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.search-group {
  padding: 0.375rem 0.5rem 0.125rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.search-separator {
  margin: 0.25rem 0;
  border-top: 1px solid var(--p-content-border-color);
}

.search-option {
  color: var(--p-text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: var(--p-border-radius-sm);
  cursor: pointer;
}

.search-option.is-active {
  background: var(--p-content-hover-background);
}

.option-task {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.option-excerpt,
.option-meta {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.option-meta {
  margin-left: auto;
  max-width: 35%;
  flex-shrink: 0;
}

.option-place {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 45%;
}

/* Chip d'un filtre rapide, à l'accent pour la distinguer des tags */
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  padding: 1px 0.375rem;
  border-radius: var(--p-border-radius-md);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-color);
}

.status-chip .pi {
  font-size: 0.7rem;
}

.status-chip-remove {
  display: inline-flex;
  cursor: pointer;
  opacity: 0.7;
}

.status-chip-remove:hover {
  opacity: 1;
}

.status-chip-remove .pi {
  font-weight: 700;
}

mark {
  background: color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  color: inherit;
  border-radius: 2px;
}
</style>
