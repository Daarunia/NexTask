<template>
  <div data-testid="archives-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-6">
      <div class="flex items-center gap-2">
        <Button
          data-testid="btn-archives-back"
          icon="pi pi-arrow-left"
          :aria-label="t('archives.back')"
          :title="t('archives.back')"
          text
          rounded
          @click="goSettings"
        />
        <h1 class="text-2xl">{{ t('archives.title') }}</h1>
        <span v-if="status === 'ready'" data-testid="archives-count" class="archives-count">{{
          visibleTasks.length
        }}</span>
      </div>

      <template v-if="status === 'ready'">
        <p v-if="!visibleTasks.length" data-testid="archives-empty" class="archives-muted">
          {{ t('archives.empty') }}
        </p>

        <!-- De la plus récemment archivée à la plus ancienne (ordre du serveur) -->
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="task in visibleTasks"
            :key="task.id"
            data-testid="archived-task"
            :data-task-id="task.id"
            class="archived-task"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex min-w-0 items-center gap-2">
                <strong data-testid="archived-task-title" class="truncate">{{ task.title }}</strong>

                <!-- Occurrence d'une tâche récurrente, comme sur les cartes du tableau -->
                <i
                  v-if="recurrenceOf(task)"
                  data-testid="archived-task-recurrence"
                  :data-status="recurrenceOf(task)!.status"
                  v-tooltip.top="infoTooltip(recurrenceTooltip(recurrenceOf(task)!))"
                  :class="['pi pi-sync recurrence-icon', { inactive: recurrenceOf(task)!.status !== 'active' }]"
                  :aria-label="recurrenceTooltip(recurrenceOf(task)!)"
                ></i>
              </div>
              <time data-testid="archived-task-date" :datetime="isoDate(task)" class="archives-muted text-sm">
                {{ archivedLabel(task) }}
              </time>

              <!-- Nom et couleur lus dans le store Tag, comme sur les cartes -->
              <div v-if="visibleTags(task).length" class="flex flex-wrap gap-1">
                <TagChip
                  v-for="tag in visibleTags(task)"
                  :key="tag.id"
                  data-testid="archived-task-tag"
                  :tagId="tag.id"
                  :name="tag.name"
                  size="small"
                />
              </div>
            </div>

            <div class="flex shrink-0 gap-1">
              <Button
                data-testid="btn-restore-task"
                icon="pi pi-replay"
                :label="t('archives.restore')"
                :aria-label="t('archives.restoreItem', { title: task.title })"
                severity="secondary"
                size="small"
                text
                :loading="busyIds.has(task.id)"
                @click="restore(task)"
              />
              <Button
                data-testid="btn-delete-task"
                icon="pi pi-trash"
                :aria-label="t('archives.deleteForeverItem', { title: task.title })"
                :title="t('archives.deleteForever')"
                severity="danger"
                size="small"
                text
                rounded
                :disabled="busyIds.has(task.id)"
                @click="deleteWithUndo(task)"
              />
            </div>
          </li>
        </ul>
      </template>

      <div v-else-if="status === 'error'" data-testid="archives-load-error" class="flex flex-col items-start gap-4">
        <p>{{ t('archives.loadFailedDetail') }}</p>
        <Button :label="t('common.retry')" icon="pi pi-refresh" data-testid="btn-archives-retry" @click="load" />
      </div>

      <div v-else class="flex justify-center">
        <ProgressSpinner />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { Task } from '../types/task.types'

// Tâches archivées chargées, et ids de celles dont la suppression définitive
// attend la fermeture de son toast « Annuler » (masquées en attendant). Hors du
// setup : la suppression peut aboutir ou être annulée après avoir quitté la page,
// et la liste rechargée en revenant doit en tenir compte.
const tasks = ref<Task[]>([])
const pendingDeletions = reactive(new Set<number>())
</script>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import TagChip from '../components/TagChip.vue'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import type { Tag } from '../types/tag.types'
import { compareTagNames } from '../utils/tag.helper'
import { recurrenceTooltip } from '../utils/recurrence.helper'
import { infoTooltip } from '../utils/tooltip.helper'
import type { RecurrenceSummary } from '../../main/shared/recurrence.constants'
import { getLogger } from '../utils/logger'
import { httpStatus } from '../utils/api.helper'
import { useErrorToast, useUndoToast } from '../utils/toast.helper'
import { intlLocale } from '../i18n'
import { useI18n } from 'vue-i18n'

const logger = getLogger()
const router = useRouter()
const showError = useErrorToast()
const showUndo = useUndoToast()
const { t } = useI18n()
const taskStore = useTaskStore()
const tagStore = useTagStore()

// Tâches affichées : sans celles dont la suppression est en attente
const visibleTasks = computed(() => tasks.value.filter((task) => !pendingDeletions.has(task.id)))

const status = ref<'loading' | 'error' | 'ready'>('loading')

// Tâches dont la restauration ou la suppression est en cours
const busyIds = reactive(new Set<number>())

/**
 * Charge les tâches archivées, et relit les tags (nom, couleur) de leurs chips
 */
