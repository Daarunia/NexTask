<template>
  <div
    class="flex h-full min-h-0 flex-col gap-3 p-4"
    data-testid="planning"
    @keydown="onCardKeydown"
    @contextmenu="onCardContextMenu"
  >
    <PlanningToolbar
      :title="title"
      :showBoardFilter="multiBoard"
      @previous="calendarApi()?.prev()"
      @today="calendarApi()?.today()"
      @next="calendarApi()?.next()"
    />

    <p v-if="showFilterEmpty" data-testid="filter-empty" class="planning-filter-empty">
      {{ t('board.filterNoMatch') }}
    </p>

    <div class="flex min-h-0 flex-1 gap-3">
      <div ref="calendarWrapper" class="planning-calendar min-w-0 flex-1">
        <FullCalendar ref="calendar" :options="calendarOptions" data-testid="planning-calendar">
          <template #eventContent="arg">
            <PlanningCard
              v-if="cardTask(arg.event.id)"
              :task="cardTask(arg.event.id)!"
              :compact="settings.planningScale === 'month'"
              :showBoard="multiBoard"
            />
            <!-- Occurrence à venir d'une série, en lecture seule. Carte sans tâche
                 aussi pendant un dépôt depuis le panneau, le temps du drag. -->
            <div
              v-else
              :data-testid="arg.event.extendedProps.projected ? 'planning-projection' : undefined"
              :class="['planning-ghost', { projected: arg.event.extendedProps.projected }]"
            >
              <i v-if="arg.event.extendedProps.projected" class="pi pi-sync" aria-hidden="true"></i>
              <span class="truncate">{{ arg.event.title }}</span>
            </div>
          </template>
        </FullCalendar>
      </div>

      <PlanningPanel
        ref="panel"
        :unscheduled="unscheduled"
        :overdue="overdue"
        :showBoard="multiBoard"
        :dropTarget="draggingFromGrid"
        @open="openEditDialog"
      />
    </div>

    <!-- Menu contextuel partagé par les cartes, comme au Kanban -->
    <KanbanCardMenu
      ref="cardMenu"
      hideColumnPlacement
      @open="openTask"
      @duplicate="duplicateTask"
      @toggle-tag="toggleTaskTag"
      @start-date="setStartDate"
      @move="moveToStage"
      @move-board="moveTaskToBoard"
      @archive="askArchiveTask"
    />

    <KanbanTaskDialog
      v-model="showDialog"
      :stageId="stageDialog ?? 0"
      :editTask="editTask"
      :position="positionDialog"
      :creationMode="creationMode"
      :defaultTags="defaultTagsDialog"
      :initialStartDate="initialStartDate"
      @task-saved="onTaskSaved"
      @archive-task="archiveTask"
      @duplicate-task="duplicateTask"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePrimeVue } from 'primevue/config'
