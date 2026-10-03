<template>
  <div data-testid="settings-recurrence-list" class="flex flex-col gap-3">
    <template v-if="status === 'ready'">
      <p v-if="!rows.length" data-testid="settings-recurrences-empty" class="settings-muted text-sm">
        Aucune tâche récurrente. Une série se crée depuis le champ « Répéter » du formulaire d'une tâche.
      </p>

      <!-- Séries en cours puis terminées, état lu dans le store Task -->
      <table v-else class="recurrence-table">
        <thead>
          <tr>
            <th scope="col">Tâche</th>
            <th scope="col">Règle</th>
            <th scope="col">Prochaine</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
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
            <td data-testid="settings-recurrence-title" class="font-medium">{{ row.title }}</td>
            <td data-testid="settings-recurrence-rule" class="settings-muted">{{ describeRecurrence(row.summary) }}</td>
            <td data-testid="settings-recurrence-next" class="whitespace-nowrap">{{ nextLabel(row.summary) }}</td>
            <td>
              <div class="flex justify-end">
                <Button
                  v-if="row.summary.status === 'active'"
                  data-testid="btn-recurrence-pause"
                  icon="pi pi-pause"
                  :aria-label="`Mettre en pause ${row.title}`"
                  title="Mettre en pause"
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
                  :aria-label="`Reprendre ${row.title}`"
                  title="Reprendre"
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
                  :aria-label="`Arrêter ${row.title}`"
                  title="Arrêter"
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
                  :aria-label="`Réactiver ${row.title}`"
                  title="Réactiver"
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
      <p class="text-sm">Les tâches récurrentes n'ont pas pu être chargées.</p>
      <Button label="Réessayer" icon="pi pi-refresh" size="small" severity="secondary" @click="load" />
    </div>

    <ProgressSpinner v-else class="h-8! w-8!" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useTaskStore } from '../../stores/Task'
import type { RecurrenceListItem, RecurrenceStatus, RecurrenceSummary } from '../../../main/shared/recurrence.constants'
import { hasNextDate, toRecurrenceRule } from '../../../main/shared/recurrence.helper'
import {
  WAITING_FOR_ARCHIVE_LABEL,
  describeRecurrence,
  formatNextRun,
  isWaitingForArchive,
} from '../../utils/recurrence.helper'
import { getLogger } from '../../utils/logger'
import { useErrorToast, useUndoToast } from '../../utils/toast.helper'

/**
 * Liste des tâches récurrentes dans les Paramètres : règle, prochaine date,
 * mise en pause, reprise, arrêt (annulable) et réactivation.
 *
 * L'état des séries est celui du store Task, que lisent aussi les cartes du
 * tableau et des archives : une série mise en pause ou arrêtée ici grise
 * aussitôt l'icône de ses occurrences. Seuls l'ordre et le titre du modèle
 * viennent du chargement de la liste.
 */

/** Ligne de la liste : titre du modèle et dernier état connu de la série. */
interface RecurrenceRow {
  id: number
  title: string
  summary: RecurrenceSummary
}

const logger = getLogger()
const taskStore = useTaskStore()
const showError = useErrorToast()
const showUndo = useUndoToast()

const status = ref<'loading' | 'error' | 'ready'>('loading')
const items = ref<RecurrenceListItem[]>([])

// Dernier état connu de chaque série (store), à défaut celui du chargement
const rows = computed<RecurrenceRow[]>(() =>
  items.value.map((item) => ({
    id: item.id,
    title: item.title,
    summary: taskStore.getRecurrence(item.id) ?? item,
  })),
)

/** Relit les séries, une occurrence ayant pu être créée depuis le dernier passage. */
async function load() {
  status.value = 'loading'

  try {
    items.value = await taskStore.loadRecurrences()
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
  if (summary.status === 'paused') return 'En pause'
  if (isWaitingForArchive(summary)) return WAITING_FOR_ARCHIVE_LABEL
  if (summary.status === 'ended' || !summary.nextRunAt) return 'Terminée'
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
    showError('Série non modifiée', `L'état de « ${row.title} » n'a pas changé.`)
  }
}

/**
 * Arrête une série, annulable quelques secondes : elle retrouve alors son
 * état d'avant (active, elle repart de maintenant sans rattrapage)
 * @param row Série
 */
async function stop(row: RecurrenceRow) {
  const previous = row.summary.status

  try {
    await taskStore.updateRecurrenceStatus(row.id, 'ended')
  } catch {
    showError('Arrêt impossible', `La série « ${row.title} » n'a pas été arrêtée.`)
    return
  }

  showUndo('Série arrêtée', {
    detail: row.title,
    undo: async () => {
      try {
        await taskStore.updateRecurrenceStatus(row.id, previous)
      } catch {
        showError('Annulation impossible', "La série n'a pas été relancée.")
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
