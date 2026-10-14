<template>
  <section data-testid="template-editor" :data-template-id="template.id" class="tpl-editor">
    <div class="tpl-editor-head">
      <input
        ref="nameInput"
        v-model="name"
        data-testid="template-name-input"
        type="text"
        spellcheck="false"
        :class="['tpl-title', { invalid: !!nameError }]"
        :maxlength="CHECKLIST_TEMPLATE_NAME_MAX_LENGTH"
        :aria-label="t('checklists.nameLabel')"
        :aria-invalid="!!nameError"
        :aria-describedby="nameError ? errorId : undefined"
        @input="onNameInput"
        @keydown.enter.prevent="onNameEnter"
        @keydown.esc.prevent.stop="revertName"
      />
      <Button
        icon="pi pi-ellipsis-h"
        data-testid="btn-template-menu"
        :aria-label="t('checklists.actions')"
        :title="t('checklists.actions')"
        aria-haspopup="true"
        severity="secondary"
        text
        rounded
        @click="toggleMenu"
      />
    </div>

    <Message
      v-if="nameError"
      :id="errorId"
      data-testid="template-name-error"
      class="tpl-error"
      severity="error"
      size="small"
      variant="simple"
    >
      {{ nameError }}
    </Message>

    <div class="tpl-meta">
      <span data-testid="template-item-count">{{ t('checklists.itemCount', { count: itemCount }, itemCount) }}</span>
      <span aria-hidden="true">·</span>
      <span data-testid="template-save-status" :data-status="status" :class="['saved', `is-${status}`]" role="status">
        <i v-if="status === 'saved'" class="pi pi-check" aria-hidden="true"></i>
        {{ statusLabel }}
      </span>
    </div>

    <ChecklistItemsEditor ref="itemsEditor" :modelValue="items" @update:modelValue="onItems" />

    <p class="tpl-hint">{{ t('checklists.hint') }}</p>

    <Menu ref="menu" :model="menuItems" popup class="template-menu" data-testid="template-menu" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Message from 'primevue/message'
import { useI18n } from 'vue-i18n'
import ChecklistItemsEditor, { type ChecklistEditorItem, newChecklistEditorItem } from '../ChecklistItemsEditor.vue'
import { useChecklistTemplateStore } from '../../stores/ChecklistTemplate'
import type { ChecklistTemplate, ChecklistTemplateChanges } from '../../types/checklistTemplate.types'
import { httpStatus } from '../../utils/api.helper'
import { getLogger } from '../../utils/logger'
import { useErrorToast } from '../../utils/toast.helper'
import { templateKey } from '../../../main/shared/checklistTemplate.helper'
import { CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } from '../../../main/shared/checklist.constants'

/**
 * Volet droit de la page Checklists, édition d'un modèle. Le nom et les
 * points s'enregistrent seuls, 500 ms après la dernière modification.
 *
 * Le composant est recréé à chaque changement de modèle (`key` de la page),
 * son démontage envoie donc tout de suite les modifications en attente. La
 * fermeture de la fenêtre les envoie aussi, par une requête qui survit à la
 * page (cf. api.patchOnUnload).
 *
 * Les requêtes partent l'une après l'autre. Un nom vide ou déjà pris n'est
 * pas envoyé, l'erreur s'affiche sous le champ et la saisie reste en place,
 * les points continuent de s'enregistrer.
 */

/** Délai entre la dernière modification et l'enregistrement. */
const SAVE_DELAY = 500

/** Contenu d'un modèle tel que le serveur le connaît, ou le connaîtra. */
interface Snapshot {
  name: string
  items: string[]
}

const props = defineProps<{
  template: ChecklistTemplate // modèle lu à l'ouverture, le brouillon vit ensuite ici
  autofocusName?: boolean // curseur placé dans le nom, texte sélectionné (nouveau modèle)
}>()

const emit = defineEmits<{
  duplicate: []
  delete: [target: HTMLElement | undefined] // bouton ⋯, ancre de la confirmation
  focused: [] // le nom a reçu le focus demandé par `autofocusName`
}>()

const logger = getLogger()
const store = useChecklistTemplateStore()
const showError = useErrorToast()
const { t } = useI18n()
const errorId = useId()

const nameInput = ref<HTMLInputElement | null>(null)
const itemsEditor = ref<InstanceType<typeof ChecklistItemsEditor> | null>(null)
const menu = ref()
let menuTarget: HTMLElement | undefined

// Brouillon affiché
const name = ref(props.template.name)
const items = ref<ChecklistEditorItem[]>(props.template.items.map((item) => newChecklistEditorItem(item.text)))
const nameError = ref('')

