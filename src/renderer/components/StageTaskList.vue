<template>
  <div :class="['task-list flex flex-col justify-between flex-1 min-h-0', { 'is-dragging': isDragging }]">
    <!-- Liste étirée sur toute la hauteur libre : dépôt possible n'importe où dans la colonne.
         Elle défile seule quand les cartes débordent, en-tête et bouton d'ajout restent visibles -->
    <draggable
      :list="tasks"
      group="tasks"
      itemKey="id"
      v-bind="DND_OPTIONS"
      :disabled="filterActive"
      data-testid="task-list-scroll"
      class="task-list-scroll flex flex-col flex-1 min-h-16"
      @start="setDragging(true)"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div data-testid="task-card" :class="['group draggable-item', { 'drag-disabled': filterActive }]">
          <!-- Titre en bouton, sa zone de clic couvre toute la carte : un clic n'importe
               où l'ouvre, comme Entrée au clavier. Un clic qui termine un drag est ignoré
               par SortableJS. Le clic droit (ou la touche Menu) ouvre les actions de la carte,
               les flèches passent aux cartes voisines. -->
          <button
            type="button"
            data-testid="task-card-open"
            :data-task-id="element.id"
            class="task-title"
            aria-haspopup="menu"
            @click="$emit('edit-task', element)"
            @keydown="onTitleKeydown($event, element)"
            @contextmenu.prevent="$emit('card-menu', $event, element)"
          >
            {{ element.title }}
          </button>

          <!-- Pied de carte : tags à gauche, date de début, avancement de la checklist
               puis icônes de description et de récurrence calés à droite -->
          <div
            v-if="
              cardTags.get(element.id)?.length ||
              cardDates.get(element.id) ||
              element.checklist?.items.length ||
              cardRecurrences.get(element.id) ||
              hasDescription(element.description)
            "
            class="card-footer flex items-end gap-2"
          >
            <!-- Tags de la carte : nom et couleur lus dans le store, jamais dans task.tags -->
            <div class="card-tags flex flex-wrap gap-1 flex-1 min-w-0">
              <TagChip
                v-for="tag in cardTags.get(element.id)"
                :key="tag.id"
                data-testid="task-card-tag"
                :tagId="tag.id"
                :name="tag.name"
                size="small"
                removable
                removeOnHover
                removeTestId="task-card-tag-remove"
                @remove="$emit('remove-tag', element, tag.id)"
              />
            </div>

            <!-- Date de début (« Demain, 09:00 »), teintée le jour même et passée la date,
                 date complète au survol et en aria-label -->
            <time
              v-if="cardDates.get(element.id)"
              v-tooltip.top="infoTooltip(cardDates.get(element.id)!.tooltip, isDragging)"
              data-testid="task-card-date"
              :datetime="cardDates.get(element.id)!.datetime"
              :data-state="cardDates.get(element.id)!.state"
              :class="['card-date', cardDates.get(element.id)!.state]"
              :aria-label="cardDates.get(element.id)!.tooltip"
            >
              <i class="pi pi-calendar" aria-hidden="true"></i>{{ cardDates.get(element.id)!.label }}
            </time>

            <!-- Avancement de la checklist (« 2/6 »), vert quand tout est coché, absent sans point.
                 Un clic ouvre la bulle où cocher les points sans passer par le dialogue -->
            <CardChecklist
              :task="element"
              :disabled="isDragging"
              @check-item="(itemId: number, checked: boolean) => $emit('check-item', element, itemId, checked)"
              @open="$emit('edit-task', element)"
            />

            <!-- Tâche avec une description : son début au survol, sans la syntaxe Markdown.
                 Même texte en aria-label, nom accessible de l'icône -->
            <i
              v-if="hasDescription(element.description)"
              v-tooltip.top="infoTooltip(descriptionExcerpt(element.description), isDragging)"
              data-testid="task-card-description"
              class="pi pi-align-left description-icon"
              :aria-label="descriptionExcerpt(element.description)"
            ></i>

            <!-- Tâche récurrente : résumé de la série et prochaine date au survol, aussi en aria-label -->
            <i
              v-if="cardRecurrences.get(element.id)"
              v-tooltip.top="infoTooltip(recurrenceTooltip(cardRecurrences.get(element.id)!), isDragging)"
              data-testid="task-card-recurrence"
              :data-status="cardRecurrences.get(element.id)!.status"
              :class="[
                'pi pi-sync recurrence-icon',
                { inactive: cardRecurrences.get(element.id)!.status !== 'active' },
              ]"
              :aria-label="recurrenceTooltip(cardRecurrences.get(element.id)!)"
            ></i>
          </div>

          <!-- Actions en surimpression : masquées, elles ne prennent pas de place au titre -->
          <div class="card-actions opacity-0 group-hover:opacity-100">
            <Button
              severity="success"
              data-testid="btn-edit-task"
              class="draggable-button"
              @click="$emit('edit-task', element)"
            >
              <i class="pi pi-pencil text-white"></i>
            </Button>

            <Button
              severity="danger"
              data-testid="btn-archive-task"
              class="draggable-button"
              @click="onArchiveClick($event, element)"
            >
              <i class="pi pi-trash text-white"></i>
            </Button>
          </div>
        </div>
      </template>
    </draggable>

    <Button
      class="btn-edit-task mt-3"
      data-testid="btn-add-task"
      text
      aria-keyshortcuts="N"
      v-tooltip.bottom="infoTooltip(t('board.addTaskShortcut'), isDragging)"
      @click="$emit('create-task')"
    >
      <i class="pi pi-plus absolute left-3"></i>
      <span>{{ t('board.addTask') }}</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import Button from 'primevue/button'
