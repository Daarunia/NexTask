<template>
  <!-- Champ fermé : chips sélectionnées, un clic ouvre le sélecteur -->
  <div
    ref="fieldRef"
    data-testid="task-tags-field"
    class="tag-field"
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    :aria-expanded="isOpen"
    @click="togglePanel"
    @keydown.enter.prevent="togglePanel"
    @keydown.space.prevent="togglePanel"
  >
    <template v-if="visibleSelection.length">
      <TagChip
        v-for="selection in visibleSelection"
        :key="selectionKey(selection)"
        data-testid="task-tag-chip"
        :tagId="selection.id"
        :name="selection.name"
      />
    </template>
    <span v-else class="tag-field-placeholder">Aucun tag</span>
  </div>

  <!-- Un seul popover : pas d'overlay imbriqué, fermeture au clic extérieur gérée par PrimeVue -->
  <Popover ref="popover" :closeOnEscape="false" @show="onShow" @hide="onHide">
    <div ref="panelRef" data-testid="tag-select-panel" class="tag-panel" @keydown="onPanelKeydown">
      <!-- Chips sélectionnées puis recherche -->
      <div class="tag-panel-search">
        <TagChip
          v-for="selection in visibleSelection"
          :key="selectionKey(selection)"
          data-testid="task-tag-chip"
          :tagId="selection.id"
          :name="selection.name"
          removable
          @remove="removeSelection(selection)"
        />
        <input
          ref="searchRef"
          v-model="search"
          data-testid="tag-select-search"
          class="tag-search-input"
          :maxlength="TAG_NAME_MAX_LENGTH"
          placeholder="Rechercher un tag..."
          autofocus
          @keydown="onSearchKeydown"
        />
      </div>

      <p class="tag-panel-hint">Sélectionne un tag ou crée-en un</p>

      <!-- Liste des tags, filtrée sur la saisie sans tenir compte de la casse -->
      <div class="tag-list">
        <div
          v-for="(tag, index) in filteredTags"
          :key="tag.id"
          data-testid="tag-option"
          class="tag-option"
          :data-highlighted="index === highlightedIndex ? 'true' : undefined"
          @click="selectTag(tag)"
          @mouseenter="highlightedIndex = index"
        >
          <TagChip :tagId="tag.id" />
          <i v-if="isSelected(tag.id)" class="pi pi-check tag-option-check" aria-label="Sélectionné"></i>
        </div>

        <!-- Saisie sans tag correspondant : création à l'enregistrement de la tâche -->
        <div
          v-if="showCreateOption"
          data-testid="tag-create-option"
          class="tag-option"
          :data-highlighted="createIndex === highlightedIndex ? 'true' : undefined"
          @click="createTag"
          @mouseenter="highlightedIndex = createIndex"
        >
          <span class="tag-create-label">Créer</span>
          <TagChip :name="trimmedSearch" />
        </div>
      </div>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Popover from 'primevue/popover'
import TagChip from './TagChip.vue'
import { useTagStore } from '../stores/Tag'
import { Tag, TagSelection } from '../types/tag.types'
import { TAG_NAME_MAX_LENGTH } from '../schemas/task.schema'
import { getLogger } from '../utils/logger'

/**
 * Sélecteur de tags façon Notion, branché au formulaire de TaskDialog.
 *
 * La valeur est une liste de `TagSelection` : un tag existant par son id (nom
 * et couleur lus dans le store), un tag à créer par son seul nom. Les tags à
 * créer ne sont envoyés au serveur qu'à l'enregistrement de la tâche.
 */
const props = defineProps<{
  modelValue: TagSelection[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: TagSelection[]): void
}>()

const logger = getLogger()
const tagStore = useTagStore()

const popover = ref()
const fieldRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const isOpen = ref(false)
const search = ref('')
const highlightedIndex = ref(-1)

/**
 * Compare deux noms de tag sans tenir compte de la casse
 */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

// Sélection affichable : un tag supprimé entre-temps n'a plus de chip
const visibleSelection = computed(() =>
  props.modelValue.filter((selection) => selection.id === undefined || tagStore.getTagById(selection.id)),
)

const trimmedSearch = computed(() => search.value.trim())

// Tags existants dont le nom contient la saisie
const filteredTags = computed(() => {
  const query = trimmedSearch.value.toLowerCase()
  return tagStore.getAllTags.filter((tag) => tag.name.toLowerCase().includes(query))
})

// « Créer « xxx » » seulement si la saisie ne correspond exactement à aucun tag,
// existant ou déjà choisi pour être créé
const showCreateOption = computed(() => {
  const name = trimmedSearch.value
  if (!name) return false

  const exists = tagStore.getAllTags.some((tag) => sameName(tag.name, name))
  const pending = props.modelValue.some((selection) => selection.id === undefined && sameName(selection.name, name))
  return !exists && !pending
})

// La ligne de création suit toujours les tags existants
const createIndex = computed(() => filteredTags.value.length)
const itemCount = computed(() => filteredTags.value.length + (showCreateOption.value ? 1 : 0))

/**
 * Clé stable d'une chip sélectionnée
 */
function selectionKey(selection: TagSelection): string {
  return selection.id === undefined ? `new-${selection.name.toLowerCase()}` : `id-${selection.id}`
}

/**
 * Le tag est-il déjà dans la sélection ?
 */
function isSelected(tagId: number): boolean {
  return props.modelValue.some((selection) => selection.id === tagId)
}

