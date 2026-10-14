<template>
  <section class="task-checklist" data-testid="task-checklist" :aria-label="t('checklist.title')">
    <!-- En-tête : libellé, avancement, actions -->
    <div class="cl-head">
      <span class="field-label"><i class="pi pi-check-square" aria-hidden="true"></i>{{ t('checklist.title') }}</span>
      <span
        v-if="progress.total"
        data-testid="task-checklist-progress"
        :class="['cl-progress', { done: complete }]"
      >
        {{ progress.done }}/{{ progress.total }}
      </span>
      <span class="flex-1"></span>
      <Button
        type="button"
        icon="pi pi-list-check"
        :label="t('checklist.fromTemplate')"
        class="cl-from-template"
        data-testid="btn-checklist-from-template"
        aria-haspopup="dialog"
        :aria-expanded="templatesOpen"
        size="small"
        text
        @click="toggleTemplates"
      />

      <Button
        type="button"
        icon="pi pi-ellipsis-h"
        class="cl-menu-btn"
        data-testid="btn-checklist-menu"
        :aria-label="t('checklist.actions')"
        :title="t('checklist.actions')"
        aria-haspopup="true"
        severity="secondary"
        size="small"
        text
        rounded
        @click="toggleMenu"
      />

      <!-- Ancres invisibles des popovers, alignés à droite sur leur bouton comme sur la maquette -->
      <span ref="templatesAnchor" class="pop-anchor templates-anchor" aria-hidden="true"></span>
      <span ref="menuAnchor" class="pop-anchor menu-anchor" aria-hidden="true"></span>
    </div>

    <!-- Barre de progression, verte quand tout est coché -->
    <div
      v-if="progress.total"
      data-testid="task-checklist-bar"
      role="progressbar"
      :class="['bar', { done: complete }]"
      :aria-label="t('checklist.progressBar')"
      aria-valuemin="0"
      :aria-valuemax="progress.total"
      :aria-valuenow="progress.done"
      :aria-valuetext="progressLabel(progress.done, progress.total)"
    >
      <i :style="{ width: `${percent}%` }"></i>
    </div>

    <ChecklistItemsEditor
      ref="editor"
      :modelValue="modelValue"
      checkable
      :hideChecked="hideChecked"
      @update:modelValue="(items) => emit('update:modelValue', items)"
    >
      <template #after-items>
        <p v-if="hideChecked && progress.done" class="hidden-note" data-testid="task-checklist-hidden-note">
          {{ t('checklist.hiddenNote', { count: progress.done }, progress.done) }} ·
          <button type="button" @click="hideChecked = false">{{ t('checklist.show') }}</button>
        </p>
      </template>
    </ChecklistItemsEditor>

    <Message v-if="error" severity="error" size="small" variant="simple" data-testid="task-checklist-error">
      {{ error }}
    </Message>

    <!-- Actions de la checklist (parcours P3). Échap referme le menu sans fermer le dialogue. -->
    <Menu
      ref="menu"
      :model="menuItems"
      popup
      class="checklist-menu"
      data-testid="checklist-menu"
      @show="onOverlayShow"
      @hide="onOverlayHide"
    />

    <!-- Points d'un modèle à ajouter (parcours P2), dans l'ordre de la page Checklists -->
    <Popover ref="templatesPop" class="checklist-pop" @show="onTemplatesShow" @hide="onTemplatesHide">
      <div class="pop templates-pop" data-testid="checklist-templates" role="dialog" :aria-label="t('checklist.templatesTitle')">
        <div class="pop-title">{{ t('checklist.templatesTitle') }}</div>

        <label v-if="usableTemplates.length > SEARCH_THRESHOLD" class="pop-search">
          <i class="pi pi-search" aria-hidden="true"></i>
          <input
            v-model="search"
            data-testid="checklist-template-search"
            type="text"
            autocomplete="off"
            spellcheck="false"
            autofocus
            :placeholder="t('checklists.search')"
            :aria-label="t('checklists.search')"
          />
        </label>

        <div class="pop-list">
          <button
            v-for="template in shownTemplates"
            :key="template.id"
            type="button"
            class="pop-item"
            data-testid="checklist-template-option"
            :data-template-id="template.id"
            @click="applyTemplate(template)"
          >
            <i class="pi pi-list-check" aria-hidden="true"></i>
            <span class="pop-item-label" data-testid="checklist-template-name">{{ template.name }}</span>
            <span class="n">{{ t('checklists.itemCount', { count: template.items.length }, template.items.length) }}</span>
          </button>
        </div>

        <p v-if="noTemplates" class="pop-note" data-testid="checklist-templates-empty">
          {{ t('checklist.noTemplates') }}
        </p>
        <p v-else-if="usableTemplates.length && !shownTemplates.length" class="pop-note">
          {{ t('checklists.noMatch') }}
        </p>

        <hr />
        <button type="button" class="pop-link" data-testid="btn-manage-templates" @click="openChecklistsPage">
          <template v-if="noTemplates">
            <i class="pi pi-plus" aria-hidden="true"></i>{{ t('checklist.createTemplate') }}
          </template>
          <template v-else><i class="pi pi-cog" aria-hidden="true"></i>{{ t('checklist.manageTemplates') }}</template>
        </button>
      </div>
    </Popover>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Popover from 'primevue/popover'