import TagChip from './TagChip.vue'
import CardChecklist from './CardChecklist.vue'
import { Task } from '../types/task.types'
import { Tag } from '../types/tag.types'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { compareTagNames } from '../utils/tag.helper'
import { recurrenceTooltip } from '../utils/recurrence.helper'
import { descriptionExcerpt, hasDescription } from '../utils/description.helper'
import { infoTooltip } from '../utils/tooltip.helper'
import { dayState, longDateLabel, shortDateLabel, type DayState } from '../utils/date.helper'
import { useNow } from '../utils/now.helper'
import { useTaskStore } from '../stores/Task'
import type { RecurrenceSummary } from '../../main/shared/recurrence.constants'
import { DND_OPTIONS } from '../constants/dnd.constants'
import { isDragging, setDragging } from '../utils/dnd.helper'
import { useDangerConfirm } from '../utils/confirm.helper'
import { focusNeighborCard } from '../utils/cardFocus.helper'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    tasks: Task[]
    // Filtre actif : DnD des tâches désactivé, les index de la vue filtrée ne
    // correspondant plus aux positions réelles de la colonne
    filterActive?: boolean
  }>(),
  { filterActive: false },
)

const emit = defineEmits([
  'tasks-drop',
  'edit-task',
  'archive-task',
  'create-task',
  'remove-tag',
  'check-item',
  'card-menu',
  'move-card',
])

// Sens de déplacement d'une carte par Alt+flèche
const MOVE_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * Touches sur le titre d'une carte, sans faire défiler la page : flèches,
 * Début et Fin pour passer le focus à une carte voisine, Alt+flèche pour
 * déplacer la carte (fait par le parent), Suppr pour l'archiver.
 * @param event Touche pressée
 * @param task Tâche de la carte
 */
function onTitleKeydown(event: KeyboardEvent, task: Task) {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return

  if (event.key === 'Delete' && !event.altKey) {
    event.preventDefault()
    archiveFromKeyboard(event.currentTarget as HTMLElement, task)
    return
  }

  if (event.altKey) {
    const direction = MOVE_KEYS[event.key]
    if (!direction) return
    event.preventDefault()
    if (!event.repeat) emit('move-card', task, direction)
    return
  }

  if (focusNeighborCard(event.currentTarget as HTMLElement, event.key)) event.preventDefault()
}

