<template>
  <!-- Champ fermé : chips sélectionnées, un clic ouvre le sélecteur -->
  <button
    ref="fieldRef"
    type="button"
    data-testid="task-tags-field"
    class="tag-field"
    aria-haspopup="dialog"
    :aria-expanded="isOpen"
    @click="togglePanel"
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
  </button>

  <!-- Un seul popover : pas d'overlay imbriqué, fermeture au clic extérieur gérée par PrimeVue -->
  <Popover ref="popover" :closeOnEscape="false" @show="onShow" @hide="onHide">
    <div ref="panelRef" data-testid="tag-select-panel" class="tag-panel" tabindex="-1" @keydown="onPanelKeydown">
      <!-- Vue liste -->
      <template v-if="view === 'list'">
        <!-- Chips sélectionnées puis recherche -->
        <div class="tag-panel-search">
          <TagChip
            v-for="selection in visibleSelection"
            :key="selectionKey(selection)"
            data-testid="task-tag-chip"
            :tagId="selection.id"
            :name="selection.name"
            removable
            removeTestId="task-tag-chip-remove"
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

            <!-- Menu d'édition : mousedown et click arrêtés pour ne pas sélectionner l'option
               ni laisser le popover croire à un clic intérieur en attente -->
            <button
              type="button"
              data-testid="tag-option-menu"
              class="tag-option-menu"
              :aria-label="`Modifier le tag ${tag.name}`"
              @mousedown.stop
              @click.stop="openEditView(tag)"
            >
              <i class="pi pi-ellipsis-h"></i>
            </button>
          </div>

          <!-- Saisie sans tag correspondant : le tag est créé immédiatement -->
          <div
            v-if="showCreateOption"
            data-testid="tag-create-option"
            class="tag-option"
            :data-highlighted="createIndex === highlightedIndex ? 'true' : undefined"
            :aria-busy="isCreatingSearch || undefined"
            @click="createTag"
            @mouseenter="highlightedIndex = createIndex"
          >
            <span class="tag-create-label">Créer</span>
            <TagChip :name="trimmedSearch" />
            <i
              v-if="isCreatingSearch"
              class="pi pi-spinner pi-spin tag-option-check"
              aria-label="Création en cours"
            ></i>
          </div>
        </div>
      </template>

      <!-- Vue édition : remplace la liste dans le même popover -->
      <template v-else-if="editedTag">
        <div class="flex items-center gap-2">
          <Button
            data-testid="tag-edit-back"
            icon="pi pi-arrow-left"
            severity="secondary"
            size="small"
            text
            rounded
            aria-label="Retour à la liste des tags"
            @click="backToList"
          />
          <span class="font-medium text-sm">Modifier le tag</span>
        </div>

        <div class="flex flex-col gap-1">
          <!-- Input natif aux classes PrimeVue : un InputText s'enregistrerait auprès du
               FormField « tags » du TaskDialog et écraserait la valeur du formulaire -->
          <input
            ref="editNameRef"
            v-model="editName"
            type="text"
            data-testid="tag-edit-name"
            class="p-inputtext p-component p-inputtext-sm"
            :class="{ 'p-invalid': !!editError }"
            aria-label="Nom du tag"
            :aria-invalid="!!editError || undefined"
            @input="editError = ''"
            @keydown="onEditNameKeydown"
          />
          <small v-if="editError" data-testid="tag-edit-error" class="tag-edit-error">{{ editError }}</small>
        </div>

        <p data-testid="tag-edit-count" class="tag-panel-hint">{{ usageLabel(editedTag.taskCount ?? 0) }}</p>

        <!-- Couleurs : un clic applique immédiatement -->
        <p class="tag-panel-hint">Couleurs</p>
        <div class="grid grid-cols-2 gap-0.5">
          <button
            v-for="color in TAG_COLOR_STYLES"
            :key="color.name"
            type="button"
            data-testid="tag-edit-color"
            class="tag-color-option"
            :data-color="color.name"
            :data-selected="editedTag.color === color.name ? 'true' : undefined"
            @click="applyColor(color.name)"
          >
            <span class="tag-color-swatch" :style="swatchVars(color)"></span>
            <span class="flex-1 text-left text-sm">{{ color.label }}</span>
            <i v-if="editedTag.color === color.name" class="pi pi-check text-xs"></i>
          </button>
        </div>

        <!-- Suppression en bas, séparée des réglages : action destructive, confirmée sur place -->
        <div class="tag-edit-footer">
          <div v-if="confirmingDelete" class="tag-delete-box">
            <p class="text-sm">{{ deleteQuestion(editedTag) }}</p>
            <div class="flex gap-2">
              <Button
                data-testid="tag-delete-cancel"
                label="Annuler"
                severity="secondary"
                size="small"
                class="flex-1"
                @click="cancelDelete"
              />
              <Button
                data-testid="tag-delete-confirm"
                label="Supprimer"
                severity="danger"
                size="small"
                class="flex-1"
                :loading="deleting"
                @click="confirmDelete"
              />
            </div>
          </div>
          <Button
            v-else
            data-testid="tag-edit-delete"
            label="Supprimer"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            text
            class="self-start"
            @click="askDelete"
          />
        </div>
      </template>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import Popover from 'primevue/popover'
