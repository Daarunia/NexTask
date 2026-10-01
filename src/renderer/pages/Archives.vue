<template>
  <div data-testid="archives-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-6">
      <div class="flex items-center gap-2">
        <Button
          data-testid="btn-archives-back"
          icon="pi pi-arrow-left"
          aria-label="Retour aux paramètres"
          title="Retour aux paramètres"
          text
          rounded
          @click="goSettings"
        />
        <h1 class="text-2xl">Tâches archivées</h1>
        <span v-if="status === 'ready'" data-testid="archives-count" class="archives-count">{{ tasks.length }}</span>
      </div>

      <template v-if="status === 'ready'">
        <p v-if="!tasks.length" data-testid="archives-empty" class="archives-muted">Aucune tâche archivée.</p>

        <!-- De la plus récemment archivée à la plus ancienne (ordre du serveur) -->
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="task in tasks"
            :key="task.id"
            data-testid="archived-task"
            :data-task-id="task.id"
            class="archived-task"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <strong data-testid="archived-task-title" class="truncate">{{ task.title }}</strong>
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
                label="Restaurer"
                :aria-label="`Restaurer ${task.title}`"
                severity="secondary"
                size="small"
                text
                :loading="busyIds.has(task.id)"
                @click="restore(task)"
              />
              <Button
                data-testid="btn-delete-task"
                icon="pi pi-trash"
                :aria-label="`Supprimer définitivement ${task.title}`"
                title="Supprimer définitivement"
                severity="danger"
                size="small"
                text
                rounded
                :disabled="busyIds.has(task.id)"
                @click="askDelete($event, task)"
              />
            </div>
          </li>
        </ul>
      </template>

      <div v-else-if="status === 'error'" data-testid="archives-load-error" class="flex flex-col items-start gap-4">
        <p>Les tâches archivées n'ont pas pu être chargées.</p>
        <Button label="Réessayer" icon="pi pi-refresh" data-testid="btn-archives-retry" @click="load" />
      </div>

      <div v-else class="flex justify-center">
        <ProgressSpinner />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import TagChip from '../components/TagChip.vue'
import { useTaskStore } from '../stores/Task'
import { useTagStore } from '../stores/Tag'
import type { Task } from '../types/task.types'
import type { Tag } from '../types/tag.types'
import { compareTagNames } from '../utils/tag.helper'
import { getLogger } from '../utils/logger'
import { httpStatus } from '../utils/api.helper'
import { useErrorToast } from '../utils/toast.helper'

const logger = getLogger()
const router = useRouter()
const confirm = useConfirm()
const showError = useErrorToast()
const taskStore = useTaskStore()
const tagStore = useTagStore()

const tasks = ref<Task[]>([])
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
    showError('Chargement impossible', "Les tâches archivées n'ont pas pu être chargées.")
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
  if (!task.historizationDate) return "Date d'archivage inconnue"

  const date = new Date(task.historizationDate).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  return `Archivée le ${date}`
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
 * Retire une tâche de la liste affichée
 * @param id Id de la tâche
 */
function removeFromList(id: number) {
  tasks.value = tasks.value.filter((task) => task.id !== id)
}

/**
 * Restaure une tâche en bas de la première colonne du tableau
 * @param task Tâche archivée
 */
async function restore(task: Task) {
  if (busyIds.has(task.id)) return
  busyIds.add(task.id)

  try {
    await taskStore.restoreTask(task.id)
    removeFromList(task.id)
  } catch (error) {
    if (httpStatus(error) === 409) {
      showError('Restauration impossible', 'Ajoute une colonne au tableau pour y restaurer la tâche.')
    } else {
      showError('Restauration impossible', "La tâche n'a pas été restaurée.")
    }
  } finally {
    busyIds.delete(task.id)
  }
}

/**
 * Demande confirmation avant la suppression définitive, dans une bulle
 * ancrée sur le bouton
 * @param event Clic sur le bouton
 * @param task Tâche archivée
 */
function askDelete(event: MouseEvent, task: Task) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: 'Supprimer définitivement cette tâche ?',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Supprimer', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: () => deletePermanently(task),
  })
}

/**
 * Supprime définitivement une tâche archivée. Ses tags perdent une tâche.
 * @param task Tâche archivée
 */
async function deletePermanently(task: Task) {
  if (busyIds.has(task.id)) return
  busyIds.add(task.id)

  try {
    await taskStore.deleteTask(task.id)
    removeFromList(task.id)
    tagStore.adjustTaskCounts(
      [],
      (task.tags ?? []).map((tag) => tag.id),
    )
  } catch {
    showError('Suppression impossible', "La tâche n'a pas été supprimée.")
  } finally {
    busyIds.delete(task.id)
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