/** Fin d'un drag de carte : fin du curseur de drag, puis sauvegarde par le parent. */
function onDragEnd() {
  setDragging(false)
  emit('tasks-drop')
}

const tagStore = useTagStore()
const taskStore = useTaskStore()
const settings = useSettingsStore()
const confirmDanger = useDangerConfirm()
const { t } = useI18n()
const now = useNow()

/**
 * Série de chaque carte récurrente, dans son dernier état connu (store Task) :
 * une série arrêtée depuis une autre occurrence grise aussi cette carte.
 */
const cardRecurrences = computed(() => {
  const map = new Map<number, RecurrenceSummary>()

  for (const task of props.tasks) {
    const recurrence = taskStore.getRecurrence(task.recurrenceId) ?? task.recurrence
    if (recurrence) map.set(task.id, recurrence)
  }

  return map
})

/**
 * Date de début de chaque carte qui en a une, libellé court relatif au jour
 * courant, place par rapport à aujourd'hui et date complète. Recalculé chaque
 * minute (cf. useNow), « Demain » devient ainsi « Aujourd'hui » passé minuit.
 */
const cardDates = computed(() => {
  const map = new Map<number, { label: string; state: DayState; tooltip: string; datetime: string }>()

  for (const task of props.tasks) {
    if (!task.startDate) continue
    const date = new Date(task.startDate)
    map.set(task.id, {
      label: shortDateLabel(date, now.value),
      state: dayState(date, now.value),
      tooltip: t('board.startDateTooltip', { date: longDateLabel(date) }),
      datetime: date.toISOString(),
    })
  }

  return map
})

/**
 * Clic sur la corbeille d'une carte : archivage direct, ou après confirmation
 * dans une bulle ancrée sur le bouton si le paramètre est activé.
 * @param event Clic sur le bouton
 * @param task Tâche de la carte
 */
function onArchiveClick(event: MouseEvent, task: Task) {
  askArchive(event.currentTarget as HTMLElement, task)
}

/**
 * Archive une carte, directement ou après confirmation dans une bulle ancrée
 * sur `target` si le paramètre est activé.
 * @param target Élément qui porte la bulle
 * @param task Tâche de la carte
 */
function askArchive(target: HTMLElement, task: Task) {
  if (!settings.confirmArchive) {
    emit('archive-task', task)
    return
  }

  confirmDanger({
    target,
    message: t('board.archiveConfirm'),
    acceptLabel: t('common.archive'),
    accept: () => emit('archive-task', task),
  })
}

/**
 * Suppr sur le titre d'une carte : archivage, comme la corbeille. Le focus
 * passe d'abord à la carte voisine (la suivante, sinon la précédente), la
 * carte archivée quittant le tableau.
 * @param title Titre de la carte
 * @param task Tâche de la carte
 */
function archiveFromKeyboard(title: HTMLElement, task: Task) {
  const card = title.closest<HTMLElement>('[data-testid="task-card"]') ?? title
  if (settings.confirmArchive) {
    askArchive(card, task)
    return
  }

  if (!focusNeighborCard(title, 'ArrowDown')) focusNeighborCard(title, 'ArrowUp')
  askArchive(card, task)
}

/**
 * Tags de chaque carte, calculés une fois par rendu : nom et couleur lus dans le
 * store (source de vérité), triés par nom sans tenir compte de la casse (le tri
 * de l'API y est sensible). Un tag supprimé disparaît ; un tag que le cache ne
 * connaît pas encore reste affiché avec le nom porté par la tâche.
 */
const cardTags = computed(() => {
  const map = new Map<number, Pick<Tag, 'id' | 'name'>[]>()

  for (const task of props.tasks) {
    const tags = (task.tags ?? [])
      .filter((t) => !tagStore.wasDeleted(t.id))
      .map((t) => tagStore.getTagById(t.id) ?? t)
      .sort(compareTagNames)
      .map((t) => ({ id: t.id, name: t.name }))
    map.set(task.id, tags)
  }

  return map
})
</script>

<style scoped>
@reference "tailwindcss";

.btn-edit-task {
  @apply w-full flex items-center justify-center relative pl-8;
}