import { useI18n } from 'vue-i18n'
import FullCalendar, {
  type CalendarApi,
  type CalendarOptions,
  type DatesSetInfo,
  type DidMountHandler,
  type DropInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventDragStartInfo,
  type EventDragStopInfo,
  type EventDropInfo,
  type EventInput,
} from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/vue3/daygrid'
import interactionPlugin, { Draggable } from '@fullcalendar/vue3/interaction'
import classicTheme from '@fullcalendar/vue3/themes/classic'
import fcEs from '@fullcalendar/vue3/locales/es'
import fcFr from '@fullcalendar/vue3/locales/fr'
import fcPt from '@fullcalendar/vue3/locales/pt-br'
import fcZh from '@fullcalendar/vue3/locales/zh-cn'
import '@fullcalendar/vue3/skeleton.css'
import '@fullcalendar/vue3/themes/classic/theme.css'
import type { RecurrenceListItem } from '@core/shared/recurrence.constants'
import type { Locale } from '@core/shared/settings.constants'
import PlanningCard from './PlanningCard.vue'
import PlanningPanel from './PlanningPanel.vue'
import PlanningToolbar from './PlanningToolbar.vue'
import KanbanCardMenu from '../kanban/KanbanCardMenu.vue'
import KanbanTaskDialog from '../kanban/KanbanTaskDialog.vue'
import { currentLocale } from '../../i18n'
import { useBoardStore } from '../../stores/Board'
import { useBoardFilterStore } from '../../stores/BoardFilter'
import { usePlanningStore } from '../../stores/Planning'
import { useSettingsStore } from '../../stores/Settings'
import { useStageStore } from '../../stores/Stage'
import { useTaskStore } from '../../stores/Task'
import type { TagSelection } from '../../types/tag.types'
import type { Task } from '../../types/task.types'
import { setDragging } from '../../utils/dnd.helper'
import { isEditableTarget, isInOverlay } from '../../utils/keyboard.helper'
import { getLogger } from '../../utils/logger'
import { useNow } from '../../utils/now.helper'
import {
  creationStageId,
  dayKey,
  dayStartDate,
  movedStartDate,
  newTaskPosition,
  overdueBeforeRange,
  parseDayKey,
  positionsAfterTopInsert,
  projectOccurrences,
  shiftDays,
  stageRanks,
  taskRank,
  tasksOfBoards,
  unscheduledTasks,
} from '../../utils/planning.helper'
import { normalizeSearchText } from '../../utils/search.helper'
import { useTaskActions } from '../../utils/taskActions.helper'
import { useErrorToast, useInfoToast, useUndoToast } from '../../utils/toast.helper'

/**
 * Vue Planning de la page du tableau : les tâches actives de tous les tableaux,
 * ou de ceux du filtre, sur un calendrier selon leur date de début. La grille est
 * celle de FullCalendar, ses cartes et sa barre sont celles de l'app.
 *
 * Contrairement au Kanban, aucune copie locale : tout se lit dans le store des
 * tâches, tenu à jour par ses actions. Un déplacement ne change que la date,
 * jamais la colonne ni la position : il reste donc possible sous filtre.
 */

// Vues du calendrier pour chaque échelle
const CALENDAR_VIEWS = { month: 'dayGridMonth', week: 'dayGridWeek' } as const

// Locale de FullCalendar pour chaque langue de l'app (`en` est intégrée)
const CALENDAR_LOCALES: Record<Locale, string> = { fr: 'fr', en: 'en', es: 'es', pt: 'pt-br', zh: 'zh-cn' }

// Déplacement en jours de Alt+flèche sur une carte
const MOVE_DAYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

// Essais pour rendre le focus à une carte déplacée au clavier, et leur écart (ms)
const REFOCUS_ATTEMPTS = 10
const REFOCUS_DELAY = 30

// Carte de la grille ou du panneau, cf. onEventMount et PlanningPanel
const CARD_SELECTOR = '[data-planning-task-id]'

const logger = getLogger()
const { t } = useI18n()
const primevue = usePrimeVue()
const settings = useSettingsStore()
const planning = usePlanningStore()
const boardStore = useBoardStore()
const stageStore = useStageStore()
const taskStore = useTaskStore()
const boardFilter = useBoardFilterStore()
const showError = useErrorToast()
const showInfo = useInfoToast()
const showUndo = useUndoToast()
const now = useNow()

const calendar = ref<InstanceType<typeof FullCalendar> | null>(null)
const calendarWrapper = ref<HTMLElement | null>(null)
const panel = ref<InstanceType<typeof PlanningPanel> | null>(null)
const cardMenu = ref<InstanceType<typeof KanbanCardMenu> | null>(null)

const title = ref('')
// Jours affichés par le calendrier, fin exclue, connus après son premier rendu
const rangeStart = ref<Date | null>(null)
const rangeEnd = ref<Date | null>(null)
const draggingFromGrid = ref(false)

const showDialog = ref(false)
const stageDialog = ref<number | null>(null)
const positionDialog = ref(0)
const editTask = ref<Task | null>(null)
const creationMode = ref(true)
const defaultTagsDialog = ref<TagSelection[]>([])
const initialStartDate = ref<Date | null>(null)

