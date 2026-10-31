<template>
  <div data-testid="settings-recurrence-list" class="flex flex-col gap-3">
    <template v-if="status === 'ready'">
      <p v-if="!rows.length" data-testid="settings-recurrences-empty" class="settings-muted text-sm">
        {{ t('settings.recurrences.empty') }}
      </p>

      <!-- Séries en cours puis terminées, état lu dans le store Task -->
      <table v-else class="recurrence-table">
        <thead>
          <tr>
            <th scope="col">{{ t('settings.recurrences.task') }}</th>
            <th scope="col">{{ t('settings.recurrences.rule') }}</th>
            <th scope="col">{{ t('settings.recurrences.next') }}</th>
            <!-- relative : le libellé masqué (sr-only, en absolu) reste dans le défilement de la page,
              sinon il agrandit toute la fenêtre et fait apparaître une seconde barre de défilement -->
            <th scope="col" class="relative">
              <span class="sr-only">{{ t('settings.recurrences.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            data-testid="settings-recurrence"
            :data-recurrence-id="row.id"
            :data-title="row.title"
            :data-status="row.summary.status"
            :class="{ inactive: row.summary.status !== 'active' }"
          >
            <td>
              <span data-testid="settings-recurrence-title" class="font-medium">{{ row.title }}</span>
              <!-- Tableau des occurrences, avec plusieurs tableaux ou pour un tableau supprimé -->
              <span
                v-if="showBoards && boardLabel(row)"
                data-testid="settings-recurrence-board"
                :data-board-id="row.boardId ?? undefined"
                class="recurrence-board"
              >
                <BoardDot :color="boardOf(row)?.color ?? null" />
                <i v-if="row.boardId === null">{{ boardLabel(row) }}</i>
                <span v-else class="truncate">{{ boardLabel(row) }}</span>
              </span>
            </td>
            <td data-testid="settings-recurrence-rule" class="settings-muted">{{ describeRecurrence(row.summary) }}</td>
            <td data-testid="settings-recurrence-next" class="whitespace-nowrap">{{ nextLabel(row.summary) }}</td>
            <td>
              <div class="flex justify-end">
                <Button
                  v-if="row.summary.status === 'active'"
                  data-testid="btn-recurrence-pause"
                  icon="pi pi-pause"
                  :aria-label="t('settings.recurrences.pauseItem', { title: row.title })"
                  :title="t('settings.recurrences.pause')"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  @click="changeStatus(row, 'paused')"
                />
                <Button
                  v-if="row.summary.status === 'paused'"
                  data-testid="btn-recurrence-resume"
                  icon="pi pi-play"
                  :aria-label="t('settings.recurrences.resumeItem', { title: row.title })"
                  :title="t('settings.recurrences.resume')"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  @click="changeStatus(row, 'active')"
                />
                <Button
                  v-if="row.summary.status !== 'ended'"
                  data-testid="btn-recurrence-stop"
                  icon="pi pi-stop-circle"
                  :aria-label="t('settings.recurrences.stopItem', { title: row.title })"
                  :title="t('settings.recurrences.stop')"
                  size="small"
                  severity="danger"
                  text
                  rounded
                  @click="stop(row)"
                />
                <Button
                  v-if="canReactivate(row.summary)"
                  data-testid="btn-recurrence-reactivate"
                  icon="pi pi-replay"
                  :aria-label="t('settings.recurrences.reactivateItem', { title: row.title })"
                  :title="t('settings.recurrences.reactivate')"
                  size="small"
                  severity="secondary"
                  text
                  rounded
                  @click="changeStatus(row, 'active')"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-else-if="status === 'error'" data-testid="settings-recurrences-error" class="flex items-center gap-3">
      <p class="text-sm">{{ t('settings.recurrences.loadFailed') }}</p>
      <Button :label="t('common.retry')" icon="pi pi-refresh" size="small" severity="secondary" @click="load" />
    </div>

    <ProgressSpinner v-else class="h-8! w-8!" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import BoardDot from '../BoardDot.vue'
import { useTaskStore } from '../../stores/Task'
import { useBoardStore } from '../../stores/Board'
import type { Board } from '../../types/board.types'
import type { RecurrenceListItem, RecurrenceStatus, RecurrenceSummary } from '../../../main/shared/recurrence.constants'
import { hasNextDate, toRecurrenceRule } from '../../../main/shared/recurrence.helper'
import {
  describeRecurrence,
  formatNextRun,
  isWaitingForArchive,
  waitingForArchiveLabel,
} from '../../utils/recurrence.helper'
import { useI18n } from 'vue-i18n'
import { getLogger } from '../../utils/logger'
import { useErrorToast, useUndoToast } from '../../utils/toast.helper'

/**
 * Liste des tâches récurrentes dans les Paramètres : règle, prochaine date,
 * mise en pause, reprise, arrêt (annulable) et réactivation. Avec plusieurs
 * tableaux, chaque série affiche celui de ses occurrences, « Tableau
 * supprimé » pour une série dont le tableau a été supprimé.
 *
 * L'état des séries est celui du store Task, que lisent aussi les cartes du
 * tableau et des archives : une série mise en pause ou arrêtée ici grise
 * aussitôt l'icône de ses occurrences. Seuls l'ordre et le titre du modèle
 * viennent du chargement de la liste.
 */

/** Ligne de la liste : titre du modèle, dernier état connu de la série et son tableau. */
interface RecurrenceRow {
  id: number
  title: string
  summary: RecurrenceSummary
  boardId: number | null | undefined // absent d'un cache antérieur aux tableaux
}

const logger = getLogger()
const taskStore = useTaskStore()
const boardStore = useBoardStore()
const showError = useErrorToast()
const showUndo = useUndoToast()
const { t } = useI18n()

const status = ref<'loading' | 'error' | 'ready'>('loading')
const items = ref<RecurrenceListItem[]>([])

// Dernier état connu de chaque série (store), à défaut celui du chargement
const rows = computed<RecurrenceRow[]>(() =>
  items.value.map((item) => {
    const summary = taskStore.getRecurrence(item.id) ?? item
    return {
      id: item.id,
      title: item.title,
      summary,
      // Tableau suivi par le store (tâche envoyée ailleurs), sinon celui du chargement
      boardId: summary.boardId === undefined ? item.boardId : summary.boardId,
    }
  }),
)

// Tableau de chaque série affiché avec plusieurs tableaux, ou pour signaler un tableau supprimé
const showBoards = computed(() => boardStore.getAllBoards.length > 1 || rows.value.some((row) => row.boardId === null))

/**
 * Tableau d'une série, s'il existe encore.
 * @param row Série
 */
function boardOf(row: RecurrenceRow): Board | undefined {
  return boardStore.getAllBoards.find((board) => board.id === row.boardId)
}

/**
 * Nom du tableau d'une série, « Tableau supprimé » s'il n'existe plus, vide
 * pour un tableau inconnu du cache ou une série d'un cache antérieur.
 * @param row Série
 */
function boardLabel(row: RecurrenceRow): string {
  if (row.boardId === null) return t('boards.deletedBoard')
  return boardOf(row)?.name ?? ''
}

/**
 * Relit les séries, une occurrence ayant pu être créée depuis le dernier
 * passage, et charge les tableaux de leurs lignes (cache du store).
 */
async function load() {
  status.value = 'loading'

  try {
    const [recurrences] = await Promise.all([taskStore.loadRecurrences(), boardStore.loadAllBoards()])
    items.value = recurrences
    status.value = 'ready'
  } catch (error) {
    logger.error('Erreur lors du chargement des tâches récurrentes des Paramètres :', error)
    status.value = 'error'
  }
}

onMounted(load)

/**
 * Colonne « Prochaine » : date de la prochaine occurrence, attente de
 * l'archivage de l'occurrence au tableau (après archivage), ou état de la série
 * @param summary Série
 */
function nextLabel(summary: RecurrenceSummary): string {
  if (summary.status === 'paused') return t('settings.recurrences.paused')
  if (isWaitingForArchive(summary)) return waitingForArchiveLabel()
  if (summary.status === 'ended' || !summary.nextRunAt) return t('settings.recurrences.ended')
  return formatNextRun(new Date(summary.nextRunAt))
}

/**
 * Vrai pour une série arrêtée dont la règle donne encore des dates (arrêtée
 * par l'utilisateur). Une série arrivée à sa date de fin ou à son nombre
 * d'occurrences n'aurait rien à créer.
 * @param summary Série
 */
function canReactivate(summary: RecurrenceSummary): boolean {
  return summary.status === 'ended' && hasNextDate(toRecurrenceRule(summary), new Date())
}

/**
 * Change l'état d'une série : pause, reprise ou réactivation (sans rattrapage)
 * @param row Série
 * @param next Nouvel état
 */
async function changeStatus(row: RecurrenceRow, next: RecurrenceStatus) {
  try {
    await taskStore.updateRecurrenceStatus(row.id, next)
  } catch {
    showError(
      t('settings.recurrences.changeFailed'),
      t('settings.recurrences.changeFailedDetail', { title: row.title }),
    )
  }
}

/**
 * Arrête une série, annulable quelques secondes : elle retrouve alors son
 * état d'avant (active, elle repart sans rattrapage, cf. setSeriesStatus)
 * @param row Série
 */
async function stop(row: RecurrenceRow) {
  const previous = row.summary.status

  try {
    await taskStore.updateRecurrenceStatus(row.id, 'ended')
  } catch {
    showError(t('settings.recurrences.stopFailed'), t('settings.recurrences.stopFailedDetail', { title: row.title }))
    return
  }

  showUndo(t('recurrence.state.ended'), {
    detail: row.title,
    undo: async () => {
      try {
        await taskStore.updateRecurrenceStatus(row.id, previous)
      } catch {
        showError(t('task.dialog.undoFailed'), t('task.dialog.resumeFailedDetail'))
      }
    },
  })
}
</script>

<style scoped>
@reference "tailwindcss";

.recurrence-table {
  @apply w-full text-sm;
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}

.recurrence-table th {
  @apply px-3 pb-1 text-left text-xs font-medium;
  color: var(--p-text-muted-color);
}

.recurrence-table td {
  @apply px-3 py-2 align-middle;
  background-color: var(--p-surface-300);
}

.app-dark .recurrence-table td {
  background-color: var(--p-surface-800);
}

.recurrence-table td:first-child {
  @apply rounded-l-md;
  overflow-wrap: anywhere;
}

/* Pastille et nom du tableau, sous le titre de la série */
.recurrence-board {
  @apply mt-0.5 flex min-w-0 items-center gap-1.5 text-xs;
  color: var(--p-text-muted-color);
}

.recurrence-table td:last-child {
  @apply rounded-r-md px-1;
}

/* Série en pause ou terminée : estompée, comme l'icône de ses cartes */
.recurrence-table tr.inactive td {
  color: var(--p-text-muted-color);
}

.settings-muted {
  color: var(--p-text-muted-color);
}
</style>