import Button from 'primevue/button'
import TagChip from './TagChip.vue'
import { useTagStore } from '../stores/Tag'
import { Tag, TagColor, TagSelection } from '../types/tag.types'
import { TAG_COLOR_STYLES, TagColorStyle } from '../constants/tag.constants'
import { TAG_NAME_MAX_LENGTH } from '../schemas/task.schema'
import { getLogger } from '../utils/logger'
import { useErrorToast } from '../utils/toast.helper'
import { httpStatus } from '../utils/api.helper'

/**
 * Sélecteur de tags façon Notion, branché au formulaire de TaskDialog.
 *
 * La valeur est une liste de `TagSelection`, chaque tag par son id (nom et
 * couleur lus dans le store). « Créer « xxx » » crée le tag immédiatement en
 * base puis le sélectionne : il a aussitôt son menu « … ».
 *
 * Le menu « … » d'un tag existant ouvre la vue édition (renommer, recolorer,
 * supprimer). Ces éditions sont enregistrées immédiatement via le store, sans
 * attendre le Save de la tâche, et un tag supprimé sort de la sélection.
 */
const props = defineProps<{
  modelValue: TagSelection[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TagSelection[]]
}>()

/** Message affiché quand le nom est déjà porté par un autre tag */
const TAG_NAME_TAKEN = 'Un tag porte déjà ce nom'

const logger = getLogger()
const tagStore = useTagStore()
const showError = useErrorToast()

const popover = ref()
const fieldRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const editNameRef = ref<HTMLInputElement | null>(null)

const isOpen = ref(false)
const search = ref('')
const highlightedIndex = ref(-1)

// Vue édition
const view = ref<'list' | 'edit'>('list')
const editedTagId = ref<number | null>(null)
const editName = ref('')
const editError = ref('')
const confirmingDelete = ref(false)
const deleting = ref(false)

// Noms (en minuscules) des tags en cours de création, contre une double création
const creatingNames = reactive(new Set<string>())

// Créations lancées et pas encore terminées, sélection comprise (hors état réactif)
const pendingCreations = new Set<Promise<void>>()

// Renommage envoyé et pas encore terminé (hors état réactif, rien à afficher)
let renameInFlight: { tagId: number; name: string; promise: Promise<boolean> } | null = null

// Tag édité, lu dans le store (undefined une fois supprimé)
const editedTag = computed(() => (editedTagId.value === null ? undefined : tagStore.getTagById(editedTagId.value)))

/**
 * Compare deux noms de tag sans tenir compte de la casse
 */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

// Sélection affichable : un tag supprimé entre-temps n'a plus de chip
const visibleSelection = computed(() =>
  props.modelValue.filter(
    (selection) =>
      selection.id === undefined || !!tagStore.getTagById(selection.id) || !tagStore.wasDeleted(selection.id),
  ),
)

const trimmedSearch = computed(() => search.value.trim())

// Tags existants dont le nom contient la saisie
const filteredTags = computed(() => {
  const query = trimmedSearch.value.toLowerCase()
  return tagStore.getAllTags.filter((tag) => tag.name.toLowerCase().includes(query))
})

// « Créer « xxx » » seulement si la saisie ne correspond exactement à aucun tag existant
const showCreateOption = computed(() => {
  const name = trimmedSearch.value
  return !!name && !tagStore.getAllTags.some((tag) => sameName(tag.name, name))
})

// La saisie est-elle déjà en cours de création ?
const isCreatingSearch = computed(() => creatingNames.has(trimmedSearch.value.toLowerCase()))

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
  if (exactIndex === -1) {
    highlightedIndex.value = itemCount.value > 0 ? 0 : -1
  } else {
    highlightedIndex.value = exactIndex
  }
}

