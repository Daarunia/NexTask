<template>
  <div class="checklist-editor" data-testid="checklist-editor">
    <!-- Points réordonnés par leur poignée, la ligne entière reste un champ de saisie -->
    <draggable
      :modelValue="modelValue"
      tag="ul"
      itemKey="key"
      v-bind="DND_OPTIONS"
      handle=".item-grip"
      class="items"
      @update:modelValue="emit('update:modelValue', $event)"
      @start="setDragging(true)"
      @end="setDragging(false)"
    >
      <template #item="{ element, index }">
        <li
          v-show="isVisible(element)"
          data-testid="checklist-item"
          :data-item-key="element.key"
          :class="['item', { checked: checkable && element.isChecked }]"
        >
          <span class="item-grip" data-testid="checklist-item-grip" :title="t('checklists.editor.moveItem')">
            <i class="pi pi-bars" aria-hidden="true"></i>
          </span>

          <Checkbox
            v-if="checkable"
            :modelValue="element.isChecked"
            binary
            class="item-check"
            data-testid="checklist-item-check"
            :aria-label="t('checklists.editor.checkItem', { text: element.text })"
            @update:modelValue="(checked: boolean) => replaceItem(index, { isChecked: checked })"
          />

          <input
            :ref="(el) => setInputRef(element.key, el)"
            class="item-text"
            data-testid="checklist-item-input"
            type="text"
            spellcheck="false"
            :value="element.text"
            :maxlength="CHECKLIST_ITEM_MAX_LENGTH"
            :aria-label="t('checklists.editor.item', { n: index + 1 })"
            @input="replaceItem(index, { text: ($event.target as HTMLInputElement).value })"
            @focus="editStart.set(element.key, element.text)"
            @blur="dropIfEmpty(element.key)"
            @keydown="onItemKeydown($event, index)"
          />

          <Button
            icon="pi pi-trash"
            class="item-delete"
            data-testid="btn-checklist-item-delete"
            :aria-label="t('checklists.editor.deleteItem')"
            :title="t('checklists.editor.deleteItem')"
            severity="secondary"
            size="small"
            text
            rounded
            @click="removeItem(index)"
          />
        </li>
      </template>
    </draggable>

    <!-- Contenu du parent entre les points et la saisie (note des points cochés masqués) -->
    <slot name="after-items"></slot>

    <!-- Saisie d'un nouveau point, ajouté en fin de liste -->
    <label v-if="canAdd" class="new-item">
      <i class="pi pi-plus" aria-hidden="true"></i>
      <input
        ref="newInput"
        v-model="newText"
        data-testid="checklist-new-item"
        type="text"
        spellcheck="false"
        :maxlength="CHECKLIST_ITEM_MAX_LENGTH"
        :placeholder="t('checklists.editor.addItem')"
        :aria-label="t('checklists.editor.addItem')"
        @keydown="onNewKeydown"
        @blur="commitPending"
      />
    </label>
  </div>
</template>

<script lang="ts">
/**
 * Point affiché par l'éditeur. `key` ne sert qu'au rendu et au
 * glisser-déposer, il est unique pour toute la session, y compris pour un
 * point pas encore enregistré. `id` est celui du point en base, s'il existe.
 */
export interface ChecklistEditorItem {
  key: number
  id?: number
  text: string
  isChecked: boolean
}

// Dernière clé distribuée, partagée par toutes les instances de l'éditeur
let lastItemKey = 0

/**
 * Nouveau point pour l'éditeur, décoché par défaut, avec sa clé de rendu.
 * @param text Texte du point
 * @param fields Autres champs (id du point en base, état coché)
 */
