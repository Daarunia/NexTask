<template>
  <p v-if="showFilterEmpty" data-testid="filter-empty" class="filter-empty">{{ t('board.filterNoMatch') }}</p>

  <div
    class="flex h-4/5 pt-8 overflow-x-auto ml-4 before:content-[''] before:flex-1 after:content-[''] after:flex-1 pb-4 select-none"
    ref="scrollContainer"
    data-testid="board-scroll"
  >
    <draggable
      v-model="stagesLocal"
      itemKey="id"
      v-bind="DND_OPTIONS"
      class="flex gap-4"
      handle=".stage-handle"
      @start="setDragging(true)"
      @end="onStagesDrop"
    >
      <!-- Couleur de la colonne en liseré, en haut ou sur sa bande repliée. Pas de
           commentaire à la racine du slot : gardé en dev, vuedraggable y voit un
           second enfant (« Item slot must have only one child »). -->
      <template #item="{ element: stage }">
        <div
          data-testid="stage-column"
          :data-stage-id="stage.id"
          :data-collapsed="isCollapsed(stage.id)"
          :data-color="stage.color ?? undefined"
          :class="['stages-container', { collapsed: isCollapsed(stage.id), colored: !!stage.color }]"
          :style="stage.color ? { '--stage-color': getTagColorStyle(stage.color).swatch } : undefined"
        >
          <!-- Colonne repliée : bande étroite avec son nom et son compteur, un clic la
               déplie. Toute la bande sert de poignée pour déplacer la colonne. -->
          <button
            v-if="isCollapsed(stage.id)"
            type="button"
            data-testid="btn-stage-expand"
            class="stage-strip stage-handle"
            :aria-label="t('board.expandStage', { name: stage.name })"
            @click="setStageCollapsed(stage.id, false)"
          >
            <i class="pi pi-chevron-right" aria-hidden="true"></i>
            <span data-testid="stage-count" class="stage-count">{{ stageCount(stage.id) }}</span>
            <span data-testid="stage-strip-name" class="stage-strip-name">{{ stage.name }}</span>
          </button>

          <template v-else>
            <div class="flex items-center justify-between mb-3">
              <template v-if="editingStageId === stage.id">
                <input
                  :id="`stage-input-${stage.id}`"
                  data-testid="stage-edit-input"
                  v-model="editedStageName"
                  @keyup.enter="saveStageName(stage)"
                  @keyup.esc="cancelEditingStage"
                  @blur="saveStageName(stage)"
                  class="border rounded px-2 py-1 text-lg w-full"
                />
              </template>
              <div v-else class="flex items-center gap-2 min-w-0">
                <h2
                  data-testid="stage-title"
                  class="stage-handle cursor-grab text-lg"
                  @dblclick="startEditingStage(stage)"
                >
                  {{ stage.name }}
                </h2>
                <!-- Nombre de cartes affichées, sur le total de la colonne quand un filtre est actif -->
                <span data-testid="stage-count" class="stage-count">
                  {{ stageCount(stage.id) }}
                </span>
              </div>

              <!-- Menu -->
              <Button
                icon="pi pi-ellipsis-v"
                data-testid="btn-stage-menu"
                @click="(event) => toggleStageMenu(event, stage)"
                text
              />
            </div>

            <KanbanStageTaskList
              :tasks="visibleTaskLists.get(stage.id) ?? []"
              :filterActive="filterActive"
              @tasks-drop="onTasksDrop"
              @edit-task="openEditTaskDialog(stage.id, $event)"
              @archive-task="archiveTask"
              @remove-tag="removeTagFromTask"
              @check-item="checkChecklistItem"
              @card-menu="openCardMenu"
              @move-card="moveCardByKey"
              @create-task="openCreateTaskDialog(stage.id)"
            />
          </template>
        </div>
      </template>
    </draggable>

    <div class="btn-add-container">
      <Button v-if="!isAddingStage" class="btn-add-stage" data-testid="btn-add-stage" text @click="showAddStageInput">
        <i class="pi pi-plus absolute left-3"></i>
        <span>{{ t('board.addStage') }}</span>
      </Button>

      <div v-else class="flex gap-2 w-full">
        <input
          ref="newStageInput"
          v-model="newStageName"
          data-testid="stage-name-input"
          class="flex-1 p-2 rounded border"
          :placeholder="t('board.stageNamePlaceholder')"
          @keyup.enter="createStage"
          autofocus
        />

        <Button icon="pi pi-check" data-testid="btn-confirm-stage" @click="createStage" />
        <Button icon="pi pi-times" data-testid="btn-cancel-stage" severity="secondary" @click="cancelCreateStage" />
      </div>
    </div>
  </div>

  <!-- Menu contextuel partagé (une seule instance, cible = selectedStage), à sous-menus (couleur) -->
  <TieredMenu ref="stageMenu" :model="stageMenuItems" popup data-testid="stage-menu" />

  <!-- Menu contextuel des cartes, partagé de même -->
  <KanbanCardMenu
    ref="cardMenu"
    :boardId="boardId"
    :stages="stagesLocal"
    @open="openTask"
    @duplicate="duplicateTask"
    @toggle-tag="toggleTaskTag"
    @start-date="setStartDate"
    @move="moveTask"
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
    @task-saved="onTaskSaved"
    @archive-task="archiveTask"
    @duplicate-task="duplicateTask"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import draggable from 'vuedraggable'