watch([trimmedSearch, itemCount], resetHighlight)

// Le champ fermé change de hauteur quand des chips s'ajoutent ou disparaissent : le
// popover ouvert est recalé sous lui (PrimeVue n'observe que la taille du popover)
watch(
  () => visibleSelection.value.length,
  () => {
    if (isOpen.value) nextTick(() => popover.value?.alignOverlay())
  },
)

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

/**
 * Fermeture du popover : un renommage en cours est enregistré, puis le
 * sélecteur repart de la vue liste à la prochaine ouverture
 */
function onHide() {
  isOpen.value = false

  // commitRename lit le tag et la saisie avant sa première attente, donc avant la remise à zéro
  if (view.value === 'edit') void commitRename(false)

  view.value = 'list'
  editedTagId.value = null
  editError.value = ''
  confirmingDelete.value = false
  search.value = ''
}

// Dialogue fermé popover ouvert : le renommage en cours est enregistré lui aussi
onBeforeUnmount(() => {
  if (isOpen.value && view.value === 'edit') void commitRename(false)
})

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
 * Crée immédiatement le tag saisi puis le sélectionne. Une seconde
 * validation du même nom pendant l'appel (double Entrée, double clic) est
 * ignorée. En cas d'erreur, toast et rien n'est sélectionné.
 */
function createTag() {
  const name = trimmedSearch.value
  const key = name.toLowerCase()
  if (!showCreateOption.value || creatingNames.has(key)) return

  creatingNames.add(key)
  const creation = createAndSelect(name).finally(() => {
    creatingNames.delete(key)
    pendingCreations.delete(creation)
  })
  pendingCreations.add(creation)
  focusSearch()
}

/**
 * Appelle le store puis ajoute le tag à la sélection
 * @param name Nom saisi, nettoyé
 */
async function createAndSelect(name: string): Promise<void> {
  try {
    // createTag est suivi par le store dès cet appel : l'enregistrement de la tâche l'attendra
    const tag = await tagStore.createTag(name)

    // Sélection lue après l'appel, elle a pu changer entre-temps
    if (!isSelected(tag.id)) {
      emit('update:modelValue', [...props.modelValue, { id: tag.id, name: tag.name }])
    }

    // La recherche n'est vidée que si elle n'a pas été modifiée pendant l'appel
    if (sameName(search.value.trim(), name)) search.value = ''
  } catch {
    // Le store a journalisé l'erreur et n'a rien modifié
    showError('Création impossible', `Le tag « ${name} » n'a pas été créé.`)
  }
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

  // Saisie déjà en cours de création : la sélection suivra la fin de l'appel
  if (trimmedSearch.value && isCreatingSearch.value) return

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
 * Échap, sans remonter jusqu'au Dialog qui se fermerait aussi.
 * Vue liste : ferme le sélecteur. Vue édition : annule la confirmation de
 * suppression ou la saisie du nom en cours, sinon revient à la liste.
 */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  event.preventDefault()
  event.stopPropagation()

  if (view.value === 'list') {
    closePanel()
    return
  }

  if (confirmingDelete.value) {
    cancelDelete()
    return
  }

  const tag = editedTag.value
  if (tag && editName.value !== tag.name) {
    editName.value = tag.name
    editError.value = ''
    return
  }

  showList()
}

/**
 * Libellé du nombre de tâches qui portent un tag
 * @param count Nombre de tâches
 */
function usageLabel(count: number): string {
  return `Utilisé par ${count} ${count === 1 ? 'tâche' : 'tâches'}`
}

/**
 * Question de confirmation de la suppression d'un tag
 * @param tag Tag à supprimer
 */
function deleteQuestion(tag: Tag): string {
  const count = tag.taskCount ?? 0
  return `Supprimer « ${tag.name} » ? Il sera retiré de ${count} ${count === 1 ? 'tâche' : 'tâches'}.`
}

/**
 * Teintes d'une pastille de couleur, claire et sombre
 * @param color Couleur de la palette
 */
function swatchVars(color: TagColorStyle) {
  return { '--swatch': color.swatch }
}

/**
 * Focus sur le panneau quand l'élément qui avait le focus disparaît
 * (sinon Échap partirait du document et fermerait le Dialog)
 */
function focusPanel() {
  nextTick(() => panelRef.value?.focus())
}

/**
 * Ouvre la vue édition d'un tag existant
 * @param tag Tag à éditer
 */