// Séries, pour leurs occurrences à venir
const seriesList = ref<RecurrenceListItem[]>([])

const multiBoard = computed(() => boardStore.getAllBoards.length > 1)

// Tâches retenues par le filtre par tableau et celui de l'en-tête
const tasks = computed(() =>
  tasksOfBoards(taskStore.getAllTasks, planning.boardIds, stageStore.getAllStages).filter((task) =>
    boardFilter.matches(task),
  ),
)

const tasksById = computed(() => new Map(tasks.value.map((task) => [task.id, task])))
const ranks = computed(() => stageRanks(boardStore.getAllBoards, stageStore.getAllStages))

const unscheduled = computed(() => unscheduledTasks(tasks.value, ranks.value))
const overdue = computed(() => (rangeStart.value ? overdueBeforeRange(tasks.value, rangeStart.value, now.value) : []))

// Filtre actif sans aucune tâche retenue
const showFilterEmpty = computed(
  () => (boardFilter.isActive || planning.boardIds.length > 0) && tasks.value.length === 0,
)

/**
 * Tâche d'une carte de la grille, `undefined` pour une occurrence à venir.
 * @param eventId Id de l'événement du calendrier
 */
function cardTask(eventId: string): Task | undefined {
  return tasksById.value.get(Number(eventId))
}

/**
 * Tâche active par son id, retenue ou non par les filtres.
 * @param taskId Id de la tâche
 */
function activeTask(taskId: number): Task | undefined {
  return taskStore.getAllTasks.find((task) => task.id === taskId)
}

/**
 * Occurrences à venir des séries sur la période affichée. Elles n'ont ni tags ni
 * état : masquées avec ces filtres, et filtrées par leur titre pour le texte.
 */
const projectedEvents = computed<EventInput[]>(() => {
  const [start, end] = [rangeStart.value, rangeEnd.value]
  if (!start || !end || boardFilter.tagIds.length || boardFilter.statuses.length) return []

  const events: EventInput[] = []
  for (const listed of seriesList.value) {
    // Dernier état connu de la série (générations et arrêts depuis le chargement)
    const series = { ...listed, ...taskStore.getRecurrence(listed.id) }
    if (planning.boardIds.length && !planning.boardIds.includes(series.boardId ?? -1)) continue

    const text = normalizeSearchText(series.title)
    if (!boardFilter.terms.every((term) => text.includes(term))) continue

    for (const occurrence of projectOccurrences(series, start, end)) {
      events.push({
        id: `series-${occurrence.seriesId}-${occurrence.date.getTime()}`,
        title: occurrence.title,
        start: occurrence.date,
        allDay: false,
        editable: false,
        interactive: false,
        extendedProps: { projected: true, rank: Number.MAX_SAFE_INTEGER },
      })
    }
  }

  return events
})

const events = computed<EventInput[]>(() => [
  ...tasks.value.flatMap((task) =>
    task.startDate
      ? [
          {
            id: String(task.id),
            title: task.title,
            start: new Date(task.startDate),
            allDay: false,
            extendedProps: { rank: taskRank(task, ranks.value) },
          },
        ]
      : [],
  ),
  ...projectedEvents.value,
])

// Options qui ne changent jamais, gardées dans un seul objet : recréer `plugins`,
// `locales` ou `views` à chaque calcul ferait reconstruire tout le calendrier, et
// redéclencherait `datesSet` en boucle
const STATIC_OPTIONS: CalendarOptions = {
  plugins: [classicTheme, dayGridPlugin, interactionPlugin],
  // Lues une seule fois par le calendrier, cf. watch de l'échelle
  initialView: CALENDAR_VIEWS[settings.planningScale],
  initialDate: planning.anchor ?? new Date(),
  headerToolbar: false,
  height: '100%',
  locales: [fcEs, fcFr, fcPt, fcZh],
  fixedWeekCount: false,
  editable: true,
  eventDurationEditable: false,
  droppable: true,
  eventDisplay: 'block',
  eventColor: 'transparent',
  eventOrder: 'start,rank',
  views: { dayGridMonth: { dayMaxEvents: true }, dayGridWeek: { dayMaxEvents: false } },
  moreLinkText: (count) => t('planning.more', { count }),
  popoverClass: 'planning-popover',
  // Le jour d'une cellule (ou d'un en-tête en semaine) est un lien qui crée une tâche
  navLinks: true,
  navLinkClass: 'planning-day-link',
  navLinkHint: (dateText) => t('planning.addOnDay', { date: dateText }),
  navLinkDayClick: (date) => openCreateDialog(date),
  datesSet: onDatesSet,
  eventDidMount: onEventMount,
  eventClick: onEventClick,
  eventDragStart: onEventDragStart,
  eventDragStop: onEventDragStop,
  eventDrop: onEventDrop,
  drop: onExternalDrop,
}