import TieredMenu from 'primevue/tieredmenu'
import KanbanCardMenu from './KanbanCardMenu.vue'
import Button from 'primevue/button'
import KanbanStageTaskList from './KanbanStageTaskList.vue'
import KanbanTaskDialog from './KanbanTaskDialog.vue'
import { useTaskStore } from '../../stores/Task'
import { useStageStore } from '../../stores/Stage'
import { useBoardStore } from '../../stores/Board'
import { useTagStore } from '../../stores/Tag'
import { useSettingsStore } from '../../stores/Settings'
import { useBoardFilterStore } from '../../stores/BoardFilter'
import { Task } from '../../types/task.types'
import { Stage } from '../../types/stage.types'
import { Tag, TagSelection } from '../../types/tag.types'
import { getLogger } from '../../utils/logger'
import { useBoardLists } from '../../utils/boardLists.helper'
import { useActionToast, useErrorToast, useUndoToast } from '../../utils/toast.helper'
import { compareTagNames } from '../../utils/tag.helper'
import { checklistProgress, withItemChecked, withSavedItem } from '../../utils/checklist.helper'
import { sortByStartDate } from '../../utils/date.helper'
import type { TaskChecklist } from '../../types/checklist.types'
import { DND_OPTIONS } from '../../constants/dnd.constants'
import { setDragging } from '../../utils/dnd.helper'
import { useDangerConfirm } from '../../utils/confirm.helper'
import { isEditableTarget, isInOverlay } from '../../utils/keyboard.helper'
import { TAG_COLOR_STYLES, getTagColorStyle } from '../../constants/tag.constants'
import type { TagColor } from '../../../main/shared/tag.constants'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  boardId: number // tableau affiché, celui des colonnes créées
  stages: Stage[] // colonnes du tableau
  tasks: Task[] // tâches actives de ses colonnes
}>()

const logger = getLogger()
const taskStore = useTaskStore()
const stageStore = useStageStore()
const boardStore = useBoardStore()
const tagStore = useTagStore()
const settings = useSettingsStore()
const boardFilter = useBoardFilterStore()
const { t } = useI18n()
const showError = useErrorToast()
const showUndo = useUndoToast()
const showAction = useActionToast()
const confirmDanger = useDangerConfirm()

const newStageInput = ref<HTMLInputElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const showDialog = ref(false)
const positionDialog = ref(0)
const editTask = ref<Task | null>(null)
const creationMode = ref(true)
const board = useBoardLists()
const taskLists = board.lists // colonnes locales, seule source de vérité après le montage
const stageDialog = ref<number | null>(null)
const selectedStage = ref<Stage | null>(null)
const stagesLocal = ref<Stage[]>([])
const isAddingStage = ref(false)
const newStageName = ref('')
const stageMenu = ref()
const stageMenuTrigger = ref<HTMLElement | null>(null) // bouton ⋮ du menu ouvert, cible de la confirmation
const editingStageId = ref<number | null>(null) // stage en cours d'édition
const editedStageName = ref('') // nom temporaire pour l'édition
const defaultTagsDialog = ref<TagSelection[]>([]) // tags pré-remplis à la création
const cardMenu = ref<InstanceType<typeof KanbanCardMenu> | null>(null)

// Filtre actif (texte ou tags) : le DnD des tâches est alors désactivé
const filterActive = computed(() => boardFilter.isActive)

/**
 * Colonnes telles qu'affichées. taskLists reste la liste complète, seule source
 * des positions et du DnD. Sans filtre, c'est taskLists lui-même : chaque
 * colonne reçoit alors le tableau d'origine, que vuedraggable modifie sur place.
 * Avec un filtre, des copies filtrées (cf. store BoardFilter), jamais
 * modifiées puisque le DnD est désactivé.
 */
const visibleTaskLists = computed<Map<number, Task[]>>(() => {
  if (!filterActive.value) return taskLists

  const map = new Map<number, Task[]>()

  for (const [stageId, list] of taskLists) {
    map.set(
      stageId,
      list.filter((task) => boardFilter.matches(task)),
    )
  }

  return map
})

// Filtre actif sans aucune carte visible
const showFilterEmpty = computed(
  () => filterActive.value && [...visibleTaskLists.value.values()].every((list) => list.length === 0),
)

// Colonnes repliées, mémorisées dans les paramètres
const collapsedStageIds = computed(() => new Set(settings.collapsedStageIds))

/**
 * Vrai si la colonne est repliée en bande étroite.
 * @param stageId Id de la colonne
 */
function isCollapsed(stageId: number): boolean {
  return collapsedStageIds.value.has(stageId)
}

/**
 * Replie ou déplie une colonne et mémorise l'état. Les ids des colonnes
 * supprimées depuis sont oubliés au passage. Ceux des autres tableaux restent,
 * car le filtre porte sur les colonnes du store, tous tableaux confondus.
 * @param stageId Id de la colonne
 * @param collapsed Vrai pour la replier
 */
async function setStageCollapsed(stageId: number, collapsed: boolean) {
  const existing = new Set(stageStore.getAllStages.map((stage) => stage.id))
  const ids = settings.collapsedStageIds.filter((id) => id !== stageId && existing.has(id))
  if (collapsed) ids.push(stageId)

  try {
    await settings.set('collapsedStageIds', ids)
  } catch {
    showError(t('board.collapseNotSaved'))
  }
}

/**
 * Change la couleur d'une colonne, affichée tout de suite et rétablie si
 * l'enregistrement échoue.
 * @param stage Colonne
 * @param color Couleur de la palette, `null` pour la retirer
 */
async function setStageColor(stage: Stage, color: TagColor | null) {
  const previous = stage.color ?? null
  if (previous === color) return
  stage.color = color

  try {
    await stageStore.updateStageColor(stage.id, color)
  } catch {
    stage.color = previous
    showError(t('board.colorNotSaved'))
  }
}

/**
 * Compteur d'une colonne : cartes visibles, sur le total quand un filtre est actif.
 * @param stageId Id de la colonne
 */