/* Marge intérieure compensée : l'ombre des cartes n'est pas rognée sur les côtés par le défilement.
   Largeur laissée à l'étirement du parent (pas de w-full) : avec une largeur fixée,
   les marges négatives décalaient la liste vers la gauche au lieu de l'élargir des deux côtés */
.task-list-scroll {
  @apply -mx-2 px-2 overflow-y-auto;
}

.draggable-item {
  @apply relative flex flex-col gap-1 rounded-md p-2 mb-2 shadow-md cursor-grab;
  background-color: var(--p-surface-300);
}

/* Titre sur toute la largeur, un mot trop long est coupé plutôt que de déborder.
   Bouton sans habillage, le curseur reste celui du drag */
.task-title {
  @apply p-0 text-left font-bold;
  overflow-wrap: anywhere;
  background: none;
  border: none;
  color: inherit;
  cursor: inherit;
}

/* Zone de clic du titre étendue à toute la carte */
.task-title::after {
  @apply absolute inset-0;
  content: '';
  border-radius: inherit;
}

/* Focus clavier du titre affiché sur toute la carte */
.task-title:focus-visible {
  outline: none;
}

.draggable-item:has(.task-title:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

/* Pied au-dessus de la zone de clic : chips, date, badge et icônes gardent leur
   clic et leur infobulle, l'espace libre entre eux ouvre la carte */
.card-footer {
  @apply relative z-[1];
  pointer-events: none;
}

.card-footer > :deep(:not(.card-tags)),
.card-tags > :deep(*) {
  pointer-events: auto;
}

/* Fond repris de la carte (survol compris) : le titre passe proprement sous les boutons */
.card-actions {
  @apply absolute top-2 right-2 z-[2] h-6 flex gap-2 pl-2 rounded-md;
  background-color: inherit;
}

.app-dark .draggable-item {
  background-color: var(--p-surface-800);
}

/* Survol en pause pendant un drag : seules les cartes déplacées changent d'aspect */
.task-list:not(.is-dragging) .draggable-item:hover {
  background-color: var(--p-surface-400);
}

.app-dark .task-list:not(.is-dragging) .draggable-item:hover {
  background-color: var(--p-surface-700);
}

/* Emplacement de dépôt : cadre en pointillés teinté, contenu masqué */
.draggable-item.dnd-ghost {
  background-color: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
  box-shadow: none;
}

.draggable-item.dnd-ghost > * {
  visibility: hidden;
}

/* Carte tenue : légèrement inclinée et soulevée (rotate et scale se cumulent
   au transform posé par SortableJS pour suivre la souris) */
.draggable-item.dnd-dragging {
  rotate: 2deg;
  scale: 1.03;
  box-shadow: 0 12px 24px rgb(0 0 0 / 0.25);
}

.draggable-item.drag-disabled {
  @apply cursor-default;
}

.draggable-button {
  @apply w-6 cursor-pointer transition-opacity duration-200;
}

.recurrence-icon {
  @apply shrink-0 text-xs;
  color: var(--p-primary-color);
}

/* Date de début, discrète tant qu'elle est à venir */
.card-date {
  @apply inline-flex shrink-0 items-center rounded px-1 whitespace-nowrap;
  gap: 3px;
  height: 18px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.card-date .pi {
  font-size: 12px;
}

/* Le jour même, à l'accent */
.card-date.today {
  @apply font-semibold;
  background-color: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-color);
}

/* Date passée, la tâche attend depuis la veille ou plus */
.card-date.past {
  @apply font-semibold;
  background-color: var(--p-orange-100);
  color: var(--p-orange-700);
}

.app-dark .card-date.past {
  background-color: color-mix(in srgb, var(--p-orange-400) 15%, transparent);
  color: var(--p-orange-400);
}

/* Discrète : signale seulement qu'il y a quelque chose à lire */
.description-icon {
  @apply shrink-0 text-xs;
  color: var(--p-text-muted-color);
}

/* Série arrêtée ou en pause : icône grisée */
.recurrence-icon.inactive {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}
</style>
