<template>
  <div data-testid="settings-tag-list" class="flex flex-col gap-3">
    <template v-if="status === 'ready'">
      <p v-if="!tagStore.getAllTags.length" data-testid="settings-tags-empty" class="settings-muted text-sm">
        Aucun tag. Les tags se créent depuis le formulaire d'une tâche.
      </p>

      <!-- Tags triés par nom, nom et couleur lus dans le store -->
      <ul v-else class="flex flex-col gap-1">
        <li
          v-for="tag in tagStore.getAllTags"
          :key="tag.id"
          data-testid="settings-tag"
          :data-tag-name="tag.name"
          class="tag-item"
        >
          <!-- Renommage en place -->
          <template v-if="editingId === tag.id">
            <form class="flex flex-1 flex-col gap-1" @submit.prevent="saveRename(tag)">
              <div class="flex items-center gap-2">
                <InputText
                  ref="nameInput"
                  v-model="editName"
                  data-testid="settings-tag-name-input"
                  aria-label="Nom du tag"
                  size="small"
                  :maxlength="TAG_NAME_MAX_LENGTH"
                  :invalid="!!editError"
                  class="flex-1"
                  @input="editError = ''"
                  @keydown.esc.prevent="cancelRename"
                />
                <Button
                  type="submit"
                  data-testid="btn-tag-rename-save"
                  icon="pi pi-check"
                  aria-label="Enregistrer le nom"
                  size="small"
                  text
                  rounded
                  :loading="saving"
                />
                <Button
                  data-testid="btn-tag-rename-cancel"
                  icon="pi pi-times"
                  aria-label="Annuler le renommage"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  @click="cancelRename"
                />
              </div>
              <Message v-if="editError" data-testid="settings-tag-error" severity="error" size="small" variant="simple">
                {{ editError }}
              </Message>
            </form>
          </template>

          <template v-else>
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <TagChip :tagId="tag.id" />
              <span data-testid="settings-tag-count" class="settings-muted shrink-0 text-sm">
                {{ tagUsageLabel(tag.taskCount ?? 0) }}
              </span>
            </div>

            <Button
              data-testid="btn-tag-rename"
              icon="pi pi-pencil"
              :aria-label="`Renommer ${tag.name}`"
              title="Renommer"
              size="small"
              severity="secondary"
              text
              rounded
              @click="startRename(tag)"
            />
            <Button
              data-testid="btn-tag-color"
              icon="pi pi-palette"
              :aria-label="`Changer la couleur de ${tag.name}`"
              title="Couleur"
              size="small"
              severity="secondary"
              text
              rounded
              @click="openColors($event, tag)"
            />
            <Button
              data-testid="btn-tag-delete"
              icon="pi pi-trash"
              :aria-label="`Supprimer ${tag.name}`"
              title="Supprimer"
              size="small"
              severity="danger"
              text
              rounded
              @click="askDelete($event, tag)"
            />
          </template>
        </li>
      </ul>
    </template>

    <div v-else-if="status === 'error'" data-testid="settings-tags-error" class="flex items-center gap-3">
      <p class="text-sm">Les tags n'ont pas pu être chargés.</p>
      <Button label="Réessayer" icon="pi pi-refresh" size="small" severity="secondary" @click="load" />
    </div>

    <ProgressSpinner v-else class="h-8! w-8!" />

    <!-- Une seule palette, ancrée sur le bouton du tag choisi -->
    <Popover ref="colorPopover" @hide="colorTagId = null">
      <div data-testid="settings-tag-colors" class="w-56">
        <TagColorOptions :selected="colorTag?.color" @select="applyColor" />
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Popover from 'primevue/popover'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import TagChip from '../TagChip.vue'
import TagColorOptions from '../TagColorOptions.vue'
import { useTagStore } from '../../stores/Tag'
import type { Tag, TagColor } from '../../types/tag.types'
import { TAG_NAME_MAX_LENGTH } from '../../../main/shared/validation.constants'
import { renameRejection, tagDeleteQuestion, tagUsageLabel, validateTagName } from '../../utils/tag.helper'
import { getLogger } from '../../utils/logger'
import { useErrorToast } from '../../utils/toast.helper'