function stageCount(stageId: number): string {
  const visible = visibleTaskLists.value.get(stageId)?.length ?? 0
  return filterActive.value ? `${visible}/${taskLists.get(stageId)?.length ?? 0}` : String(visible)
}

// Calculé pour suivre la langue de l'interface
const stageMenuItems = computed(() => [
  {
    label: t('board.collapseStage'),
    icon: 'pi pi-chevron-left',
    command: () => selectedStage.value && setStageCollapsed(selectedStage.value.id, true),
  },
  {
    label: t('board.stageColor'),
    icon: 'pi pi-palette',
    items: [
      {
        label: t('board.noColor'),
        icon: 'pi pi-ban',
        class: selectedStage.value?.color ? undefined : 'menu-option-current',
        command: () => selectedStage.value && setStageColor(selectedStage.value, null),
      },
      ...TAG_COLOR_STYLES.map((color) => ({
        label: t(`tagColors.${color.name}`),
        icon: 'pi pi-circle-fill',
        class: ['menu-swatch-option', { 'menu-option-current': selectedStage.value?.color === color.name }],
        style: { '--swatch': color.swatch },
        command: () => selectedStage.value && setStageColor(selectedStage.value, color.name),
      })),
    ],
  },
  {
    label: t('board.renameStage'),
    icon: 'pi pi-pencil',
    // Après la fermeture du menu, qui rendrait sinon le focus à son bouton
    command: () => setTimeout(() => selectedStage.value && startEditingStage(selectedStage.value)),
  },
  {
    label: t('board.sortByStartDate'),
    icon: 'pi pi-sort-amount-down-alt',
    command: () => setTimeout(sortSelectedStage),
    // Aucune date à trier
    disabled: !taskLists.get(selectedStage.value?.id ?? -1)?.some((task) => task.startDate),
  },
  {
    label: t('board.archiveStageTasks'),
    icon: 'pi pi-box',
    command: () => setTimeout(askArchiveStageTasks),
    // Colonne vide, rien à archiver
    disabled: !taskLists.get(selectedStage.value?.id ?? -1)?.length,
  },
  {
    label: t('common.delete'),
    icon: 'pi pi-trash',
    command: () => setTimeout(askDeleteStage),
    class: 'text-primary',
  },
])

stagesLocal.value = [...props.stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
board.build(stageIds(), props.tasks)

/** Ids des colonnes, dans l'ordre affiché. */
function stageIds(): number[] {
  return stagesLocal.value.map((stage) => stage.id)
}

/**
 * Ouverture de la boite de dialogue en mode création
 * @param stageId Id de la colonne parent
 */
function openCreateTaskDialog(stageId: number) {
  logger.debug('Ouverture création', { stageId })

  stageDialog.value = stageId
  // Position calculée sur la colonne complète, pas sur la vue filtrée : en
  // haut, les autres cartes sont décalées une fois la tâche créée
  positionDialog.value = settings.newTaskPosition === 'top' ? 0 : (taskLists.get(stageId)?.length ?? 0)
  defaultTagsDialog.value = filterTagSelection()
  editTask.value = null
  creationMode.value = true
  showDialog.value = true
}

/**
 * Tags du filtre en valeur de formulaire, triés par nom, pour qu'une tâche
 * créée sous filtre reste visible après enregistrement
 */
function filterTagSelection(): TagSelection[] {
  return boardFilter.tagIds
    .map((id) => tagStore.getTagById(id))
    .filter((tag): tag is Tag => tag !== undefined)
    .sort(compareTagNames)
    .map((tag) => ({ id: tag.id, name: tag.name }))
}

/**
 * Ouverture de la boite de dialogue en mode édition
 * @param stageId Id de la colonne parent
 */
function openEditTaskDialog(stageId: number, task: Task) {
  logger.debug('Ouverture édition', { stageId, task })

  // Pas de position à l'édition : l'enregistrement ne déplace pas la carte
  stageDialog.value = stageId
  editTask.value = task
  creationMode.value = false
  showDialog.value = true
}

/**
 * Listener quand une tâche est drop dans une colonne
 */
async function onTasksDrop() {
  if (await saveTaskOrder()) return

  restorePersistedTasks()
  showError(t('board.moveCanceled'))
}

/**
 * Enregistre l'ordre affiché des cartes : chaque tâche dont la colonne ou la
 * position diffère de l'état persisté est envoyée dans un seul batch.
 * @param stageIds Colonnes à enregistrer (toutes par défaut)
 * @returns Faux si l'enregistrement a échoué (rien n'a changé en base)
 */
async function saveTaskOrder(columns: number[] = stageIds()): Promise<boolean> {
  // Comparaison avec le dernier état persisté, porté par les cartes locales
  const changes = board.orderChanges(columns)
  if (!changes.length) return true

  // Seuls les champs du déplacement sont envoyés, car renvoyer la tâche entière ferait
  // échouer tout le batch si une ancienne tâche a un titre vide (refusé par l'API)
  const modifiedTasks = changes.map(({ task, position, stageId }) => ({ id: task.id, position, stageId }))
  logger.debug('Mise à jour DnD des tâches', modifiedTasks)

  try {
    await taskStore.updateTaskBatch(modifiedTasks)
  } catch {
    return false
  }

  // Sauvegarde réussie : les cartes locales reflètent désormais l'état persisté
  board.commitOrder(changes)
  return true
}

/**
 * Remet les cartes à leur dernière place enregistrée, après un DnD refusé.
 */
function restorePersistedTasks() {
  board.restorePersisted(stageIds())
}

/**
 * Drag stages
 */
async function onStagesDrop() {
  setDragging(false)

  // Comme pour les tâches, la position portée par chaque colonne est la
  // dernière persistée : elle n'est mise à jour qu'après la sauvegarde
  const changes = stagesLocal.value
    .map((stage, index) => ({ stage, position: index }))
    .filter(({ stage, position }) => stage.position !== position)

  if (!changes.length) return

  const modifiedStages = changes.map(({ stage, position }) => ({ id: stage.id, position }))
  logger.debug('Mise à jour DnD stages', modifiedStages)

  try {
    await stageStore.updateStageBatch(modifiedStages)
  } catch {
    stagesLocal.value = [...stagesLocal.value].sort((a, b) => a.position - b.position)
    showError(t('board.moveCanceled'))
    return
  }

  for (const { stage, position } of changes) {
    stage.position = position
  }
}

/**
 * Retire un tag d'une tâche directement depuis sa carte (croix au survol du chip)
 * @param task Tâche de la carte
 * @param tagId Tag à retirer
 */
async function removeTagFromTask(task: Task, tagId: number) {
  if (!(await changeTaskTags(task, (ids) => ids.filter((id) => id !== tagId)))) {
    showError(t('board.tagRemoveFailed'), t('board.tagRemoveFailedDetail'))
  }
}

/**
 * Pose ou retire un tag depuis le menu d'une carte.
 * @param task Tâche de la carte
 * @param tagId Tag basculé
 */
async function toggleTaskTag(task: Task, tagId: number) {
  const toggled = (ids: number[]) => (ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId])
  if (!(await changeTaskTags(task, toggled))) showError(t('board.tagsNotSaved'))
}