const calendarOptions = computed<CalendarOptions>(() => ({
  ...STATIC_OPTIONS,
  locale: CALENDAR_LOCALES[currentLocale()],
  firstDay: primevue.config.locale?.firstDayOfWeek,
  events: events.value,
}))

/** API du calendrier, absente avant son montage. */
function calendarApi(): CalendarApi | undefined {
  return calendar.value?.getApi()
}

/**
 * Période affichée changée : titre, jours affichés, et jour gardé pour un
 * prochain retour sur le Planning.
 * @param info Période affichée
 */
function onDatesSet(info: DatesSetInfo) {
  title.value = info.view.title
  planning.anchor = info.view.currentStart

  // Mêmes jours : garder les mêmes dates évite de recalculer les occurrences à venir
  if (rangeStart.value?.getTime() === info.start.getTime() && rangeEnd.value?.getTime() === info.end.getTime()) return
  rangeStart.value = info.start
  rangeEnd.value = info.end
}

/**
 * Pose sur chaque carte de tâche ce qui permet de la retrouver depuis le DOM. La
 * copie qui suit la souris pendant un drag n'en a pas besoin.
 * @param info Carte montée
 */
function onEventMount(info: Parameters<DidMountHandler<EventDisplayInfo>>[0]) {
  if (info.isMirror || info.event.extendedProps.projected) return
  info.el.dataset.planningTaskId = info.event.id
  info.el.dataset.testid = 'planning-event'
}

/**
 * Clic (ou Entrée) sur une carte de la grille : ouverture en édition.
 * @param info Clic
 */
function onEventClick(info: EventClickInfo) {
  info.jsEvent.preventDefault()
  const task = cardTask(info.event.id)
  if (task) openEditDialog(task)
}

/**
 * Début d'un drag dans la grille : le panneau montre où retirer la date.
 * @param _info Carte tenue
 */
function onEventDragStart(_info: EventDragStartInfo) {
  setDragging(true)
  draggingFromGrid.value = true
}

/**
 * Fin d'un drag dans la grille. Lâchée sur « Sans date », hors du calendrier qui
 * ne voit alors pas de dépôt, la tâche perd sa date.
 * @param info Carte lâchée
 */
function onEventDragStop(info: EventDragStopInfo) {
  setDragging(false)
  draggingFromGrid.value = false

  const { clientX, clientY } = info.jsEvent
  const task = cardTask(info.event.id)
  if (task && panel.value?.isInUnscheduledZone(clientX, clientY)) reschedule(task, null)
}

/**
 * Carte déposée sur un autre jour : l'heure est gardée, et la carte revient à sa
 * place si l'enregistrement échoue.
 * @param info Dépôt
 */
function onEventDrop(info: EventDropInfo) {
  const task = cardTask(info.event.id)
  if (!task?.startDate || !info.event.start) {
    info.revert()
    return
  }

  reschedule(task, movedStartDate(new Date(task.startDate), info.event.start), info.revert)
}

/**
 * Carte du panneau déposée sur un jour : une tâche en retard garde son heure,
 * une tâche sans date en reçoit une.
 * @param info Dépôt
 */