/**
 * Liste des tags dans les Paramètres : renommage, couleur et suppression.
 *
 * Les éditions passent par les actions du store Tag, comme dans le menu « … »
 * du sélecteur (TagSelect) : elles se reflètent aussitôt sur les cartes et
 * les filtres, et partagent les mêmes règles (cf. utils/tag.helper).
 */

const logger = getLogger()
const tagStore = useTagStore()
const confirm = useConfirm()
const showError = useErrorToast()

const status = ref<'loading' | 'error' | 'ready'>('loading')

// Renommage en cours
const editingId = ref<number | null>(null)
const editName = ref('')
const editError = ref('')
const saving = ref(false)
const nameInput = ref()

// Tag dont la palette est ouverte
const colorPopover = ref()
const colorTagId = ref<number | null>(null)
const colorTag = computed(() => (colorTagId.value === null ? undefined : tagStore.getTagById(colorTagId.value)))

/**
 * Relit les tags et leur nombre de tâches (archivées comprises), le cache
 * pouvant dater d'avant une purge ou une suppression d'archive
 */
async function load() {
  status.value = 'loading'

  try {
    await tagStore.loadAllTags(true)
    status.value = 'ready'
  } catch (error) {
    logger.error('Erreur lors du chargement des tags des Paramètres :', error)
    status.value = 'error'
  }
}

onMounted(load)

/**
 * Passe un tag en renommage
 * @param tag Tag à renommer
 */
function startRename(tag: Tag) {
  editingId.value = tag.id
  editName.value = tag.name
  editError.value = ''

  // Un seul champ affiché à la fois : la ref du v-for est un tableau d'un élément
  nextTick(() => {
    const input = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value
    input?.$el?.focus()
  })
}

function cancelRename() {
  editingId.value = null
  editError.value = ''
}

/**
 * Enregistre le nom saisi, après le même contrôle que le sélecteur de tags.
 * Un nom refusé laisse le champ ouvert avec son message.
 * @param tag Tag renommé
 */
async function saveRename(tag: Tag) {
  if (saving.value) return

  const name = editName.value.trim()
  if (name === tag.name) {
    cancelRename()
    return
  }

  const invalid = validateTagName(name, tag.id, tagStore.getAllTags)
  if (invalid) {
    editError.value = invalid
    return
  }

  saving.value = true
  try {
    await tagStore.updateTag(tag.id, { name })
    cancelRename()
  } catch (error) {
    const rejection = renameRejection(error)
    if (rejection) {
      editError.value = rejection
    } else {
      showError('Renommage annulé')
    }
  } finally {
    saving.value = false
  }
}

/**
 * Ouvre la palette d'un tag, ancrée sur son bouton
 * @param event Clic sur le bouton
 * @param tag Tag à recolorer
 */
function openColors(event: MouseEvent, tag: Tag) {
  colorTagId.value = tag.id
  colorPopover.value?.show(event)
}

/**
 * Applique la couleur choisie puis ferme la palette
 * @param color Couleur choisie
 */
async function applyColor(color: TagColor) {
  const tag = colorTag.value
  colorPopover.value?.hide()
  if (!tag || tag.color === color) return

  try {
    await tagStore.updateTag(tag.id, { color })
  } catch {
    // Le store n'a rien modifié : la couleur d'avant reste affichée
    showError('Couleur non modifiée')
  }
}

/**
 * Demande confirmation avant de supprimer un tag, dans une bulle ancrée sur
 * le bouton
 * @param event Clic sur le bouton
 * @param tag Tag à supprimer
 */
function askDelete(event: MouseEvent, tag: Tag) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: tagDeleteQuestion(tag),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Supprimer', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: () => deleteTag(tag),
  })
}

/**
 * Supprime un tag, retiré aussi de toutes les tâches
 * @param tag Tag à supprimer
 */
async function deleteTag(tag: Tag) {
  try {
    await tagStore.deleteTag(tag.id)
  } catch {
    showError('Suppression impossible', "Le tag n'a pas été supprimé.")
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.tag-item {
  @apply flex min-h-11 items-center gap-1 rounded-md py-1 pl-3 pr-1;
  background-color: var(--p-surface-300);
}

.app-dark .tag-item {
  background-color: var(--p-surface-800);
}

.settings-muted {
  color: var(--p-text-muted-color);
}
</style>