function openEditView(tag: Tag) {
  editedTagId.value = tag.id
  editName.value = tag.name
  editError.value = ''
  confirmingDelete.value = false
  view.value = 'edit'

  nextTick(() => editNameRef.value?.focus())
}

/**
 * Retour à la vue liste, sans enregistrer
 */
function showList() {
  view.value = 'list'
  editedTagId.value = null
  editError.value = ''
  confirmingDelete.value = false
  focusSearch()
}

/**
 * Bouton ← : enregistre le renommage puis revient à la liste.
 * Un renommage refusé laisse la vue édition ouverte avec son message.
 */
async function backToList() {
  if (await commitRename(true)) showList()
}

// Le tag édité a disparu du store (supprimé) : retour à la liste
watch(editedTag, (tag) => {
  if (view.value === 'edit' && !tag) showList()
})

/**
 * Contrôle d'un nouveau nom : 1 à 30 caractères, unique sans tenir compte
 * de la casse parmi les autres tags (changer la casse de son propre nom est permis)
 * @param name Nom nettoyé
 * @param tagId Id du tag renommé
 * @returns Le message d'erreur, ou une chaîne vide si le nom est valide
 */
function validateTagName(name: string, tagId: number): string {
  if (!name) return 'Le nom du tag est obligatoire'
  if (name.length > TAG_NAME_MAX_LENGTH) return `${TAG_NAME_MAX_LENGTH} caractères maximum`
  if (tagStore.getAllTags.some((tag) => tag.id !== tagId && sameName(tag.name, name))) return TAG_NAME_TAKEN
  return ''
}

/**
 * Refuse un renommage : le nom d'origine est rétabli et le message affiché sous
 * le champ, ou en toast si le popover est déjà fermé
 */
function rejectRename(tag: Tag, message: string, inline: boolean): false {
  if (editedTagId.value === tag.id) editName.value = tag.name

  if (inline) {
    editError.value = message
  } else {
    showError('Renommage annulé', message)
  }

  return false
}

/**
 * Enregistre le nom saisi dans la vue édition (Entrée, ←, fermeture du menu)
 * @param inline Message d'erreur sous le champ (vue encore ouverte) plutôt qu'en toast
 * @returns true si le nom est enregistré ou inchangé
 */
async function commitRename(inline: boolean): Promise<boolean> {
  const tag = editedTag.value
  if (!tag) return true

  const name = editName.value.trim()
  if (name === tag.name) {
    editName.value = tag.name
    return true
  }

  const invalid = validateTagName(name, tag.id)
  if (invalid) return rejectRename(tag, invalid, inline)

  // Même renommage déjà en vol (Entrée puis Save, Save puis fermeture du popover) :
  // on le rejoint au lieu d'envoyer un second PATCH (et un second message d'erreur)
  if (renameInFlight && renameInFlight.tagId === tag.id && renameInFlight.name === name) {
    return renameInFlight.promise
  }

  const promise = sendRename(tag, name, inline)
  const inFlight = { tagId: tag.id, name, promise }
  renameInFlight = inFlight
  promise.finally(() => {
    if (renameInFlight === inFlight) renameInFlight = null
  })

  return promise
}

/**
 * Envoie un renommage déjà validé localement
 * @param tag Tag renommé
 * @param name Nouveau nom nettoyé
 * @param inline Message d'erreur sous le champ plutôt qu'en toast
 * @returns true si le nom est enregistré
 */
async function sendRename(tag: Tag, name: string, inline: boolean): Promise<boolean> {
  try {
    // updateTag est appelé sans attente préalable : l'édition est suivie par le
    // store dès cet appel, avant tout enregistrement de la tâche qui l'attendrait
    const updatedTag = await tagStore.updateTag(tag.id, { name })
    if (editedTagId.value === tag.id) editName.value = updatedTag.name
    logger.debug('Tag renommé', updatedTag)
    return true
  } catch (error) {
    // Nom pris ou refusé par le serveur : même traitement qu'un refus local
    const status = httpStatus(error)
    if (status === 409) return rejectRename(tag, TAG_NAME_TAKEN, inline)
    if (status === 400) return rejectRename(tag, 'Nom de tag invalide', inline)

    // Erreur réseau : retour à l'état d'avant
    if (editedTagId.value === tag.id) editName.value = tag.name
    showError('Renommage annulé')
    return false
  }
}

