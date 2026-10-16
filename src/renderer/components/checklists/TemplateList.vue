<template>
  <div class="template-list" data-testid="template-list">
    <label class="tpl-search">
      <i class="pi pi-search" aria-hidden="true"></i>
      <input
        v-model="search"
        data-testid="template-search"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('checklists.search')"
        :aria-label="t('checklists.search')"
      />
    </label>

    <p v-if="!shown.length" data-testid="template-no-match" class="tpl-no-match">{{ t('checklists.noMatch') }}</p>

    <!-- Ordre par glisser-déposer sur la poignée, désactivé pendant une recherche -->
    <draggable
      v-else
      :list="shown"
      tag="ul"
      itemKey="id"
      v-bind="DND_OPTIONS"
      handle=".tpl-grip"
      :disabled="filtering"
      class="tpl-items"
      @start="setDragging(true)"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <li
          data-testid="template-row"
          :data-template-id="element.id"
          :class="['tpl-row', { on: element.id === selectedId, empty: !element.items.length }]"
          @click="emit('select', element.id)"
        >
          <!-- Poignée masquée pendant une recherche, sa place est gardée -->
          <span
            :class="['tpl-grip', { 'is-hidden': filtering }]"
            data-testid="template-grip"
            :title="t('checklists.moveTemplate', { name: element.name })"
          >
            <i class="pi pi-bars" aria-hidden="true"></i>
          </span>
          <button
            type="button"
            class="tpl-name"
            data-testid="template-name"
            :aria-current="element.id === selectedId ? 'true' : undefined"
          >
            {{ element.name }}
          </button>
          <span class="tpl-n" data-testid="template-count">{{
            t('checklists.itemCountShort', { count: element.items.length }, element.items.length)
          }}</span>
        </li>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { useI18n } from 'vue-i18n'
import { DND_OPTIONS } from '../../constants/dnd.constants'
import type { ChecklistTemplate } from '../../types/checklistTemplate.types'
import { setDragging } from '../../utils/dnd.helper'
import { normalizeSearchText } from '../../utils/search.helper'

/**
 * Volet gauche de la page Checklists. Liste des modèles dans leur ordre, avec
 * leur nombre de points, une recherche locale sur le nom (sans casse ni
 * accents) et le réordonnancement par glisser-déposer.
 */

const props = defineProps<{
  templates: ChecklistTemplate[] // tous les modèles, dans leur ordre
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  reorder: [orderedIds: number[]] // ids de tous les modèles, dans le nouvel ordre
}>()

// Texte recherché, gardé par la page pour être vidé à la création d'un modèle
const search = defineModel<string>('search', { default: '' })

const { t } = useI18n()

// Copie locale de la liste, que vuedraggable réordonne sur place
const local = ref<ChecklistTemplate[]>([])
watch(
  () => props.templates,
  (templates) => {
    local.value = [...templates]
  },
  { immediate: true },
)

const query = computed(() => normalizeSearchText(search.value))
const filtering = computed(() => query.value !== '')

// Modèles affichés, la liste locale elle-même hors recherche (réordonnée par le DnD)
const shown = computed(() =>
  filtering.value ? local.value.filter((template) => normalizeSearchText(template.name).includes(query.value)) : local.value,
)

/**
 * Fin d'un glisser-déposer, l'ordre n'est signalé que s'il a changé
 */
function onDragEnd() {
  setDragging(false)
  const ids = local.value.map((template) => template.id)
  if (ids.some((id, index) => id !== props.templates[index]?.id)) emit('reorder', ids)
}
</script>

<style scoped>
@reference "tailwindcss";

.template-list {
  @apply flex min-h-0 flex-1 flex-col gap-2.5;
}

.tpl-search {
  @apply flex h-8 shrink-0 items-center gap-2 rounded-md pr-2 pl-2.5 text-[13px];
  border: 1px solid var(--p-form-field-border-color);
  background-color: var(--p-form-field-background);
  color: var(--p-text-muted-color);
  cursor: text;
}

.tpl-search:focus-within {
  border-color: var(--p-primary-color);
}

.tpl-search .pi {
  font-size: 0.875rem;
}

.tpl-search input {
  @apply min-w-0 flex-1 border-0 bg-transparent outline-none;
  font: inherit;
  color: var(--p-text-color);
}

.tpl-search input::placeholder {
  color: var(--p-text-muted-color);
}

.tpl-no-match {
  @apply px-1 text-[13px];
  color: var(--p-text-muted-color);
}

.tpl-items {
  @apply m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto p-0;
}

.tpl-row {
  @apply flex cursor-pointer items-center gap-1.5 rounded-md py-2 pr-1.5 pl-1;
}

.tpl-row:hover {
  background-color: var(--p-content-hover-background);
}

.tpl-row.on {
  background-color: var(--p-highlight-background);
}

/* Poignée visible au survol de la ligne */
.tpl-grip {
  @apply flex cursor-grab opacity-0;
  color: var(--p-text-muted-color);
}

.tpl-grip .pi {
  font-size: 0.875rem;
}

.tpl-row:hover .tpl-grip {
  opacity: 0.8;
}

.tpl-grip.is-hidden {
  visibility: hidden;
}

.tpl-name {
  @apply min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left;
  font: inherit;
  color: var(--p-text-color);
}

.tpl-name:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
  border-radius: 2px;
}

.tpl-row.on .tpl-name {
  @apply font-semibold;
  color: var(--p-primary-color);
}

.tpl-n {
  @apply shrink-0 text-xs tabular-nums;
  color: var(--p-text-muted-color);
}

.tpl-row.empty .tpl-n {
  @apply italic;
}

/* Emplacement de dépôt et modèle tenu pendant un glisser-déposer */
.tpl-row.dnd-ghost {
  background-color: var(--p-highlight-background);
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
}

.tpl-row.dnd-ghost > * {
  visibility: hidden;
}

.tpl-row.dnd-dragging {
  background-color: var(--p-content-background);
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.2);
}
</style>