/**
 * Change les tags d'une carte sans ouvrir le dialogue, puis affiche ceux
 * enregistrés. Les tags sont envoyés par leur nom actuel, une fois les
 * renommages en cours terminés ; un tag supprimé entre-temps est ignoré.
 * @param task Tâche de la carte
 * @param change Nouveaux ids, à partir de ceux portés par la carte
 * @returns Faux si l'enregistrement a échoué
 */
async function changeTaskTags(task: Task, change: (tagIds: number[]) => number[]): Promise<boolean> {
  // Un renommage en vol changerait les noms à envoyer
  await tagStore.waitForPendingEdits()

  const location = board.find(task.id)
  if (!location) return true

  const oldTags = (location.list[location.index].tags ?? []).filter((tag) => !tagStore.wasDeleted(tag.id))
  const oldIds = oldTags.map((tag) => tag.id)
  const names = change(oldIds).flatMap((id) => {
    const name = tagStore.getTagById(id)?.name ?? oldTags.find((tag) => tag.id === id)?.name
    return name ? [name] : []
  })

  try {
    const updatedTask = await taskStore.updateTaskTags(task.id, names)

    // Seuls les tags de la copie locale changent : la carte a pu bouger pendant l'appel
    board.update(task.id, (current) => ({ ...current, tags: updatedTask.tags }))
    updateTagCounts(
      oldIds,
      (updatedTask.tags ?? []).map((tag) => tag.id),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Coche ou décoche un point de checklist depuis la carte. Le point change tout
 * de suite dans la copie locale, puis prend sa version enregistrée, ou revient
 * à son état d'avant si l'enregistrement échoue. Seul ce point est touché, une
 * autre coche en cours reste affichée. Le dernier point coché propose
 * d'archiver la tâche, dans un toast.
 * @param task Tâche de la carte
 * @param itemId Id du point
 * @param isChecked Nouvel état du point
 */
async function checkChecklistItem(task: Task, itemId: number, isChecked: boolean) {
  const location = board.find(task.id)
  const previous = location?.list[location.index].checklist
  const wasChecked = previous?.items.find((item) => item.id === itemId)?.isChecked
  if (!previous || wasChecked === undefined) return

  updateLocalChecklist(task.id, (checklist) => withItemChecked(checklist, itemId, isChecked))

  try {
    const updatedTask = await taskStore.setChecklistItemChecked(task.id, itemId, isChecked)
    const saved = updatedTask.checklist?.items.find((item) => item.id === itemId)
    if (saved) updateLocalChecklist(task.id, (checklist) => withSavedItem(checklist, saved))
    // Complétude lue en base, une seule proposition même si deux coches se croisent
    if (isChecked && isComplete(updatedTask.checklist) && !isComplete(previous)) offerArchive(task)
  } catch {
    updateLocalChecklist(task.id, (checklist) => withItemChecked(checklist, itemId, wasChecked))
    showError(t('checklist.checkFailed'))
  }
}

/**
 * Vrai si la checklist a des points et qu'ils sont tous cochés.
 * @param checklist Checklist de la tâche
 */
function isComplete(checklist: Task['checklist']): boolean {
  const { done, total } = checklistProgress(checklist?.items)
  return total > 0 && done === total
}

/**
 * Checklist terminée depuis la carte, toast qui propose d'archiver la tâche.
 * Le bouton disparaît si la carte a quitté le tableau entre-temps.
 * @param task Tâche de la carte
 */
function offerArchive(task: Task) {
  showAction(t('checklist.allDone'), task.title, {
    label: t('common.archive'),
    run: () => archiveTask(task),
    available: () => board.find(task.id) !== null,
  })
}

/**
 * Modifie la checklist d'une carte dans sa colonne locale, retrouvée par id
 * (la carte a pu bouger pendant un appel). Rien ne change si la carte a quitté
 * le tableau ou n'a plus de checklist.
 * @param taskId Id de la tâche
 * @param update Nouvelle checklist, à partir de celle affichée
 */
function updateLocalChecklist(taskId: number, update: (checklist: TaskChecklist) => TaskChecklist) {
  board.update(taskId, (task) => (task.checklist ? { ...task, checklist: update(task.checklist) } : task))
}

/**
 * Ouvre le menu contextuel d'une carte, à la place du clic droit (ou sous le
 * titre, ouvert au clavier).
 * @param event Clic droit, ou touche Menu sur le titre
 * @param task Tâche de la carte
 */
function openCardMenu(event: MouseEvent, task: Task) {
  const location = board.find(task.id)
  if (!location) return
  cardMenu.value?.show(event, location.list[location.index], {
    stageId: location.stageId,
    index: location.index,
    count: location.list.length,
  })
}

/**
 * Déplace une carte, depuis son menu ou au clavier, dans une colonne (la sienne
 * ou une autre), puis enregistre l'ordre des colonnes touchées. La carte est
 * retrouvée par id dans les colonnes complètes : le déplacement marche aussi
 * sous filtre, où le glisser-déposer est désactivé.
 * @param taskId Id de la tâche
 * @param stageId Colonne d'arrivée
 * @param place Haut ou bas de la colonne, ou index dans la colonne d'arrivée
 * @param keepFocus Vrai pour rendre le focus au titre de la carte déplacée
 */
async function moveTask(taskId: number, stageId: number, place: 'top' | 'bottom' | number, keepFocus = false) {
  if (!taskLists.has(stageId)) return
  const from = board.remove(taskId)
  if (!from) return

  const task = from.list[from.index]
  const list = [...(taskLists.get(stageId) ?? [])]
  list.splice(placeIndex(place, list.length), 0, task)
  taskLists.set(stageId, list)

  // La carte est recréée dans sa nouvelle place, le focus est à lui rendre
  if (keepFocus) {
    nextTick(() =>
      document.querySelector<HTMLElement>(`[data-testid="task-card-open"][data-task-id="${taskId}"]`)?.focus(),
    )
  }

  if (!(await saveTaskOrder([...new Set([from.stageId, stageId])]))) {
    restorePersistedTasks()
    showError(t('board.moveCanceled'))
  }
}

/**
 * Envoie une carte vers un autre tableau depuis son menu, en bas de la
 * première colonne de ce tableau. La colonne est choisie dans le cache, le
 * serveur reste juge (colonne supprimée entre-temps). La carte quitte le
 * tableau affiché une fois le déplacement enregistré, le cache des tâches
 * suit par le store.
 * @param taskId Id de la tâche
 * @param boardId Tableau d'arrivée
 */
async function moveTaskToBoard(taskId: number, boardId: number) {
  const stage = stageStore.getStagesOfBoard(boardId)[0]
  if (!stage || !board.find(taskId)) return

  try {
    await taskStore.moveTaskToStage(taskId, stage.id)
  } catch {
    showError(t('boards.send.failed'))
    return
  }

  board.remove(taskId)
  logger.debug('Tâche envoyée vers un autre tableau', { taskId, boardId, stageId: stage.id })
}

/**
 * Change la date de début d'une carte depuis son menu, puis l'affiche telle
 * qu'enregistrée.
 * @param task Tâche de la carte
 * @param startDate Nouvelle date, `null` pour la retirer
 */
async function setStartDate(task: Task, startDate: Date | null) {
  try {
    const updated = await taskStore.setTaskStartDate(task.id, startDate)
    board.update(task.id, (current) => ({ ...current, startDate: updated.startDate, notifiedAt: updated.notifiedAt }))
  } catch {
    showError(t('board.dateFailed'))
  }
}

/**
 * Index d'arrivée d'une carte déplacée dans une colonne.
 * @param place Haut ou bas de la colonne, ou index voulu
 * @param length Nombre de cartes de la colonne, sans elle
 */
function placeIndex(place: 'top' | 'bottom' | number, length: number): number {
  if (place === 'top') return 0
  if (place === 'bottom') return length
  return Math.min(place, length)
}

/**
 * Alt+flèche sur le titre d'une carte : la carte monte ou descend d'un cran
 * dans sa colonne (pas sous filtre, où l'ordre affiché est incomplet), ou passe
 * dans la colonne dépliée voisine, à la même hauteur (en bas sous filtre).
 * @param task Tâche de la carte
 * @param direction Sens du déplacement
 */
function moveCardByKey(task: Task, direction: 'up' | 'down' | 'left' | 'right') {
  const from = board.find(task.id)
  if (!from) return

  if (direction === 'up' || direction === 'down') {
    const index = from.index + (direction === 'up' ? -1 : 1)
    if (filterActive.value || index < 0 || index >= from.list.length) return
    moveTask(task.id, from.stageId, index, true)
    return
  }

  const columns = stageIds().filter((id) => !isCollapsed(id))
  const stageId = columns[columns.indexOf(from.stageId) + (direction === 'left' ? -1 : 1)]
  if (stageId === undefined) return
  moveTask(task.id, stageId, filterActive.value ? 'bottom' : from.index, true)
}

/**
 * Archivage d'une carte depuis son menu : direct, ou après confirmation dans
 * une bulle ancrée sur la carte si le paramètre est activé (comme la corbeille).
 * @param task Tâche de la carte
 * @param card Carte affichée, ancre de la bulle
 */
function askArchiveTask(task: Task, card: HTMLElement | null) {
  if (!settings.confirmArchive) {
    archiveTask(task)
    return
  }

  confirmDanger({
    target: card ?? undefined,
    message: t('board.archiveConfirm'),
    acceptLabel: t('common.archive'),
    accept: () => archiveTask(task),
  })
}

/**
 * Duplique une tâche juste sous sa carte, puis propose d'ouvrir la copie pour
 * la retoucher (titre suffixé, à renommer le plus souvent).
 * @param task Tâche dupliquée
 */
async function duplicateTask(task: Task) {
  let copy: Task
  try {
    copy = await taskStore.duplicateTask(task.id, t('board.copyTitle', { title: task.title }))
  } catch {
    showError(t('board.duplicateFailed'))
    return
  }

  board.insert(copy)
  showAction(t('board.taskDuplicated'), copy.title, {
    label: t('board.openCopy'),
    run: () => openTask(copy.id),
    available: () => board.find(copy.id) !== null,
  })
}

/**
 * Ouvre une carte du tableau en édition, retrouvée par id. Ignorée si elle a
 * quitté le tableau, ou si le dialogue est déjà ouvert (la saisie en cours
 * n'est pas remplacée).
 * @param taskId Id de la tâche
 */
function openTask(taskId: number) {
  const location = board.find(taskId)
  if (!location || showDialog.value) return
  openEditTaskDialog(location.stageId, location.list[location.index])
}

/**
 * Archivage d'une carte, annulable depuis le toast
 * @param task Tâche de la carte
 */
async function archiveTask(task: Task) {
  try {
    await taskStore.archiveTask(task.id)
  } catch {
    showError(t('board.archiveFailed'), t('board.archiveFailedDetail'))
    return
  }

  // Carte retirée de sa colonne locale, retrouvée par id
  const location = board.remove(task.id)

  logger.debug('Tâche archivée', task)

  // Place de la carte (position persistée), reprise si l'archivage est annulé
  const place = location ? { stageId: location.stageId, position: location.list[location.index].position } : undefined
  showUndo(t('board.taskArchived'), { detail: task.title, undo: () => undoArchive(task.id, place) })
}

/**
 * Annule un archivage : la tâche reprend sa place au tableau (ou va en bas
 * de la première colonne si la sienne a été supprimée entre-temps). Une
 * occurrence née de cet archivage (série « après archivage ») et retirée par
 * le serveur quitte le tableau, ses tags perdent une tâche.
 * @param taskId Id de la tâche archivée
 * @param place Colonne et position de la carte avant l'archivage
 */
async function undoArchive(taskId: number, place?: { stageId: number; position: number }) {
  try {
    const { task: restored, removed } = await taskStore.restoreTask(taskId, place)
    board.insert(restored)
    if (removed) {
      board.remove(removed.id)
      updateTagCounts(
        (removed.tags ?? []).map((tag) => tag.id),
        [],
      )
    }
    logger.debug('Archivage annulé', restored)
  } catch {
    showError(t('board.undoFailed'), t('board.undoArchiveFailedDetail'))
  }
}

/**
 * Save depuis dialog
 */
async function onTaskSaved(task: Task) {
  const newTagIds = (task.tags ?? []).map((tag) => tag.id)

  if (creationMode.value) {
    // Nouvelle carte : insérée à sa position (fin de colonne ou tout en haut,
    // selon le paramètre), sur la colonne complète même sous filtre
    const list = [...(taskLists.get(task.stageId) ?? [])]
    const index = Math.min(task.position, list.length)
    list.splice(index, 0, { ...task })
    taskLists.set(task.stageId, list)
    updateTagCounts([], newTagIds)

    // Insérée avant d'autres cartes : celles-ci sont renumérotées en base
    if (index < list.length - 1 && !(await saveTaskOrder([task.stageId]))) {
      showError(t('board.orderNotSaved'), t('board.orderNotSavedDetail'))
    }
    return
  }

  // Édition : remplacement sur place, dans la colonne où la carte est affichée.
  // Pas de tri par position : celles des autres cartes peuvent être obsolètes
  // tant que la sauvegarde d'un DnD n'a pas abouti.
  const location = board.find(task.id)
  if (!location) return

  const oldTagIds = (location.list[location.index].tags ?? []).map((tag) => tag.id)
  board.update(task.id, () => task)
  updateTagCounts(oldTagIds, newTagIds)
}

/**
 * Nombre de tâches des tags, mis à jour localement après l'enregistrement d'une
 * tâche (les tags eux-mêmes sont déjà dans le cache : créés via POST /tags)
 * @param oldTagIds Tags de la tâche avant l'enregistrement
 * @param newTagIds Tags de la tâche enregistrée
 */
function updateTagCounts(oldTagIds: number[], newTagIds: number[]) {
  const added = newTagIds.filter((id) => !oldTagIds.includes(id))
  const removed = oldTagIds.filter((id) => !newTagIds.includes(id))
  tagStore.adjustTaskCounts(added, removed)
}

/**
 * Création de la colonne
 */
async function createStage() {
  // Nom nettoyé comme le titre des tâches (schéma zod de KanbanTaskDialog)
  const name = newStageName.value.trim()
  if (!name) return

  let newStage: Stage

  try {
    newStage = await stageStore.saveStage(name, stagesLocal.value.length, props.boardId)
  } catch {
    // La saisie est conservée pour pouvoir réessayer
    showError(t('board.stageCreateFailed'), t('board.stageCreateFailedDetail'))
    return
  }

  stagesLocal.value.push(newStage)
  taskLists.set(newStage.id, [])
  newStageName.value = ''
  isAddingStage.value = false
}

function cancelCreateStage() {
  newStageName.value = ''
  isAddingStage.value = false
}

function showAddStageInput() {
  isAddingStage.value = true

  // Focus sur l'input
  nextTick(() => {
    newStageInput.value?.focus()
  })
}

/**
 * Choix de « Supprimer » dans le menu d'une colonne. Une colonne qui contient
 * des tâches (filtrées comprises) n'est supprimée qu'après confirmation, dans
 * une bulle ancrée sur son bouton de menu, puisque ses tâches seront archivées.
 */
function askDeleteStage() {
  const stage = selectedStage.value
  if (!stage) return

  const count = taskLists.get(stage.id)?.length ?? 0
  if (count === 0) {
    deleteStage(stage)
    return
  }

  confirmDanger({
    target: stageMenuTrigger.value ?? undefined,
    message: t('board.stageDeleteConfirm', { name: stage.name, count }, count),
    acceptLabel: t('common.delete'),
    accept: () => deleteStage(stage),
  })
}

/**
 * Trie les cartes de la colonne du menu par date de début, la plus proche en
 * haut, et enregistre ce nouvel ordre. Le toast permet de revenir à l'ordre
 * d'avant.
 */
async function sortSelectedStage() {
  const stage = selectedStage.value
  const list = stage ? taskLists.get(stage.id) : undefined
  if (!stage || !list) return

  const sorted = sortByStartDate(list)
  if (sorted.every((task, index) => task === list[index])) return

  const previousOrder = list.map((task) => task.id)
  taskLists.set(stage.id, sorted)
  if (!(await saveTaskOrder([stage.id]))) {
    restorePersistedTasks()
    showError(t('board.sortFailed'))
    return
  }

  showUndo(t('board.stageSorted'), { detail: stage.name, undo: () => restoreStageOrder(stage.id, previousOrder) })
}

/**
 * Remet une colonne dans un ordre enregistré (annulation d'un tri). Les cartes
 * arrivées depuis restent en bas, celles qui l'ont quittée sont ignorées.
 * @param stageId Id de la colonne
 * @param order Ids des tâches, dans l'ordre voulu
 */
async function restoreStageOrder(stageId: number, order: number[]) {
  const list = taskLists.get(stageId) ?? []
  const byId = new Map(list.map((task) => [task.id, task]))
  const kept = order.flatMap((id) => byId.get(id) ?? [])
  taskLists.set(stageId, [...kept, ...list.filter((task) => !order.includes(task.id))])

  if (!(await saveTaskOrder([stageId]))) {
    restorePersistedTasks()
    showError(t('board.undoFailed'))
  }
}

/**
 * Archivage de toutes les tâches de la colonne du menu, filtrées comprises,
 * après confirmation dans une bulle ancrée sur son bouton de menu.
 */
function askArchiveStageTasks() {
  const stage = selectedStage.value
  const count = stage ? (taskLists.get(stage.id)?.length ?? 0) : 0
  if (!stage || count === 0) return

  confirmDanger({
    target: stageMenuTrigger.value ?? undefined,
    message: t('board.archiveStageTasksConfirm', { name: stage.name, count }, count),
    acceptLabel: t('common.archive'),
    accept: () => archiveStageTasks(stage),
  })
}

/**
 * Archive toutes les tâches d'une colonne en une requête, annulable depuis le
 * toast. L'annulation remet chaque carte à sa place, dans l'ordre de la colonne.
 * @param stage Colonne vidée
 */
async function archiveStageTasks(stage: Stage) {
  const tasks = taskLists.get(stage.id) ?? []
  if (!tasks.length) return

  // Places enregistrées, reprises dans l'ordre si l'archivage est annulé
  const places = tasks
    .map((task) => ({ id: task.id, place: { stageId: stage.id, position: task.position } }))
    .sort((a, b) => a.place.position - b.place.position)

  try {
    await taskStore.archiveTasks(tasks.map((task) => task.id))
  } catch {
    showError(t('board.archiveFailed'), t('board.archiveStageTasksFailedDetail'))
    return
  }

  const archivedIds = new Set(places.map(({ id }) => id))
  taskLists.set(
    stage.id,
    (taskLists.get(stage.id) ?? []).filter((task) => !archivedIds.has(task.id)),
  )
  logger.debug('Tâches de la colonne archivées', { stageId: stage.id, count: places.length })

  showUndo(t('board.stageTasksArchived', { count: places.length }, places.length), {
    detail: stage.name,
    undo: async () => {
      for (const { id, place } of places) await undoArchive(id, place)
    },
  })
}

/**
 * Supprime une colonne, ses tâches étant archivées par le serveur
 * @param stage Colonne à supprimer
 */
async function deleteStage(stage: Stage) {
  const stageId = stage.id

  try {
    await stageStore.deleteStage(stageId)

    stagesLocal.value = stagesLocal.value.filter((s) => s.id !== stageId)
    if (isCollapsed(stageId)) setStageCollapsed(stageId, false)

    taskLists.delete(stageId)

    logger.debug('Colonne supprimée : ', stageId)
  } catch (error) {
    logger.error('Erreur lors de la suppression de la colonne', {
      stageId,
      error,
    })
    showError(t('board.stageDeleteFailed'), t('board.stageDeleteFailedDetail'))
  }
}

function startEditingStage(stage: Stage) {
  editingStageId.value = stage.id
  editedStageName.value = stage.name
  nextTick(() => {
    const input = document.getElementById(`stage-input-${stage.id}`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function saveStageName(stage: Stage) {
  // Le retrait de l'input (après Échap ou Entrée) peut déclencher un blur :
  // on ignore cet appel si l'édition est déjà terminée ou annulée.
  if (editingStageId.value !== stage.id) return

  const name = editedStageName.value.trim()
  if (!name) return

  const previousName = stage.name
  stage.name = name
  editingStageId.value = null

  try {
    await stageStore.updateStage(stage.id, stage.name)
  } catch {
    stage.name = previousName
    showError(t('board.renameCanceled'))
  }
}

function cancelEditingStage() {
  editingStageId.value = null
}

// Affichage du menu des stages
const toggleStageMenu = (event: Event, stage: Stage) => {
  selectedStage.value = stage
  stageMenuTrigger.value = event.currentTarget as HTMLElement
  stageMenu.value.toggle(event)
}

/**
 * Raccourci N : nouvelle tâche dans la colonne de l'élément qui a le focus (une
 * carte, un bouton de la colonne), sinon dans la première colonne dépliée.
 * Ignoré pendant une saisie, dans un menu ou un dialogue ouvert.
 * @param event Touche pressée
 */
function onBoardKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
  if (event.defaultPrevented || showDialog.value || isEditableTarget(event.target) || isInOverlay(event.target)) return

  const focused = document.activeElement?.closest<HTMLElement>('[data-stage-id]')?.dataset.stageId
  const stageId = focused ? Number(focused) : stagesLocal.value.find((stage) => !isCollapsed(stage.id))?.id
  if (stageId === undefined || isCollapsed(stageId)) return

  event.preventDefault()
  openCreateTaskDialog(stageId)
}

onMounted(() => globalThis.addEventListener('keydown', onBoardKeydown))
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onBoardKeydown))

// Tâches créées depuis la fenêtre d'ajout rapide, insérées sans recharger le tableau
const stopQuickAddListener = globalThis.quickAdd.onTaskCreated(board.insert)
onBeforeUnmount(stopQuickAddListener)

// Occurrences des tâches récurrentes créées par le main, insérées de même
const stopRecurrenceListener = globalThis.recurrence.onTasksCreated((tasks) => tasks.forEach(board.insert))
onBeforeUnmount(stopRecurrenceListener)

/**
 * Ouvre en édition la tâche demandée par un clic sur sa notification ou sur un
 * résultat de la recherche. Ignorée si elle a quitté le tableau entre-temps, ou
 * si le dialogue est déjà ouvert (la saisie en cours n'est pas remplacée).
 *
 * Une tâche d'un autre tableau est laissée sans consommer la demande. C'est le
 * cas quand `showTask` change de tableau, ce Kanban voit la demande avant
 * d'être démonté et celui du tableau de la tâche la traite à son montage.
 */
function openRequestedTask() {
  const taskId = taskStore.taskToOpen
  if (taskId === null) return
  if (!board.find(taskId) && isOnOtherBoard(taskId)) return
  taskStore.taskToOpen = null

  openTask(taskId)
}

/**
 * Vrai si la tâche est active dans le cache, sur un autre tableau que celui affiché.
 * @param taskId Id de la tâche
 */
function isOnOtherBoard(taskId: number): boolean {
  const boardId = taskStore.getAllTasks.find((task) => task.id === taskId)?.boardId
  return boardId !== null && boardId !== undefined && boardId !== props.boardId
}

// Demande reçue tableau affiché, ou avant (autre page) : traitée une fois le
// dialogue monté, qui ne lit ses valeurs qu'à un changement d'ouverture
watch(() => taskStore.taskToOpen, openRequestedTask)
onMounted(openRequestedTask)

onMounted(() => {
  if (!scrollContainer.value) return
  const el = scrollContainer.value

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return

    // Molette sur une colonne dont les cartes débordent : défilement vertical natif de la liste
    const list = (event.target as HTMLElement).closest('.task-list-scroll')
    if (list && list.scrollHeight > list.clientHeight) return

    el.scrollLeft += event.deltaY
    event.preventDefault()
  }

  el.addEventListener('wheel', onWheel, { passive: false })

  onBeforeUnmount(() => {
    el.removeEventListener('wheel', onWheel)
  })
})
</script>

<style scoped>
@reference "tailwindcss";

.stages-container {
  @apply flex flex-col min-w-[300px] max-w-[400px] overflow-x-auto rounded-lg p-4;
  background-color: var(--p-surface-200);
}

/* Colonne colorée : liseré en haut, à la couleur choisie */
.stages-container.colored {
  box-shadow: inset 0 4px 0 var(--stage-color);
}

.btn-add-container {
  @apply flex flex-col items-center justify-center min-w-[300px] overflow-x-auto rounded-lg ml-4 h-16 p-2;
  background-color: var(--p-surface-200);
}

.app-dark .btn-add-container {
  background-color: var(--p-surface-900);
}

.btn-add-stage {
  @apply flex items-center justify-center w-full;
  background-color: var(--p-surface-200);
}

.app-dark .btn-add-stage {
  background-color: var(--p-surface-900);
}

.app-dark .stages-container {
  background-color: var(--p-surface-900);
}

/* Emplacement de dépôt d'une colonne : cadre en pointillés teinté, contenu masqué */
.stages-container.dnd-ghost {
  background-color: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  outline: 2px dashed var(--p-primary-color);
  outline-offset: -2px;
}

.stages-container.dnd-ghost > * {
  visibility: hidden;
}

/* Colonne tenue : légèrement inclinée et soulevée */
.stages-container.dnd-dragging {
  rotate: 1deg;
  box-shadow: 0 16px 32px rgb(0 0 0 / 0.25);
}

.filter-empty {
  @apply text-center pt-6;
  color: var(--p-text-muted-color);
}

.stage-handle {
  user-select: none;
}

/* Colonne repliée : bande étroite, à la hauteur des autres colonnes */
.stages-container.collapsed {
  @apply w-12 min-w-0 px-1 py-3;
}

.stage-strip {
  @apply flex h-full w-full cursor-pointer flex-col items-center gap-3 rounded-md py-1;
  background: none;
  border: none;
  color: inherit;
}

.stage-strip:hover {
  background-color: var(--p-surface-300);
}

.app-dark .stage-strip:hover {
  background-color: var(--p-surface-800);
}

.stage-strip:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

/* Nom écrit de haut en bas, coupé s'il dépasse la hauteur de la colonne */
.stage-strip-name {
  @apply min-h-0 overflow-hidden text-lg text-ellipsis whitespace-nowrap;
  writing-mode: vertical-rl;
}

/* Seule touche de la couleur d'accent sur le tableau */
.stage-count {
  @apply rounded-full px-2 text-xs;
  background-color: var(--p-primary-100);
  color: var(--p-primary-700);
}

.app-dark .stage-count {
  background-color: color-mix(in srgb, var(--p-primary-400) 18%, transparent);
  color: var(--p-primary-400);
}
</style>