import Menu from 'primevue/menu'
import type { MenuItem } from 'primevue/menuitem'
import { useConfirm } from 'primevue/useconfirm'
import { useI18n } from 'vue-i18n'
import ChecklistItemsEditor, { type ChecklistEditorItem, newChecklistEditorItem } from './ChecklistItemsEditor.vue'
import { useChecklistTemplateStore } from '../stores/ChecklistTemplate'
import type { ChecklistTemplate } from '../types/checklistTemplate.types'
import { appendTemplateItems, checklistProgress, progressLabel, progressPercent } from '../utils/checklist.helper'
import { normalizeSearchText } from '../utils/search.helper'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'

/**
 * Section « Checklist » du dialogue de tâche (parcours P1 et P3), sous la
 * description. Les points font partie de la valeur du formulaire, rien n'est
 * écrit avant « Enregistrer » et « Annuler » abandonne tout.
 *
 * « Depuis un modèle » (parcours P2) copie les points d'un modèle à la fin de
 * la liste, décochés, sans garder de lien. Les modèles sans point ne sont pas
 * proposés, une recherche apparaît au-delà de `SEARCH_THRESHOLD` modèles.
 *
 * Le menu ⋯ coche ou décoche tout, masque les points cochés (réglage de
 * l'affichage seulement, oublié à la fermeture du dialogue) et vide la liste.
 */

/** Nombre de modèles au-delà duquel le popover propose une recherche. */
const SEARCH_THRESHOLD = 8

const props = defineProps<{
  modelValue: ChecklistEditorItem[]
  error?: string // erreur de validation du champ
  // Vrai si le dialogue de tâche a des modifications non enregistrées, que
  // quitter le tableau ferait perdre
  hasPendingChanges: () => boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [items: ChecklistEditorItem[]]
}>()

const { t } = useI18n()
const logger = getLogger()
const router = useRouter()
const confirm = useConfirm()
const showError = useErrorToast()
const templateStore = useChecklistTemplateStore()

const editor = ref<InstanceType<typeof ChecklistItemsEditor> | null>(null)

// Popover des modèles
const templatesPop = ref<InstanceType<typeof Popover> | null>(null)
const templatesAnchor = ref<HTMLElement | null>(null)
const templatesOpen = ref(false)
const loaded = ref(false)
const search = ref('')

// Menu ⋯ et affichage des points cochés
const menu = ref<InstanceType<typeof Menu> | null>(null)
const menuAnchor = ref<HTMLElement | null>(null)
const hideChecked = ref(false)

// Modèles proposés, dans l'ordre de la page Checklists, sans ceux qui n'ont aucun point
const usableTemplates = computed(() => templateStore.getAllTemplates.filter((template) => template.items.length))