function onExternalDrop(info: DropInfo) {
  const task = activeTask(Number(info.draggedEl.dataset.planningTaskId))
  if (!task) return

  reschedule(
    task,
    task.startDate ? movedStartDate(new Date(task.startDate), info.date) : dayStartDate(info.date, new Date()),
  )
}

/**
 * Change la date d'une tâche déplacée, sans toucher au modèle de sa série. Le toast
 * propose de l'annuler, en lui rendant aussi la date de son rappel : déjà notifiée,
 * une tâche repoussée puis remise à sa date passée ne notifie pas une seconde fois.
 * @param task Tâche déplacée, telle qu'avant le déplacement
 * @param date Nouvelle date, `null` pour la retirer
 * @param revert Remet la carte à sa place dans la grille, en cas d'échec
 * @returns Vrai si la date a été enregistrée
 */
async function reschedule(task: Task, date: Date | null, revert?: () => void): Promise<boolean> {
  const previousDate = task.startDate ? new Date(task.startDate) : null
  const previousNotifiedAt = task.notifiedAt ?? null

  try {
    await taskStore.setTaskStartDate(task.id, date)
  } catch {
    revert?.()
    showError(t('board.dateFailed'))
    return false
  }

  showUndo(t('planning.moved'), {
    detail: task.title,
    undo: async () => {
      try {
        await taskStore.setTaskStartDate(task.id, previousDate, previousNotifiedAt)
      } catch {
        showError(t('board.undoFailed'))
      }
    },
  })
  return true
}

// Actions communes avec le Kanban, le store étant ici la seule source des cartes
const {
  filterTagSelection,
  updateTagCounts,
  toggleTaskTag,
  setStartDate,
  moveTaskToBoard,
  archiveTask,
  askArchiveTask,
  duplicateTask,
} = useTaskActions({
  find: (taskId) => {
    const task = activeTask(taskId)
    return task ? { task, stageId: task.stageId } : null
  },
  insert: () => {},
  remove: () => null,
  update: () => {},
  open: openTask,
})

/**
 * Ouverture du dialogue en édition.
 * @param task Tâche
 */
function openEditDialog(task: Task) {
  if (showDialog.value) return

  stageDialog.value = task.stageId
  editTask.value = task
  creationMode.value = false
  showDialog.value = true
}

/**
 * Ouvre une tâche en édition, retrouvée par id. Ignorée si elle a quitté le tableau.
 * @param taskId Id de la tâche
 */
function openTask(taskId: number) {
  const task = activeTask(taskId)
  if (task) openEditDialog(task)
}

/**
 * Ouverture du dialogue en création, avec la date du jour choisi et la colonne
 * déduite du filtre et du tableau courant.
 * @param day Jour choisi
 */
function openCreateDialog(day: Date) {
  if (showDialog.value) return

  const stageId = creationStageId(
    boardStore.getAllBoards,
    stageStore.getAllStages,
    planning.boardIds,
    boardStore.current?.id,
    settings.collapsedStageIds,
  )
  if (stageId === null) {
    showInfo(t('planning.noStage'))
    return
  }

  const stageTasks = taskStore.getAllTasks.filter((task) => task.stageId === stageId)
  stageDialog.value = stageId
  positionDialog.value = newTaskPosition(stageTasks, settings.newTaskPosition)
  defaultTagsDialog.value = filterTagSelection()
  initialStartDate.value = dayStartDate(day, new Date())
  editTask.value = null
  creationMode.value = true
  showDialog.value = true
}

/**
 * Tâche enregistrée depuis le dialogue : le store est déjà à jour, restent les
 * compteurs des tags et, pour une création en haut de colonne, les positions des
 * autres cartes, que le serveur ne décale pas.
 * @param task Tâche enregistrée
 */
async function onTaskSaved(task: Task) {
  const newTagIds = (task.tags ?? []).map((tag) => tag.id)

  if (!creationMode.value) {
    updateTagCounts(
      (editTask.value?.tags ?? []).map((tag) => tag.id),
      newTagIds,
    )
    return
  }

  updateTagCounts([], newTagIds)
  if (settings.newTaskPosition !== 'top') return

  const others = taskStore.getAllTasks.filter((other) => other.stageId === task.stageId && other.id !== task.id)
  try {
    await taskStore.updateTaskBatch(positionsAfterTopInsert(others))
  } catch {
    showError(t('board.orderNotSaved'), t('board.orderNotSavedDetail'))
  }
}