async function load() {
  status.value = 'loading'

  try {
    const [archived] = await Promise.all([taskStore.loadArchivedTasks(), tagStore.loadAllTags(true)])
    tasks.value = archived
    status.value = 'ready'
  } catch (error) {
    logger.error('Erreur lors du chargement des archives :', error)
    showError(t('board.loadFailed'), t('archives.loadFailedDetail'))
    status.value = 'error'
  }
}

onMounted(load)

function goSettings() {
  router.push({ name: 'Settings' })
}

/**
 * Date d'archivage au format ISO (attribut `datetime`), vide si inconnue
 * @param task Tâche archivée
 */
function isoDate(task: Task): string | undefined {
  return task.historizationDate ? new Date(task.historizationDate).toISOString() : undefined
}

/**
 * Libellé de la date d'archivage
 * @param task Tâche archivée
 */
function archivedLabel(task: Task): string {
  if (!task.historizationDate) return t('archives.unknownDate')

  const date = new Date(task.historizationDate).toLocaleString(intlLocale(), { dateStyle: 'long', timeStyle: 'short' })
  return t('archives.archivedOn', { date })
}

/**
 * Tags affichés d'une tâche : sans les tags supprimés, triés par nom
 * @param task Tâche archivée
 */
function visibleTags(task: Task): Pick<Tag, 'id' | 'name'>[] {
  return (task.tags ?? [])
    .filter((tag) => !tagStore.wasDeleted(tag.id))
    .map((tag) => tagStore.getTagById(tag.id) ?? tag)
    .sort(compareTagNames)
}

/**
 * Série d'une tâche archivée, dans son dernier état connu
 * @param task Tâche archivée
 */
function recurrenceOf(task: Task): RecurrenceSummary | undefined {
  return taskStore.getRecurrence(task.recurrenceId) ?? task.recurrence ?? undefined
}

/**
 * Retire une tâche de la liste affichée
 * @param id Id de la tâche
 */
function removeFromList(id: number) {
  tasks.value = tasks.value.filter((task) => task.id !== id)
}

/**
 * Restaure une tâche en bas de la première colonne du tableau. L'occurrence
 * née de son archivage (série « après archivage »), si le serveur la retire,
 * quitte le cache du tableau (cf. restoreTask)
 * @param task Tâche archivée
 */
async function restore(task: Task) {
  if (busyIds.has(task.id)) return
  busyIds.add(task.id)

  try {
    const { removed } = await taskStore.restoreTask(task.id)
    removeFromList(task.id)
    // Occurrence née de son archivage, retirée avec la restauration : ses tags perdent une tâche
    if (removed) {
      tagStore.adjustTaskCounts(
        [],
        (removed.tags ?? []).map((tag) => tag.id),
      )
    }
  } catch (error) {
    if (httpStatus(error) === 409) {
      showError(t('archives.restoreFailed'), t('archives.restoreNoStage'))
    } else {
      showError(t('archives.restoreFailed'), t('archives.restoreFailedDetail'))
    }
  } finally {
    busyIds.delete(task.id)
  }
}

/**
 * Suppression définitive annulable : la tâche disparaît de la liste tout de
 * suite, mais n'est supprimée qu'une fois son toast « Annuler » refermé. Si
 * l'app est quittée entre-temps, elle reste simplement archivée.
 * @param task Tâche archivée
 */
function deleteWithUndo(task: Task) {
  if (busyIds.has(task.id) || pendingDeletions.has(task.id)) return
  pendingDeletions.add(task.id)

  showUndo(t('archives.deleted'), {
    detail: task.title,
    undo: () => pendingDeletions.delete(task.id),
    commit: () => deletePermanently(task),
  })
}

/**
 * Supprime définitivement une tâche archivée. Ses tags perdent une tâche.
 * En cas d'échec, elle réapparaît dans la liste.
 * @param task Tâche archivée
 */
async function deletePermanently(task: Task) {
  try {
    await taskStore.deleteTask(task.id)
    removeFromList(task.id)
    tagStore.adjustTaskCounts(
      [],
      (task.tags ?? []).map((tag) => tag.id),
    )
  } catch {
    showError(t('archives.deleteFailed'), t('archives.deleteFailedDetail'))
  } finally {
    pendingDeletions.delete(task.id)
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.archived-task {
  @apply flex items-center gap-3 rounded-lg p-3;
  background-color: var(--p-surface-200);
}

.app-dark .archived-task {
  background-color: var(--p-surface-900);
}

.archives-muted {
  color: var(--p-text-muted-color);
}

.recurrence-icon {
  @apply shrink-0 text-xs;
  color: var(--p-primary-color);
}

/* Série arrêtée ou en pause : icône grisée */
.recurrence-icon.inactive {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

.archives-count {
  @apply rounded-full px-2 text-xs;
  background-color: var(--p-primary-100);
  color: var(--p-primary-700);
}

.app-dark .archives-count {
  background-color: color-mix(in srgb, var(--p-primary-400) 18%, transparent);
  color: var(--p-primary-400);
}
</style>
