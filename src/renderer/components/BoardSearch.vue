<template>
  <div ref="root" class="board-search" data-testid="board-search">
    <div :class="['search-box', { 'is-focused': focused }]" @mousedown.self.prevent="input?.focus()">
      <i class="pi pi-search search-icon" aria-hidden="true"></i>

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
        :aria-expanded="listOpen"
        aria-controls="board-search-list"
        :aria-activedescendant="listOpen && activeItem ? optionId(activeItem) : undefined"
        :placeholder="boardFilter.tagIds.length ? '' : t('board.searchPlaceholder')"
        @focus="onFocus"
        @blur="onBlur"
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
    <ul
      v-if="listOpen"
      id="board-search-list"
      data-testid="search-list"
      class="search-list"
      role="listbox"
      :aria-label="t('board.searchLabel')"
      @mousedown.prevent
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
            <span class="option-meta truncate">{{ item.stage }}</span>
          </template>
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TagChip from './TagChip.vue'
import { useBoardFilterStore } from '../stores/BoardFilter'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import { useStageStore } from '../stores/Stage'
import { useErrorToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import { infoTooltip } from '../utils/tooltip.helper'
import { highlightParts, matchExcerpt, normalizeSearchText, searchTerms, taskSearchText } from '../utils/search.helper'
import type { Tag } from '../types/tag.types'

/**
 * Barre de recherche globale du board, dans l'en-tête.
 *
 * Un seul champ : le texte filtre le board en direct (titre et description),
 * les tags choisis deviennent des chips (OU logique, ET avec le texte). La
 * liste propose de garder la recherche texte, les tags dont le nom correspond
 * et les tâches trouvées (ouvertes au clic). Avec `#`, seuls les tags sont
 * proposés et le board n'est pas filtré sur ce texte.
 */

type SearchItem =
  | { kind: 'text'; label: string }
  | { kind: 'tag'; id: number; label: string }
  | { kind: 'task'; id: number; label: string; excerpt: string; stage: string }

// Délai avant de filtrer le board sur le texte saisi
const SEARCH_DEBOUNCE_MS = 150
// Nombre maximal de tâches proposées
const MAX_TASK_SUGGESTIONS = 5

const { t } = useI18n()
const boardFilter = useBoardFilterStore()
const taskStore = useTaskStore()
const tagStore = useTagStore()
const stageStore = useStageStore()
const showError = useErrorToast()

const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const text = ref(boardFilter.query)
const focused = ref(false)
const listDismissed = ref(false) // liste fermée par Échap ou un choix, rouverte à la frappe
const activeIndex = ref(0)

const shortcutLabel = navigator.userAgent.includes('Mac') ? '⌘F' : 'Ctrl F'

// Saisie commençant par `#` : recherche de tag seulement
const tagMode = computed(() => text.value.trimStart().startsWith('#'))
const needle = computed(() => normalizeSearchText(tagMode.value ? text.value.trimStart().slice(1) : text.value))
const terms = computed(() => (tagMode.value ? [] : searchTerms(text.value)))

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
 * Tâches proposées : celles qui passent le filtre (tags compris) et
 * contiennent les mots saisis, avec un extrait si la correspondance est dans
 * la description.
 */
const taskItems = computed<SearchItem[]>(() => {
  if (tagMode.value || !terms.value.length) return []

  return taskStore.getAllTasks
    .filter((task) => {
      if (boardFilter.tagIds.length && !task.tags?.some((tag) => boardFilter.tagIds.includes(tag.id))) return false
      const haystack = taskSearchText(task)
      return terms.value.every((term) => haystack.includes(term))
    })
    .slice(0, MAX_TASK_SUGGESTIONS)
    .map((task) => {
      const inTitle = terms.value.every((term) => normalizeSearchText(task.title).includes(term))
      return {
        kind: 'task',
        id: task.id,
        label: task.title,
        excerpt: inTitle ? '' : matchExcerpt(task.description, terms.value),
        stage: stageStore.getAllStages.find((stage) => stage.id === task.stageId)?.name ?? '',
      }
    })
})

// Groupes affichés, sections vides masquées
const groups = computed(() => {
  const result: { kind: string; label: string; items: SearchItem[] }[] = []
  if (!tagMode.value && terms.value.length) {
    result.push({ kind: 'text', label: '', items: [{ kind: 'text', label: text.value.trim() }] })
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
const listOpen = computed(() => focused.value && !listDismissed.value && items.value.length > 0)

/**
 * Id DOM d'une option, pour `aria-activedescendant`.
 * @param item Option
 */
function optionId(item: SearchItem): string {
  return item.kind === 'text' ? 'search-option-text' : `search-option-${item.kind}-${item.id}`
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
  } else if (item.kind === 'task') {
    taskStore.requestOpenTask(item.id)
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
    case 'Backspace': {
      const last = boardFilter.tagIds.at(-1)
      if (!text.value && last !== undefined) removeTag(last)
      break
    }
  }
}

function onFocus() {
  focused.value = true
  listDismissed.value = false
}

function onBlur() {
  focused.value = false
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

.search-list {
  position: absolute;
  z-index: 50;
  top: calc(100% + 0.375rem);
  left: 0;
  right: 0;
  max-height: 24rem;
  overflow-y: auto;
  padding: 0.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-overlay-popover-background, var(--p-content-background));
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
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

mark {
  background: color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  color: inherit;
  border-radius: 2px;
}
</style>