// État de l'enregistrement
const status = ref<'saved' | 'saving' | 'error'>('saved')
let confirmed: Snapshot = snapshotOf(props.template) // dernier état accepté par le serveur
let expected: Snapshot = confirmed // état du serveur une fois les requêtes en cours terminées
let timer: ReturnType<typeof setTimeout> | undefined
let queue: Promise<void> = Promise.resolve()
let inFlight = 0
let failed = false
let discarded = false
let rejectedNameKey: string | null = null // nom refusé par le serveur (409)

const itemCount = computed(() => cleanTexts(items.value).length)

const statusLabel = computed(() => {
  if (status.value === 'saving') return t('checklists.saving')
  if (status.value === 'error') return t('checklists.notSaved')
  return t('checklists.saved')
})

// Calculé pour suivre la langue de l'interface
const menuItems = computed(() => [
  { label: t('checklists.duplicate'), icon: 'pi pi-copy', command: () => emit('duplicate') },
  {
    label: t('common.delete'),
    icon: 'pi pi-trash',
    class: 'template-menu-danger',
    // Après la fermeture du menu, pour que la confirmation ne soit pas refermée aussitôt
    command: () => setTimeout(() => emit('delete', menuTarget)),
  },
])

/**
 * Contenu d'un modèle renvoyé par le serveur
 * @param template Modèle
 */
function snapshotOf(template: ChecklistTemplate): Snapshot {
  return { name: template.name, items: template.items.map((item) => item.text) }
}

/**
 * Textes des points tels que le serveur les enregistre, nettoyés et sans les vides
 * @param list Points du brouillon
 */
function cleanTexts(list: ChecklistEditorItem[]): string[] {
  return list.map((item) => item.text.trim()).filter((text) => text !== '')
}

/**
 * Vrai si les deux listes de textes sont identiques, dans le même ordre
 * @param a Première liste
 * @param b Seconde liste
 */
function sameTexts(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((text, index) => text === b[index])
}

/**
 * Motif de refus du nom saisi, vide s'il est valable. Unicité sans tenir
 * compte de la casse, changer la casse de son propre nom reste permis.
 * @param clean Nom nettoyé
 */
function nameProblem(clean: string): string {
  if (!clean) return t('checklists.nameRequired')
  const key = templateKey(clean)
  if (key === rejectedNameKey) return t('checklists.nameTaken')
  const taken = store.getAllTemplates.some((other) => other.id !== props.template.id && templateKey(other.name) === key)
  return taken ? t('checklists.nameTaken') : ''
}

/**
 * Modification à envoyer pour amener le serveur au brouillon
 * @param base État supposé du serveur
 * @returns Les champs changés (vide si rien à envoyer) et le motif de refus du nom
 */
function changesFrom(base: Snapshot): { changes: ChecklistTemplateChanges; problem: string } {
  const changes: ChecklistTemplateChanges = {}
  const cleanName = name.value.trim()
  const problem = cleanName === base.name ? '' : nameProblem(cleanName)
  if (!problem && cleanName !== base.name) changes.name = cleanName

  const texts = cleanTexts(items.value)
  if (!sameTexts(texts, base.items)) changes.items = texts
  return { changes, problem }
}

/**
 * Met à jour l'indicateur d'enregistrement
 */
function refreshStatus() {
  if (timer !== undefined || inFlight > 0) status.value = 'saving'
  else if (failed || nameError.value) status.value = 'error'
  else status.value = 'saved'
}

/**
 * Programme l'enregistrement après la dernière modification
 */
function schedule() {
  if (discarded) return
  clearTimeout(timer)
  timer = setTimeout(() => void flush(), SAVE_DELAY)
  refreshStatus()
}

/**
 * Envoie tout de suite les modifications en attente (changement de modèle,
 * départ de la page, duplication). Ne lève jamais.
 * @returns Promesse résolue une fois toutes les requêtes terminées
 */
function flush(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  if (discarded) return queue

  const { changes, problem } = changesFrom(expected)
  nameError.value = problem

  if (Object.keys(changes).length) {
    const id = props.template.id
    expected = { name: changes.name ?? expected.name, items: changes.items ?? expected.items }
    inFlight++
    queue = queue.then(() => send(id, changes))
  }

  refreshStatus()
  return queue
}

/**
 * Envoie une modification, après celles déjà parties
 * @param id Id du modèle
 * @param changes Champs changés
 */