// Aucun modèle à proposer, une fois la liste chargée
const noTemplates = computed(() => loaded.value && !usableTemplates.value.length)

const shownTemplates = computed(() => {
  const query = normalizeSearchText(search.value)
  if (!query || usableTemplates.value.length <= SEARCH_THRESHOLD) return usableTemplates.value
  return usableTemplates.value.filter((template) => normalizeSearchText(template.name).includes(query))
})

const progress = computed(() => checklistProgress(props.modelValue))
const complete = computed(() => progress.value.total > 0 && progress.value.done === progress.value.total)
const percent = computed(() => progressPercent(progress.value))

// Calculé pour suivre la langue de l'interface et l'état de la liste
const menuItems = computed<MenuItem[]>(() => {
  const empty = !props.modelValue.length
  return [
    {
      label: t('checklist.checkAll'),
      icon: 'pi pi-check-square',
      disabled: empty,
      command: () => setAllChecked(true),
    },
    {
      label: t('checklist.uncheckAll'),
      icon: 'pi pi-stop',
      disabled: empty,
      command: () => setAllChecked(false),
    },
    {
      label: hideChecked.value ? t('checklist.showChecked') : t('checklist.hideChecked'),
      icon: hideChecked.value ? 'pi pi-eye' : 'pi pi-eye-slash',
      disabled: empty && !hideChecked.value,
      command: () => (hideChecked.value = !hideChecked.value),
    },
    { separator: true },
    {
      label: t('checklist.clear'),
      icon: 'pi pi-eraser',
      class: 'checklist-menu-danger',
      disabled: empty,
      command: () => emit('update:modelValue', []),
    },
  ]
})

/**
 * Bouton « Depuis un modèle », point d'ancrage des confirmations et retour du focus
 */
function fromTemplateButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="btn-checklist-from-template"]')
}

/**
 * Charge les modèles (depuis le cache s'il est encore valide)
 * @returns Vrai si la liste est à jour
 */
async function loadTemplates(): Promise<boolean> {
  try {
    await templateStore.loadAllTemplates()
    loaded.value = true
    return true
  } catch (error) {
    logger.error('Erreur lors du chargement des modèles pour le dialogue de tâche :', error)
    return false
  }
}

/**
 * Ouvre ou ferme le popover des modèles, ancré sous le bouton et aligné sur
 * son bord droit
 * @param event Clic sur « Depuis un modèle »
 */
async function toggleTemplates(event: MouseEvent) {
  templatesPop.value?.toggle(event, templatesAnchor.value ?? undefined)
  if (!(await loadTemplates()) && !templateStore.getAllTemplates.length) {
    showError(t('board.loadFailed'), t('checklists.loadFailedDetail'))
  }
}

// Overlays ouverts (popover des modèles, menu ⋯), qu'Échap doit refermer seuls
let openOverlays = 0

/**
 * Échap avec le popover des modèles ou le menu ⋯ ouvert. Écouté en capture
 * sur la fenêtre, avant le `Dialog` qui se fermerait sinon avec eux : seul
 * l'overlay se ferme, et le focus revient à son bouton.
 * @param event Touche pressée
 */
function onOverlayEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()

  const button = templatesOpen.value
    ? fromTemplateButton()
    : document.querySelector<HTMLElement>('[data-testid="btn-checklist-menu"]')
  templatesPop.value?.hide()
  menu.value?.hide()
  void nextTick(() => button?.focus())
}

function onOverlayShow() {
  if (openOverlays++ === 0) globalThis.addEventListener('keydown', onOverlayEscape, true)
}

function onOverlayHide() {
  openOverlays = Math.max(0, openOverlays - 1)
  if (openOverlays === 0) globalThis.removeEventListener('keydown', onOverlayEscape, true)
}

/**
 * Popover des modèles affiché, le clavier passe au premier champ ou modèle
 */
function onTemplatesShow() {
  templatesOpen.value = true
  onOverlayShow()
  void nextTick(() =>
    document
      .querySelector<HTMLElement>(
        '[data-testid="checklist-template-search"], [data-testid="checklist-template-option"], [data-testid="btn-manage-templates"]',
      )
      ?.focus(),
  )
}