/**
 * Déplace une carte vers une autre colonne depuis son menu, en bas de celle-ci.
 * @param taskId Id de la tâche
 * @param stageId Colonne d'arrivée
 */
async function moveToStage(taskId: number, stageId: number) {
  try {
    await taskStore.moveTaskToStage(taskId, stageId)
  } catch {
    showError(t('board.moveCanceled'))
  }
}

/**
 * Clic droit (ou touche Menu) sur une carte : son menu, à la place de celui du système.
 * @param event Clic droit
 */
function onCardContextMenu(event: MouseEvent) {
  const card = (event.target as Element).closest<HTMLElement>(CARD_SELECTOR)
  const task = card && activeTask(Number(card.dataset.planningTaskId))
  if (!card || !task) return

  event.preventDefault()
  cardMenu.value?.show(event, task, { stageId: task.stageId, index: 0, count: 1 }, card)
}

/**
 * Cartes de la grille par jour, dans l'ordre affiché.
 */
function gridCardsByDay(): Map<string, HTMLElement[]> {
  const byDay = new Map<string, HTMLElement[]>()

  for (const card of calendarWrapper.value?.querySelectorAll<HTMLElement>(CARD_SELECTOR) ?? []) {
    const startDate = activeTask(Number(card.dataset.planningTaskId))?.startDate
    if (!startDate) continue
    const key = dayKey(new Date(startDate))
    byDay.set(key, [...(byDay.get(key) ?? []), card])
  }

  return byDay
}

/**
 * Passe le focus à une carte voisine : même jour avec haut et bas, jour le plus
 * proche qui a des cartes avec gauche et droite.
 * @param card Carte qui a le focus
 * @param day Jour de la carte
 * @param key Flèche pressée
 */
function focusNeighbor(card: HTMLElement, day: string, key: string) {
  const byDay = gridCardsByDay()

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const cards = byDay.get(day) ?? []
    cards[cards.indexOf(card) + (key === 'ArrowUp' ? -1 : 1)]?.focus()
    return
  }

  // Les clés `YYYY-MM-DD` se comparent dans l'ordre des dates
  const days = [...byDay.keys()].sort()
  const target = key === 'ArrowLeft' ? days.findLast((other) => other < day) : days.find((other) => other > day)
  if (target) byDay.get(target)?.[0]?.focus()
}

/**
 * Déplace une carte au clavier, affiche la période d'arrivée et lui rend le focus,
 * le calendrier la recréant à sa nouvelle place.
 * @param task Tâche de la carte
 * @param date Date de début actuelle
 * @param days Jours à ajouter
 */
async function moveCardByKey(task: Task, date: Date, days: number) {
  const moved = shiftDays(date, days)
  if (!(await reschedule(task, moved))) return

  calendarApi()?.gotoDate(moved)
  refocusCard(task.id)
}

/**
 * Rend le focus à une carte que le calendrier recrée à sa nouvelle place, un peu
 * après l'enregistrement : essayé à plusieurs reprises, tant que le focus n'a pas
 * été posé ailleurs entre-temps.
 * @param taskId Id de la tâche
 * @param attempts Essais restants
 */
function refocusCard(taskId: number, attempts = REFOCUS_ATTEMPTS) {
  const card = calendarWrapper.value?.querySelector<HTMLElement>(`[data-planning-task-id="${taskId}"]`)
  const active = document.activeElement
  if (card && (!active || active === document.body)) card.focus()
  if (attempts > 0) setTimeout(() => refocusCard(taskId, attempts - 1), REFOCUS_DELAY)
}