async function send(id: number, changes: ChecklistTemplateChanges) {
  let retry = false

  try {
    confirmed = snapshotOf(await store.updateTemplate(id, changes))
    failed = false
  } catch (error) {
    // Le serveur n'a rien écrit, la prochaine modification renverra tout ce qui manque
    expected = confirmed
    if (httpStatus(error) === 409 && changes.name !== undefined) {
      // Nom pris entre-temps, les points repartent sans lui
      rejectedNameKey = templateKey(changes.name)
      retry = true
    } else {
      failed = true
      logger.error(`Enregistrement automatique du modèle ${id} impossible :`, error)
      if (!discarded) showError(t('checklists.saveFailed'), t('checklists.saveFailedDetail'))
    }
  } finally {
    inFlight--
  }

  if (retry) void flush()
  refreshStatus()
}

/**
 * Envoie les modifications pas encore acceptées pendant la fermeture de la
 * fenêtre, les requêtes en cours pouvant être coupées
 */
function flushOnUnload() {
  clearTimeout(timer)
  timer = undefined
  if (discarded) return

  const { changes } = changesFrom(confirmed)
  if (Object.keys(changes).length) store.updateTemplateOnUnload(props.template.id, changes)
}

/**
 * Fenêtre masquée (fermeture vers la zone de notification), la page reste
 * en vie et enregistre normalement
 */
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') void flush()
}

/**
 * Abandonne les modifications en attente (modèle sur le point d'être supprimé)
 */
function discard() {
  discarded = true
  clearTimeout(timer)
  timer = undefined
}

function onNameInput() {
  nameError.value = ''
  schedule()
}

/**
 * Entrée dans le nom, enregistré tout de suite, puis passage aux points
 */
function onNameEnter() {
  void flush()
  itemsEditor.value?.focusNew()
}

/**
 * Échap dans le nom, retour au dernier nom enregistré
 */
function revertName() {
  name.value = confirmed.name
  nameError.value = ''
  schedule()
  nameInput.value?.blur()
}

/**
 * Nouvelle liste de points émise par l'éditeur
 * @param list Points du brouillon
 */
function onItems(list: ChecklistEditorItem[]) {
  items.value = list
  schedule()
}

/**
 * Ouvre le menu ⋯, ancré sur son bouton
 * @param event Clic sur le bouton
 */
function toggleMenu(event: MouseEvent) {
  menuTarget = event.currentTarget as HTMLElement
  menu.value?.toggle(event)
}

/**
 * Place le curseur dans le nom et le sélectionne
 */
async function focusName() {
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

onMounted(() => {
  globalThis.addEventListener('beforeunload', flushOnUnload)
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (props.autofocusName) {
    void focusName().then(() => emit('focused'))
  }
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('beforeunload', flushOnUnload)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  void flush()
})

defineExpose({ flush, discard, focusName })
</script>

<style scoped>
@reference "tailwindcss";

.tpl-editor {
  @apply flex max-w-[720px] flex-col gap-3.5;
  padding: 26px 40px;
}

.tpl-editor-head {
  @apply flex items-start gap-3;
}

/* Nom en titre, champ sans cadre souligné au survol et au focus */
.tpl-title {
  @apply min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-2xl font-bold outline-none;
  font-family: inherit;
  line-height: 1.5;
  color: var(--p-text-color);
  border-bottom: 1px solid transparent;
}

.tpl-title:hover {
  border-bottom-color: var(--p-form-field-border-color);
}

.tpl-title:focus {
  border-bottom-color: var(--p-primary-color);
}

.tpl-title.invalid {
  border-bottom-color: var(--p-red-600);
}

.app-dark .tpl-title.invalid {
  border-bottom-color: var(--p-red-400);
}

.tpl-error {
  margin-top: -8px;
}

.tpl-meta {
  @apply -mt-2 flex items-center gap-2.5 text-[13px];
  color: var(--p-text-muted-color);
}

.saved {
  @apply inline-flex items-center gap-1;
}

.saved .pi {
  font-size: 0.75rem;
}

.saved.is-saved {
  color: var(--p-green-600);
}

.app-dark .saved.is-saved {
  color: var(--p-green-400);
}

.saved.is-saving {
  color: var(--p-text-muted-color);
}

.saved.is-error {
  color: var(--p-red-600);
}

.app-dark .saved.is-error {
  color: var(--p-red-400);
}

.tpl-hint {
  @apply pt-3 text-[13px];
  color: var(--p-text-muted-color);
  border-top: 1px solid var(--p-content-border-color);
}
</style>

<style>
/* Menu ⋯ ajouté au body, hors de portée du style scoped */
.template-menu.p-menu {
  min-width: 200px;
}

.template-menu .template-menu-danger .p-menu-item-icon,
.template-menu .template-menu-danger .p-menu-item-label {
  color: var(--p-red-600);
}

.app-dark .template-menu .template-menu-danger .p-menu-item-icon,
.app-dark .template-menu .template-menu-danger .p-menu-item-label {
  color: var(--p-red-400);
}
</style>