function onTemplatesHide() {
  templatesOpen.value = false
  search.value = ''
  onOverlayHide()
}

/**
 * Copie les points d'un modèle à la fin de la checklist, puis ferme le popover
 * @param template Modèle choisi
 */
function applyTemplate(template: ChecklistTemplate) {
  emit(
    'update:modelValue',
    appendTemplateItems(props.modelValue, template, (text) => newChecklistEditorItem(text)),
  )
  templatesPop.value?.hide()
}

/**
 * Ouvre la page Checklists. Le tableau, et le dialogue avec lui, est alors
 * quitté, une confirmation est donc demandée si la tâche a des modifications
 * non enregistrées.
 */
function openChecklistsPage() {
  templatesPop.value?.hide()
  const leave = () => void router.push({ name: 'Checklists' })
  const target = fromTemplateButton()
  if (!props.hasPendingChanges() || !target) {
    leave()
    return
  }

  confirm.require({
    target,
    message: t('checklist.leaveConfirm'),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: t('common.cancel'),
      severity: 'secondary',
      outlined: true,
      'data-testid': 'btn-confirm-reject',
    },
    acceptProps: { label: t('checklist.leave'), severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: leave,
  })
}

/**
 * Coche ou décoche tous les points
 * @param checked Nouvel état de tous les points
 */
function setAllChecked(checked: boolean) {
  emit(
    'update:modelValue',
    props.modelValue.map((item) => (item.isChecked === checked ? item : { ...item, isChecked: checked })),
  )
}

/**
 * Ouvre ou ferme le menu ⋯, aligné sur le bord droit de son bouton
 * @param event Clic sur le bouton
 */
function toggleMenu(event: MouseEvent) {
  menu.value?.toggle(event, menuAnchor.value ?? undefined)
}

// Modèles chargés dès l'ouverture du dialogue, le popover s'affiche ainsi complet
onMounted(() => void loadTemplates())

onBeforeUnmount(() => globalThis.removeEventListener('keydown', onOverlayEscape, true))

/**
 * Ajoute le point en cours de saisie dans « Ajouter un point », à appeler
 * avant d'enregistrer la tâche par un raccourci (le champ garde le focus)
 */
function commitPending() {
  editor.value?.commitPending()
}

defineExpose({ commitPending })
</script>

<style scoped>
@reference "tailwindcss";

.task-checklist {
  @apply relative flex flex-col gap-1.5;
}

.cl-head {
  @apply flex min-h-7 items-center gap-2;
}

.cl-head .field-label {
  @apply flex-none;
}