/**
 * Termine tout ce qui est en cours puis renvoie la sélection finale : enregistre
 * le renommage saisi dans la vue édition, attend les créations (sélection
 * comprise) et toutes les éditions de tags, puis le rendu qui propage la valeur.
 * Appelé par TaskDialog avant d'enregistrer la tâche : rien ne garantit que la
 * fermeture du popover (clic extérieur) passe avant la soumission, ni qu'un
 * tag créé juste avant le Save soit déjà sélectionné, et les valeurs de
 * soumission du formulaire sont figées au clic.
 * Ne lève jamais : un renommage refusé laisse le nom d'origine (message en toast),
 * une création échouée ne sélectionne rien.
 * @returns Sélection finale, sans les tags supprimés
 */
async function settle(): Promise<TagSelection[]> {
  if (view.value === 'edit') await commitRename(false)

  // Boucle, une création pouvant démarrer pendant l'attente des précédentes
  while (pendingCreations.size) {
    await Promise.allSettled(pendingCreations)
  }

  await tagStore.waitForPendingEdits()
  // La valeur émise revient par le FormField au rendu suivant
  await nextTick()

  return visibleSelection.value
}

defineExpose({ settle })

/**
 * Clavier du champ du nom : Entrée enregistre (Échap est géré par le panneau)
 */
function onEditNameKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return

  event.preventDefault()
  void commitRename(true)
}

/**
 * Applique immédiatement une couleur
 * @param color Couleur choisie
 */
async function applyColor(color: TagColor) {
  const tag = editedTag.value
  if (!tag || tag.color === color) return

  try {
    await tagStore.updateTag(tag.id, { color })
  } catch {
    // Le store n'a rien modifié : la couleur d'avant reste affichée
    showError('Couleur non modifiée')
  }
}

function askDelete() {
  confirmingDelete.value = true
  focusPanel()
}

function cancelDelete() {
  confirmingDelete.value = false
  focusPanel()
}

/**
 * Supprime le tag, qui sort aussi de la sélection en cours
 */
async function confirmDelete() {
  const tag = editedTag.value
  if (!tag || deleting.value) return

  const tagId = tag.id
  deleting.value = true

  try {
    await tagStore.deleteTag(tagId)
  } catch {
    showError('Suppression impossible', "Le tag n'a pas été supprimé.")
    confirmingDelete.value = false
    focusPanel()
    return
  } finally {
    deleting.value = false
  }

  emit(
    'update:modelValue',
    props.modelValue.filter((selection) => selection.id !== tagId),
  )
  showList()
}
</script>

<style scoped>
@reference "tailwindcss";

.tag-field {
  @apply flex flex-wrap items-center gap-1 w-full min-h-10 px-3 py-2 rounded-md border cursor-pointer text-left;
  font: inherit;
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

/* Hauteur fixe : PrimeVue repositionne le popover à chaque changement de taille de
   son contenu (ResizeObserver) et le bascule au-dessus du champ s'il manque de place
   en dessous. Avec une taille constante, il reste du même côté quelle que soit la vue. */
.tag-panel {
  @apply flex flex-col gap-2 w-72 h-[22rem] overflow-y-auto outline-none;
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
  @apply flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto;
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

.tag-option-menu {
  @apply ml-auto flex items-center justify-center w-6 h-6 rounded-md cursor-pointer opacity-0;
  color: var(--p-text-muted-color);
}

/* « … » visible au survol de la ligne ou quand elle est en surbrillance */
.tag-option:hover .tag-option-menu,
.tag-option[data-highlighted='true'] .tag-option-menu {
  @apply opacity-100;
}

.tag-option-menu:hover {
  background-color: var(--p-surface-200);
}

.app-dark .tag-option-menu:hover {
  background-color: var(--p-surface-700);
}

.tag-edit-error {
  color: var(--p-red-500);
}

.tag-edit-footer {
  @apply mt-auto flex flex-col pt-2 border-t;
  border-color: var(--p-content-border-color);
}

.tag-delete-box {
  @apply flex flex-col gap-2 p-2 rounded-md border;
  border-color: var(--p-content-border-color);
}

.tag-color-option {
  @apply flex items-center gap-2 w-full px-2 py-1 rounded-md cursor-pointer;
  color: var(--p-text-color);
}

.tag-color-option:hover {
  background-color: var(--p-list-option-focus-background, var(--p-surface-100));
}

.tag-color-swatch {
  @apply w-3.5 h-3.5 rounded-full shrink-0;
  background-color: var(--swatch);
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