/**
 * Touches sur une carte : flèches pour passer à une voisine, Alt+flèche pour la
 * déplacer d'un jour ou d'une semaine, Suppr pour l'archiver. Entrée est gérée
 * par le calendrier, ou par le bouton de la carte dans le panneau.
 * @param event Touche pressée
 */
function onCardKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return

  const card = (event.target as Element).closest<HTMLElement>(CARD_SELECTOR)
  const task = card && activeTask(Number(card.dataset.planningTaskId))
  if (!card || !task) return

  if (event.key === 'Delete' && !event.altKey) {
    event.preventDefault()
    askArchiveTask(task, card)
    return
  }

  // Les cartes du panneau n'ont pas de jour dans la grille
  if (!(event.key in MOVE_DAYS) || !task.startDate || !calendarWrapper.value?.contains(card)) return
  event.preventDefault()

  const date = new Date(task.startDate)
  if (!event.altKey) focusNeighbor(card, dayKey(date), event.key)
  else if (!event.repeat) moveCardByKey(task, date, MOVE_DAYS[event.key])
}

/**
 * Jour d'une création au clavier : celui de l'élément qui a le focus dans la grille,
 * sinon aujourd'hui s'il est affiché, sinon le premier jour de la période.
 */
function creationDay(): Date {
  const key = document.activeElement?.closest<HTMLElement>('[data-date]')?.dataset.date
  if (key) return parseDayKey(key)

  const today = new Date()
  const shown = rangeStart.value && rangeEnd.value && today >= rangeStart.value && today < rangeEnd.value
  return shown ? today : (calendarApi()?.view.currentStart ?? today)
}

/**
 * Raccourcis de la vue, ignorés pendant une saisie ou dans un menu ou un dialogue
 * ouvert : N crée une tâche, Page préc. et suiv. changent de période, Ctrl+1 à
 * Ctrl+9 filtrent sur un tableau. La touche se lit par son code, car sur un clavier
 * AZERTY Ctrl+1 donne « & ».
 * @param event Touche pressée
 */
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey || event.repeat) return
  if (showDialog.value || isEditableTarget(event.target) || isInOverlay(event.target)) return
  if (isInOverlay(document.activeElement)) return

  if (event.ctrlKey) {
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
    const board = digit ? boardStore.getAllBoards[Number(digit) - 1] : undefined
    if (digit) event.preventDefault()
    if (board) planning.toggleOnlyBoard(board.id)
    return
  }

  if (event.key.toLowerCase() === 'n') {
    event.preventDefault()
    openCreateDialog(creationDay())
  } else if (event.key === 'PageUp') {
    event.preventDefault()
    calendarApi()?.prev()
  } else if (event.key === 'PageDown') {
    event.preventDefault()
    calendarApi()?.next()
  }
}

/**
 * Ouvre la tâche demandée par la recherche ou un clic sur sa notification, sur la
 * période de sa date. Le filtre n'est pas touché, comme au Kanban, et une saisie en
 * cours dans le dialogue n'est pas remplacée.
 */
function openRequestedTask() {
  const taskId = taskStore.taskToOpen
  if (taskId === null) return
  taskStore.taskToOpen = null

  const task = activeTask(taskId)
  if (!task || showDialog.value) return
  if (task.startDate) calendarApi()?.gotoDate(new Date(task.startDate))
  openEditDialog(task)
}

/**
 * Charge les séries, pour leurs occurrences à venir. Sans elles, le Planning reste
 * utilisable : l'erreur est seulement journalisée.
 */
async function loadSeries() {
  try {
    seriesList.value = await taskStore.loadRecurrences()
  } catch (error) {
    logger.warn('Occurrences à venir des séries indisponibles', error)
  }
}

// Échelle changée, depuis la barre : le calendrier ne relit pas sa vue initiale
watch(
  () => settings.planningScale,
  (scale) => calendarApi()?.changeView(CALENDAR_VIEWS[scale]),
)

// Langue changée : le titre est formaté par le calendrier
watch(currentLocale, async () => {
  await nextTick()
  title.value = calendarApi()?.view.title ?? title.value
})