/* Avancement « 3/6 », chiffres à chasse fixe, vert quand tout est coché */
.cl-progress {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.cl-progress.done {
  @apply font-semibold;
  color: var(--p-green-600);
}

.app-dark .cl-progress.done {
  color: var(--p-green-400);
}

/* Barre de progression, sur la surface des colonnes */
.bar {
  @apply overflow-hidden;
  height: 5px;
  border-radius: 3px;
  background-color: var(--p-surface-200);
}

.app-dark .bar {
  background-color: var(--p-surface-900);
}

.bar i {
  @apply block h-full;
  border-radius: 3px;
  background-color: var(--p-primary-color);
  transition: width 0.25s ease;
}

.bar.done i {
  background-color: var(--p-green-600);
}

.app-dark .bar.done i {
  background-color: var(--p-green-400);
}

@media (prefers-reduced-motion: reduce) {
  .bar i {
    transition: none;
  }
}

/* « Depuis un modèle », petit bouton texte à l'accent */
.cl-from-template {
  height: 28px;
  padding: 0 8px !important;
  font-size: 13px !important;
  gap: 6px !important;
}

/* Bouton ⋯ aussi compact que les icônes de la maquette */
.cl-menu-btn {
  width: 28px !important;
  height: 28px !important;
}

/* Note des points cochés masqués, alignée sur le texte des points */
.hidden-note {
  @apply m-0;
  padding-left: 48px;
  font-size: 12.5px;
  color: var(--p-text-muted-color);
}

.hidden-note button {
  @apply cursor-pointer border-0 bg-transparent p-0;
  font: inherit;
  color: var(--p-primary-color);
}

.hidden-note button:hover {
  text-decoration: underline;
}

/* Ancres des popovers, de la largeur du popover, calées sur le bord droit de leur bouton */
.pop-anchor {
  @apply pointer-events-none invisible absolute top-0 h-7;
}

.templates-anchor {
  right: 36px;
  width: 280px;
}

.menu-anchor {
  right: 0;
  width: 250px;
}

/* Contenu des popovers (rendu dans le body, le style scoped s'applique au contenu du slot) */
.pop {
  @apply flex flex-col;
}

.templates-pop {
  width: 280px;
}

.pop-title {
  padding: 6px 8px 4px;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.pop-search {
  @apply mx-1 my-1 flex h-8 shrink-0 items-center gap-2 rounded-md pr-2 pl-2.5 text-[13px];
  border: 1px solid var(--p-form-field-border-color);
  background-color: var(--p-form-field-background);
  color: var(--p-text-muted-color);
  cursor: text;
}

.pop-search:focus-within {
  border-color: var(--p-primary-color);
}

.pop-search input {
  @apply min-w-0 flex-1 border-0 bg-transparent outline-none;
  font: inherit;
  color: var(--p-text-color);
}

.pop-list {
  @apply flex flex-col overflow-y-auto;
  max-height: 18rem;
}

.pop-item {
  @apply flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent text-left;
  padding: 7px 8px;
  font: inherit;
  color: var(--p-text-color);
}

.pop-item:hover,
.pop-item:focus-visible {
  background-color: var(--p-content-hover-background);
  outline: none;
}

.pop-item .pi {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.pop-item-label {
  @apply min-w-0 truncate;
}

.pop-item .n {
  @apply ml-auto shrink-0 pl-2;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.pop-note {
  @apply m-0;
  padding: 4px 8px 6px;
  font-size: 13px;
  color: var(--p-text-muted-color);
}

.pop hr {
  @apply w-auto border-0;
  margin: 4px 2px;
  border-top: 1px solid var(--p-content-border-color);
}

.pop-link {
  @apply flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent text-left;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  color: var(--p-primary-color);
}

.pop-link:hover,
.pop-link:focus-visible {
  background-color: var(--p-highlight-background);
  outline: none;
}

.pop-link .pi {
  font-size: 0.8125rem;
}
</style>

<style>
/* Popovers de la checklist, ajoutés au body : sans flèche, collés à leur
   bouton, bordure et ombre de la maquette */
.checklist-pop.p-popover {
  margin-top: 4px;
  border-color: var(--p-content-border-color);
  border-radius: 8px;
  box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.45);
}

.checklist-pop.p-popover-flipped {
  margin-top: -4px;
}

.checklist-pop.p-popover::before,
.checklist-pop.p-popover::after {
  display: none;
}

.checklist-pop .p-popover-content {
  padding: 6px;
}

/* Menu ⋯, mêmes lignes que les popovers de la maquette */
.checklist-menu.p-menu {
  min-width: 250px;
  margin-top: 4px;
  padding: 6px;
  border-color: var(--p-content-border-color);
  border-radius: 8px;
  box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.45);
}

.checklist-menu .p-menu-list {
  padding: 0;
}

.checklist-menu .p-menu-item-link {
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
}

.checklist-menu .p-menu-item-icon {
  font-size: 0.875rem;
}

.checklist-menu .p-menu-separator {
  margin: 4px 2px;
  border-top-color: var(--p-content-border-color);
}

.checklist-menu .checklist-menu-danger .p-menu-item-icon,
.checklist-menu .checklist-menu-danger .p-menu-item-label {
  color: var(--p-red-600);
}

.app-dark .checklist-menu .checklist-menu-danger .p-menu-item-icon,
.app-dark .checklist-menu .checklist-menu-danger .p-menu-item-label {
  color: var(--p-red-400);
}
</style>
