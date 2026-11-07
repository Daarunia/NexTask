<template>
  <section class="task-documents" data-testid="task-documents" :aria-label="t('documents.title')">
    <!-- En-tête : libellé, nombre sur le maximum, ajout -->
    <div class="docs-head">
      <span class="field-label"><i class="pi pi-paperclip" aria-hidden="true"></i>{{ t('documents.title') }}</span>
      <span v-if="editable && documents.length" data-testid="task-documents-count" class="docs-count">
        {{ documents.length }}/{{ settings.documentMaxPerTask }}
      </span>
      <span class="flex-1"></span>
      <template v-if="editable">
        <Button
          type="button"
          icon="pi pi-plus"
          :label="t('documents.add')"
          data-testid="btn-document-add"
          size="small"
          text
          :disabled="full"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          data-testid="document-file-input"
          tabindex="-1"
          aria-hidden="true"
          @change="onFilesPicked"
        />
      </template>
    </div>

    <ul v-if="documents.length || uploads.length" class="docs-list">
      <li
        v-for="doc in documents"
        :key="doc.id"
        data-testid="task-document"
        :data-document-id="doc.id"
        :data-name="doc.name"
        class="doc-item"
      >
        <i :class="['pi', documentIcon(doc.name), 'doc-icon']" aria-hidden="true"></i>
        <!-- Un exécutable ne s'ouvre jamais depuis l'app, seulement enregistré -->
        <span
          v-if="isExecutableDocument(doc.name)"
          data-testid="task-document-name"
          class="doc-name blocked"
          :title="t('documents.blockedHint')"
        >
          {{ doc.name }}
        </span>
        <button
          v-else
          type="button"
          data-testid="task-document-name"
          class="doc-name"
          :title="t('documents.openItem', { name: doc.name })"
          @click="open(doc)"
        >
          {{ doc.name }}
        </button>
        <span data-testid="task-document-size" class="doc-size">{{ formatBytes(doc.size) }}</span>
        <Button
          type="button"
          icon="pi pi-download"
          data-testid="btn-document-save"
          :aria-label="t('documents.saveItem', { name: doc.name })"
          :title="t('documents.saveAs')"
          severity="secondary"
          size="small"
          text
          rounded
          @click="saveAs(doc)"
        />
        <Button
          v-if="editable"
          type="button"
          icon="pi pi-trash"
          data-testid="btn-document-delete"
          :aria-label="t('documents.deleteItem', { name: doc.name })"
          :title="t('common.delete')"
          severity="secondary"
          size="small"
          text
          rounded
          :disabled="deletingIds.has(doc.id)"
          @click="confirmDelete($event, doc)"
        />
      </li>

      <!-- Envois en cours, dans l'ordre où ils partiront -->
      <li
        v-for="upload in uploads"
        :key="upload.key"
        data-testid="task-document-upload"
        :data-name="upload.name"
        class="doc-item uploading"
      >
        <i class="pi pi-spin pi-spinner doc-icon" aria-hidden="true"></i>
        <span class="doc-name">{{ upload.name }}</span>
        <progress
          class="doc-progress"
          max="100"
          :value="upload.progress"
          :aria-label="t('documents.uploading', { name: upload.name })"
        ></progress>
      </li>
    </ul>

    <!-- Rien de joint : comment en ajouter, ou pourquoi ce n'est pas encore possible -->
    <p v-else-if="!readonly" data-testid="task-documents-hint" class="docs-hint">
      {{ task ? t('documents.dropHint') : t('documents.saveFirst') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Button from 'primevue/button'
import { useI18n } from 'vue-i18n'
import { BYTES_PER_MB, type DocumentErrorCode } from '@core/shared/document.constants'
import { documentLimitProblem, isExecutableDocument } from '@core/shared/document.helper'
import type { Task } from '../types/task.types'
import type { TaskDocument } from '../types/document.types'
import { useTaskStore } from '../stores/Task'
import { useSettingsStore } from '../stores/Settings'
import { apiErrorCode } from '../utils/api.helper'
import { documentIcon, formatBytes } from '../utils/document.helper'
import { useErrorToast, useInfoToast, useSuccessToast } from '../utils/toast.helper'
import { useDangerConfirm } from '../utils/confirm.helper'
import { getLogger } from '../utils/logger'

/**
 * Documents joints à une tâche : liste, ouverture dans l'application par
 * défaut, enregistrement, et pour une tâche du tableau ajout et suppression.
 * Ajouts et suppressions sont envoyés aussitôt, sans attendre l'enregistrement
 * du dialogue, comme la coche d'un point depuis la carte.
 *
 * Le dépôt de fichiers est écouté par le parent, sur tout le dialogue, qui les
 * passe à `addFiles`. Les envois partent un par un, dans l'ordre.
 */
const props = withDefaults(
  defineProps<{
    // Tâche, à jour dans le store ; null à la création, tant qu'elle n'est pas enregistrée
    task: Task | null
    // Consultation seule (tâche archivée) : ni ajout ni suppression
    readonly?: boolean
  }>(),
  { readonly: false },
)

const { t } = useI18n()
const taskStore = useTaskStore()
const settings = useSettingsStore()
const showError = useErrorToast()
const showInfo = useInfoToast()
const showSuccess = useSuccessToast()
const confirmDanger = useDangerConfirm()
const logger = getLogger()

// Motifs de refus traduits, les autres tombant sur un message générique
const TRANSLATED_ERRORS: ReadonlySet<string> = new Set<DocumentErrorCode>([
  'fileTooLarge',
  'taskFull',
  'archived',
  'invalidName',
  'taskNotFound',
  'diskFull',
  'storeUnavailable',
  'interrupted',
])

/** Envoi en cours, avec son avancement en pourcentage. */
interface PendingUpload {
  key: number
  name: string
  progress: number
}

const fileInput = ref<HTMLInputElement | null>(null)
const uploads = ref<PendingUpload[]>([])
const deletingIds = reactive(new Set<number>())
let nextUploadKey = 0

// Envois chaînés, un seul à la fois : le nombre de documents est contrôlé dans l'ordre
let queue: Promise<void> = Promise.resolve()

const documents = computed<TaskDocument[]>(() => props.task?.documents ?? [])
const editable = computed(() => !!props.task && !props.readonly)
const full = computed(() => documents.value.length + uploads.value.length >= settings.documentMaxPerTask)

/**
 * Motif d'un refus dans la langue de l'interface.
 * @param code Motif renvoyé par le serveur ou constaté avant l'envoi
 */
function errorReason(code: string | undefined): string {
  if (code === 'fileTooLarge') {
    return t('documents.errors.fileTooLarge', { max: formatBytes(settings.documentMaxSizeMb * BYTES_PER_MB) })
  }
  if (code === 'taskFull') return t('documents.errors.taskFull', { max: settings.documentMaxPerTask })
  return code && TRANSLATED_ERRORS.has(code) ? t(`documents.errors.${code}`) : t('documents.errors.unknown')
}

/**
 * Envoie un fichier, après le contrôle des limites qui évite d'envoyer pour rien
 * un fichier que le serveur refuserait.
 * @param taskId Id de la tâche
 * @param file Fichier à joindre
 * @param upload Ligne d'avancement affichée
 */
async function sendFile(taskId: number, file: File, upload: PendingUpload) {
  try {
    const limits = { maxSizeMb: settings.documentMaxSizeMb, maxPerTask: settings.documentMaxPerTask }
    const problem = documentLimitProblem(file.size, documents.value.length, limits)
    if (problem) {
      showError(t('documents.addFailed', { name: file.name }), errorReason(problem))
      return
    }

    await taskStore.uploadDocument(taskId, file, (ratio) => {
      upload.progress = Math.round(ratio * 100)
    })
  } catch (error) {
    showError(t('documents.addFailed', { name: file.name }), errorReason(apiErrorCode(error)))
  } finally {
    uploads.value = uploads.value.filter((pending) => pending.key !== upload.key)
  }
}

/**
 * Joint des fichiers à la tâche, envoyés un par un à la suite des envois en cours.
 * @param files Fichiers choisis ou déposés
 */
function addFiles(files: File[]) {
  if (!props.task || props.readonly) return
  const taskId = props.task.id

  for (const file of files) {
    const pending = reactive<PendingUpload>({ key: nextUploadKey++, name: file.name, progress: 0 })
    uploads.value.push(pending)
    queue = queue.then(() => sendFile(taskId, file, pending))
  }
}

/**
 * Fichiers choisis dans la boîte de dialogue du système.
 * @param event Changement du champ de fichiers
 */
function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles([...(input.files ?? [])])
  // Champ vidé : choisir de nouveau le même fichier déclenche un nouvel ajout
  input.value = ''
}

/**
 * Ouvre un document dans l'application par défaut du système.
 * @param doc Document à ouvrir
 */
async function open(doc: TaskDocument) {
  try {
    const result = await globalThis.documents.open(doc.id)
    if (result.status === 'blocked') showInfo(t('documents.blocked'), t('documents.blockedHint'))
    if (result.status === 'missing') showError(t('documents.openFailed', { name: doc.name }), t('documents.missing'))
  } catch (error) {
    logger.error(`Ouverture du document ${doc.id} impossible`, error)
    showError(t('documents.openFailed', { name: doc.name }), t('documents.openFailedDetail'))
  }
}

/**
 * Enregistre une copie d'un document à l'emplacement choisi.
 * @param doc Document à enregistrer
 */
async function saveAs(doc: TaskDocument) {
  try {
    const result = await globalThis.documents.saveAs(doc.id, doc.name)
    if (result.status === 'saved') showSuccess(t('documents.saved'), result.filePath)
    if (result.status === 'missing') showError(t('documents.saveFailed', { name: doc.name }), t('documents.missing'))
  } catch (error) {
    logger.error(`Enregistrement du document ${doc.id} impossible`, error)
    showError(t('documents.saveFailed', { name: doc.name }), t('documents.saveFailedDetail'))
  }
}

/**
 * Supprime un document après confirmation, dans une bulle sur le bouton cliqué.
 * @param event Clic sur la corbeille
 * @param doc Document à supprimer
 */
function confirmDelete(event: MouseEvent, doc: TaskDocument) {
  confirmDanger({
    target: event.currentTarget as HTMLElement,
    message: t('documents.deleteConfirm', { name: doc.name }),
    acceptLabel: t('common.delete'),
    accept: () => remove(doc),
  })
}

/**
 * Supprime un document de la tâche.
 * @param doc Document à supprimer
 */
async function remove(doc: TaskDocument) {
  if (!props.task) return
  deletingIds.add(doc.id)
  try {
    await taskStore.deleteDocument(props.task.id, doc.id)
  } catch {
    showError(t('documents.deleteFailed', { name: doc.name }), t('documents.deleteFailedDetail'))
  } finally {
    deletingIds.delete(doc.id)
  }
}

defineExpose({ addFiles })
</script>

<style scoped>
@reference "tailwindcss";

.docs-head {
  @apply flex min-h-7 items-center gap-2;
}

.docs-head .field-label {
  @apply flex-none;
}

/* Nombre sur le maximum, chiffres à chasse fixe */
.docs-count {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.docs-list {
  @apply flex flex-col;
}

.doc-item {
  @apply flex min-w-0 items-center gap-2 rounded px-1;
  min-height: 2rem;
}

.doc-item:hover {
  background-color: var(--p-content-hover-background);
}

.doc-icon {
  @apply flex-none;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.doc-name {
  @apply min-w-0 flex-1 truncate text-left;
  font-size: 0.875rem;
}

button.doc-name {
  @apply cursor-pointer;
}

button.doc-name:hover,
button.doc-name:focus-visible {
  color: var(--p-primary-color);
  text-decoration: underline;
}

/* Exécutable : ni lien ni ouverture */
.doc-name.blocked {
  color: var(--p-text-muted-color);
}

.doc-size {
  @apply flex-none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

/* Barre fine aux couleurs du thème, sans l'apparence native (Chromium) */
.doc-progress {
  @apply flex-none overflow-hidden rounded-full border-0;
  appearance: none;
  width: 6rem;
  height: 4px;
  background-color: var(--p-content-border-color);
}

.doc-progress::-webkit-progress-bar {
  background-color: var(--p-content-border-color);
}

.doc-progress::-webkit-progress-value {
  background-color: var(--p-primary-color);
  transition: width 0.15s;
}

.docs-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