// Un tableau supprimé sort du filtre
watch(() => boardStore.getAllBoards, planning.pruneDeletedBoards)

// Une nouvelle série apparaît dans le cache : son titre n'est connu que par la liste
watch(() => Object.keys(taskStore.recurrences).length, loadSeries)

watch(() => taskStore.taskToOpen, openRequestedTask)

let draggable: Draggable | undefined

onMounted(() => {
  // Cartes du panneau, à glisser sur un jour. `create: false` : le dépôt ne crée
  // pas d'événement, la carte arrive sur la grille par le store (cf. onExternalDrop)
  if (panel.value?.root) {
    draggable = new Draggable(panel.value.root, {
      itemSelector: CARD_SELECTOR,
      minDistance: 3,
      eventData: (el) => ({ title: activeTask(Number(el.dataset.planningTaskId))?.title ?? '', create: false }),
    })
  }

  globalThis.addEventListener('keydown', onGlobalKeydown)
  openRequestedTask()
  loadSeries()
})

onBeforeUnmount(() => {
  draggable?.destroy()
  globalThis.removeEventListener('keydown', onGlobalKeydown)
  setDragging(false)
})
</script>

<style scoped>
@reference "tailwindcss";

.planning-filter-empty {
  @apply text-center;
  color: var(--p-text-muted-color);
}

.planning-ghost {
  @apply flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs;
  background-color: var(--p-surface-100);
  color: var(--p-text-color);
}

.app-dark .planning-ghost {
  background-color: var(--p-surface-800);
}

/* Occurrence à venir : à distinguer d'une tâche réelle, qu'on peut ouvrir et déplacer */
.planning-ghost.projected {
  background: none;
  border: 1px dashed var(--p-content-border-color);
  color: var(--p-text-muted-color);
}
</style>

<!-- Calendrier hors de portée des styles scoped : le thème est branché sur les
     couleurs de PrimeVue, qui suivent déjà le mode sombre et la couleur choisie -->
<style>
.planning-calendar {
  height: 100%;

  --fc-classic-primary: var(--p-primary-color);
  --fc-classic-primary-foreground: var(--p-primary-contrast-color);
  --fc-classic-button: var(--p-primary-color);
  --fc-classic-button-border: var(--p-primary-color);
  --fc-classic-button-strong: var(--p-primary-color);
  --fc-classic-button-strong-border: var(--p-primary-color);
  --fc-classic-button-outline: color-mix(in srgb, var(--p-primary-color) 50%, transparent);
  --fc-classic-button-foreground: var(--p-primary-contrast-color);
  --fc-classic-ring-color: var(--p-primary-color);

  --fc-classic-event: transparent;
  --fc-classic-event-contrast: var(--p-text-color);
  --fc-classic-highlight: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  --fc-classic-today: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  --fc-classic-now: var(--p-primary-color);
  --fc-classic-small-dot-width: 8px;
  --fc-classic-large-dot-width: 10px;

  --fc-classic-background: var(--p-content-background);
  --fc-classic-faint: color-mix(in srgb, var(--p-text-color) 4%, transparent);
  --fc-classic-muted: color-mix(in srgb, var(--p-text-color) 8%, transparent);
  --fc-classic-strong: color-mix(in srgb, var(--p-text-color) 14%, transparent);

  --fc-classic-foreground: var(--p-text-color);
  --fc-classic-faint-foreground: var(--p-text-muted-color);
  --fc-classic-muted-foreground: var(--p-text-muted-color);

  --fc-classic-border: var(--p-content-border-color);
  --fc-classic-strong-border: var(--p-content-border-color);
}

/* Tâches d'un jour chargé, au-dessus de la grille */
.planning-popover {
  background-color: var(--p-surface-0);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}

.app-dark .planning-popover {
  background-color: var(--p-surface-900);
}

/* Un clic sur le numéro du jour crée une tâche : signalé au survol et au focus */
.planning-day-link:hover::after,
.planning-day-link:focus-visible::after {
  content: '+';
  margin-inline-start: 0.25rem;
  color: var(--p-primary-color);
}
</style>