/**
 * Surbrillance par défaut : le tag de même nom que la saisie s'il existe,
 * sinon la première ligne
 */
function resetHighlight() {
  const exactIndex = filteredTags.value.findIndex((tag) => sameName(tag.name, trimmedSearch.value))
  highlightedIndex.value = exactIndex !== -1 ? exactIndex : itemCount.value > 0 ? 0 : -1
}

watch([trimmedSearch, itemCount], resetHighlight)

// La ligne en surbrillance reste visible dans une longue liste
watch(highlightedIndex, () => {
  nextTick(() => {
    panelRef.value?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
  })
})

/**
 * Ouvre ou ferme le sélecteur, ancré sur le champ fermé
 */
function togglePanel(event: Event) {
  popover.value?.toggle(event, fieldRef.value)
}

/**
 * Ferme le sélecteur et rend le focus au champ
 */
function closePanel() {
  popover.value?.hide()
  fieldRef.value?.focus()
}

function focusSearch() {
  nextTick(() => searchRef.value?.focus())
}

function onShow() {
  isOpen.value = true
  resetHighlight()
  focusSearch()

  // Rafraîchit la liste si le cache a expiré (sans effet sinon)
  tagStore.loadAllTags().catch((error) => logger.error('Erreur lors du rafraîchissement des tags :', error))
}

function onHide() {
  isOpen.value = false
  search.value = ''
}

/**
 * Ajoute un tag existant à la sélection (sans doublon)
 */
function selectTag(tag: Tag) {
  if (!isSelected(tag.id)) {
    emit('update:modelValue', [...props.modelValue, { id: tag.id, name: tag.name }])
  }

  search.value = ''
  focusSearch()
}

/**
 * Ajoute la saisie comme tag à créer
 */
function createTag() {
  if (!showCreateOption.value) return

  emit('update:modelValue', [...props.modelValue, { name: trimmedSearch.value }])
  search.value = ''
  focusSearch()
}

/**
 * Retire une chip de la sélection
 */
function removeSelection(selection: TagSelection) {
  emit(
    'update:modelValue',
    props.modelValue.filter((s) => s !== selection),
  )
  focusSearch()
}

/**
 * Entrée : une saisie identique au nom d'un tag (casse mise à part) sélectionne
 * ce tag, sinon la ligne en surbrillance est validée (sélection ou création)
 */
function pickHighlighted() {
  const exactTag = trimmedSearch.value
    ? tagStore.getAllTags.find((tag) => sameName(tag.name, trimmedSearch.value))
    : undefined

  if (exactTag) {
    selectTag(exactTag)
    return
  }

  const index = highlightedIndex.value
  if (index < 0 || index >= itemCount.value) return

  if (index < filteredTags.value.length) {
    selectTag(filteredTags.value[index])
  } else {
    createTag()
  }
}

/**
 * Clavier du champ de recherche : navigation, sélection, retrait de la dernière chip
 */
function onSearchKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (itemCount.value) highlightedIndex.value = Math.min(highlightedIndex.value + 1, itemCount.value - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      if (itemCount.value) highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      break
    case 'Enter':
      event.preventDefault()
      pickHighlighted()
      break
    case 'Backspace': {
      const last = visibleSelection.value.at(-1)
      if (search.value === '' && last) {
        event.preventDefault()
        removeSelection(last)
      }
      break
    }
  }
}

/**
 * Échap ferme le sélecteur, sans remonter jusqu'au Dialog qui se fermerait aussi
 */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  event.preventDefault()
  event.stopPropagation()
  closePanel()
}
</script>

<style scoped>
@reference "tailwindcss";

.tag-field {
  @apply flex flex-wrap items-center gap-1 w-full min-h-10 px-3 py-2 rounded-md border cursor-pointer;
  background-color: var(--p-form-field-background);
  border-color: var(--p-form-field-border-color);
  transition: border-color 0.2s;
}

.tag-field:hover {
  border-color: var(--p-form-field-hover-border-color);
}

.tag-field:focus-visible {
  outline: none;
  border-color: var(--p-form-field-focus-border-color);
}

.tag-field-placeholder {
  color: var(--p-form-field-placeholder-color);
}

.tag-panel {
  @apply flex flex-col gap-2 w-72;
}

.tag-panel-search {
  @apply flex flex-wrap items-center gap-1 pb-2 border-b;
  border-color: var(--p-content-border-color);
}

.tag-search-input {
  @apply flex-1 min-w-24 bg-transparent outline-none text-sm py-1;
  color: var(--p-text-color);
}

.tag-panel-hint {
  @apply text-xs px-1;
  color: var(--p-text-muted-color);
}

/* Hauteur maximale et défilement pour une longue liste */
.tag-list {
  @apply flex flex-col gap-0.5 max-h-64 overflow-y-auto;
}

.tag-option {
  @apply flex items-center gap-2 min-h-8 px-2 py-1 rounded-md cursor-pointer;
}

.tag-option[data-highlighted='true'] {
  background-color: var(--p-list-option-focus-background, var(--p-surface-100));
}

.app-dark .tag-option[data-highlighted='true'] {
  background-color: var(--p-list-option-focus-background, var(--p-surface-800));
}

.tag-option-check {
  @apply text-xs;
  color: var(--p-text-muted-color);
}

.tag-create-label {
  @apply text-sm;
  color: var(--p-text-muted-color);
}
</style>