export function newChecklistEditorItem(
  text = '',
  fields: Partial<Omit<ChecklistEditorItem, 'key' | 'text'>> = {},
): ChecklistEditorItem {
  lastItemKey++
  return { key: lastItemKey, text, isChecked: false, ...fields }
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import draggable from 'vuedraggable'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import { useI18n } from 'vue-i18n'
import { DND_OPTIONS } from '../constants/dnd.constants'
import { setDragging } from '../utils/dnd.helper'
import { CHECKLIST_ITEM_MAX_LENGTH, CHECKLIST_MAX_ITEMS } from '../../main/shared/checklist.constants'

/**
 * Éditeur des points d'une checklist, partagé par la page Checklists (modèles,
 * sans case à cocher) et le dialogue de tâche (`checkable`).
 *
 * Saisie au clavier (parcours P1). Entrée valide la ligne et ouvre la
 * suivante, sans soumettre le formulaire parent. Retour arrière sur un point
 * vide le supprime et revient au précédent. Échap annule la saisie en cours
 * et quitte le champ, sans remonter au dialogue. Les raccourcis avec Ctrl
 * (Ctrl+Entrée, Ctrl+S) ne sont pas interceptés.
 *
 * Le composant ne garde aucun état des points, chaque modification émet une
 * nouvelle liste. Un point laissé vide en quittant son champ est retiré.
 */

const props = withDefaults(
  defineProps<{
    modelValue: ChecklistEditorItem[]
    checkable?: boolean // cases à cocher (checklist d'une tâche), absentes pour un modèle
    hideChecked?: boolean // points cochés masqués, mais gardés dans la liste et à leur place
  }>(),
  { checkable: false, hideChecked: false },
)

const emit = defineEmits<{
  'update:modelValue': [items: ChecklistEditorItem[]]
}>()

const { t } = useI18n()

// Saisie du nouveau point
const newText = ref('')
const newInput = ref<HTMLInputElement | null>(null)

// Champs des points, par clé, pour y placer le curseur
const inputs = new Map<number, HTMLInputElement>()

// Texte d'un point au début de son édition, rétabli par Échap
const editStart = new Map<number, string>()

const canAdd = computed(() => props.modelValue.length < CHECKLIST_MAX_ITEMS)

/**
 * Vrai si le point est affiché (les points cochés peuvent être masqués)
 * @param item Point
 */
function isVisible(item: ChecklistEditorItem): boolean {
  return !(props.checkable && props.hideChecked && item.isChecked)
}

/**
 * Mémorise le champ d'un point (callback de `ref` dans le v-for)
 * @param key Clé du point
 * @param el Champ monté, ou `null` au démontage
 */
function setInputRef(key: number, el: unknown) {
  if (el instanceof HTMLInputElement) inputs.set(key, el)
  else inputs.delete(key)
}

/**
 * Émet la liste avec un point modifié
 * @param index Rang du point
 * @param fields Champs changés
 */
function replaceItem(index: number, fields: Partial<ChecklistEditorItem>) {
  const items = [...props.modelValue]
  items[index] = { ...items[index], ...fields }
  emit('update:modelValue', items)
}

/**
 * Émet la liste sans le point
 * @param index Rang du point
 */
function removeItem(index: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

/**
 * Place le curseur à la fin du texte d'un point, une fois la liste rendue
 * @param key Clé du point
 */
async function focusItem(key: number) {
  await nextTick()
  const input = inputs.get(key)
  if (!input) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

/**
 * Retire un point resté vide quand on quitte son champ. Lu après le rendu,
 * car Échap rétablit le texte juste avant de quitter le champ. Ignoré quand
 * c'est la fenêtre qui perd le focus, la saisie reprendra au retour.
 * @param key Clé du point
 */
async function dropIfEmpty(key: number) {
  editStart.delete(key)
  if (!document.hasFocus()) return
  await nextTick()
  const index = props.modelValue.findIndex((item) => item.key === key)
  if (index !== -1 && !props.modelValue[index].text.trim()) removeItem(index)
}

/**
 * Vrai pour une touche pressée seule, sans modificateur ni composition (IME)
 * @param event Évènement clavier
 */
function isPlainKey(event: KeyboardEvent): boolean {
  return !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
}

/**
 * Raccourcis d'un point en cours d'édition
 * @param event Évènement clavier
 * @param index Rang du point
 */
function onItemKeydown(event: KeyboardEvent, index: number) {
  if (!isPlainKey(event)) return
  const item = props.modelValue[index]

  if (event.key === 'Enter') {
    // Jamais de soumission du formulaire parent
    event.preventDefault()
    event.stopPropagation()
    if (!item.text.trim()) return
    if (!canAdd.value) return

    const next = newChecklistEditorItem()
    const items = [...props.modelValue]
    items.splice(index + 1, 0, next)
    emit('update:modelValue', items)
    focusItem(next.key)
  } else if (event.key === 'Backspace' && item.text === '') {
    event.preventDefault()
    event.stopPropagation()
    // Voisin affiché le plus proche, le précédent d'abord
    const before = props.modelValue.slice(0, index).findLast(isVisible)
    const neighbor = before ?? props.modelValue.slice(index + 1).find(isVisible)
    removeItem(index)
    if (neighbor) focusItem(neighbor.key)
    else focusNew()
  } else if (event.key === 'Escape') {
    // Annule la saisie sans fermer le dialogue qui contient l'éditeur
    event.preventDefault()
    event.stopPropagation()
    const before = editStart.get(item.key)
    if (before !== undefined && before !== item.text) replaceItem(index, { text: before })
    ;(event.target as HTMLInputElement).blur()
  }
}

/**
 * Raccourcis de la saisie d'un nouveau point
 * @param event Évènement clavier
 */
function onNewKeydown(event: KeyboardEvent) {
  if (!isPlainKey(event)) return

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commitPending()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    newText.value = ''
    newInput.value?.blur()
  }
}

/**
 * Ajoute en fin de liste le point saisi dans le champ « Ajouter un point »,
 * s'il n'est pas vide. Appelé par Entrée et en quittant le champ, et à
 * appeler avant d'enregistrer la liste (Ctrl+Entrée ne quitte pas le champ).
 */
function commitPending() {
  const text = newText.value.trim()
  if (!text || !canAdd.value) return
  newText.value = ''
  emit('update:modelValue', [...props.modelValue, newChecklistEditorItem(text)])
}

/**
 * Place le curseur dans le champ « Ajouter un point »
 */
async function focusNew() {
  await nextTick()
  newInput.value?.focus()
}

defineExpose({ commitPending, focusNew })
</script>

<style scoped>
@reference "tailwindcss";

.items {
  @apply m-0 flex list-none flex-col p-0;
}

.item {
  @apply flex h-[34px] items-center gap-2 rounded-md pr-1;
}

.item:hover {
  background-color: var(--p-content-hover-background);
}

/* Poignée visible au survol de la ligne */
.item-grip {
  @apply flex cursor-grab opacity-0;
  color: var(--p-text-muted-color);
}

.item-grip .pi {
  font-size: 0.875rem;
}

.item:hover .item-grip,
.item:focus-within .item-grip {
  opacity: 0.8;
}

/* Case à cocher compacte, 18 px comme sur la maquette */
.item-check {
  --p-checkbox-width: 18px;
  --p-checkbox-height: 18px;
  --p-checkbox-icon-size: 12px;
  flex: none;
}

/* Texte du point, champ sans cadre qui se lit comme du texte */
.item-text {
  @apply min-w-0 flex-1 border-0 bg-transparent py-1 outline-none;
  font: inherit;
  color: var(--p-text-color);
  border-bottom: 1px solid transparent;
  text-overflow: ellipsis;
}

.item-text:focus {
  border-bottom-color: var(--p-primary-color);
}

.item.checked .item-text {
  color: var(--p-text-muted-color);
  text-decoration: line-through;
}

/* Suppression visible au survol de la ligne, ou au clavier */
.item-delete {
  @apply opacity-0;
  width: 28px !important;
  height: 28px !important;
}

.item:hover .item-delete,
.item:focus-within .item-delete {
  opacity: 1;
}

.item .item-delete:hover {
  color: var(--p-red-600);
}

.app-dark .item .item-delete:hover {
  color: var(--p-red-400);
}

/* Saisie d'un nouveau point, alignée sur le texte des points (poignée + écart) */
.new-item {
  @apply flex h-[34px] items-center gap-2 pl-[22px];
  color: var(--p-text-muted-color);
}

.new-item .pi {
  font-size: 0.875rem;
}

.new-item input {
  @apply flex-1 border-0 bg-transparent py-1.5 outline-none;
  font: inherit;
  color: var(--p-text-color);
  border-bottom: 1px dashed var(--p-form-field-border-color);
}

.new-item input:focus {
  border-bottom: 1px solid var(--p-primary-color);
}

.new-item input::placeholder {
  color: var(--p-text-muted-color);
}

/* Emplacement de dépôt et point tenu pendant un glisser-déposer */
.item.dnd-ghost {
  background-color: var(--p-highlight-background);
}

.item.dnd-ghost > * {
  visibility: hidden;
}

.item.dnd-dragging {
  background-color: var(--p-content-background);
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.2);
}
</style>
