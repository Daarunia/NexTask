<template>
  <p v-if="showFilterEmpty" data-testid="filter-empty" class="filter-empty">Aucune tâche ne correspond au filtre</p>

  <div
    class="flex h-4/5 pt-8 overflow-x-auto ml-4 before:content-[''] before:flex-1 after:content-[''] after:flex-1 pb-4 select-none"
    ref="scrollContainer"
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
      <template #item="{ element: stage }">
        <div data-testid="stage-column" class="stages-container">
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
              <!-- Nombre de cartes affichées (filtre compris) -->
              <span data-testid="stage-count" class="stage-count">
                {{ visibleTaskLists.get(stage.id)?.length ?? 0 }}
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

          <StageTaskList
            :tasks="visibleTaskLists.get(stage.id) ?? []"
            :filterActive="filterActive"
            @tasks-drop="onTasksDrop"
            @edit-task="openEditTaskDialog(stage.id, $event)"
            @archive-task="archiveTask"
            @remove-tag="removeTagFromTask"
            @create-task="openCreateTaskDialog(stage.id)"
          />
        </div>
      </template>
    </draggable>

    <div class="btn-add-container">
      <Button v-if="!isAddingStage" class="btn-add-stage" data-testid="btn-add-stage" text @click="showAddStageInput">
        <i class="pi pi-plus absolute left-3"></i>
        <span>Ajouter une liste</span>
      </Button>

      <div v-else class="flex gap-2 w-full">
        <input
          ref="newStageInput"
          v-model="newStageName"
          data-testid="stage-name-input"
          class="flex-1 p-2 rounded border"
          placeholder="Nom de la liste"
          @keyup.enter="createStage"
          autofocus
        />

        <Button icon="pi pi-check" data-testid="btn-confirm-stage" @click="createStage" />
        <Button icon="pi pi-times" data-testid="btn-cancel-stage" severity="secondary" @click="cancelCreateStage" />
      </div>
    </div>
  </div>

  <!-- Menu contextuel partagé (une seule instance, cible = selectedStage) -->
  <Menu ref="stageMenu" :model="stageMenuItems" popup />

  <TaskDialog
    v-model="showDialog"
    :stageId="stageDialog ?? 0"
    :editTask="editTask"
    :position="positionDialog"
    :creationMode="creationMode"
    :defaultTags="defaultTagsDialog"
    @task-saved="onTaskSaved"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, reactive } from 'vue'
import draggable from 'vuedraggable'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import StageTaskList from './StageTaskList.vue'
import TaskDialog from './TaskDialog.vue'
import { useTaskStore } from '../stores/Task'
import { useStageStore } from '../stores/Stage'
import { useTagStore } from '../stores/Tag'
import { useSettingsStore } from '../stores/Settings'
import { Task } from '../types/task.types'
import { Stage } from '../types/stage.types'
import { Tag, TagSelection } from '../types/tag.types'
import { getLogger } from '../utils/logger'
import { setAll } from '../utils/map.helper'
import { useErrorToast, useUndoToast } from '../utils/toast.helper'
import { compareTagNames } from '../utils/tag.helper'
import { DND_OPTIONS } from '../constants/dnd.constants'
import { setDragging } from '../utils/dnd.helper'

const props = withDefaults(
  defineProps<{
    stages: Stage[]
    tasks: Task[]
    // Ids des tags du filtre (OU logique), vide = tout est visible
    filterTagIds?: number[]
  }>(),
  { filterTagIds: () => [] },
)

const logger = getLogger()
const taskStore = useTaskStore()
const stageStore = useStageStore()
const tagStore = useTagStore()
const settings = useSettingsStore()
const showError = useErrorToast()
const showUndo = useUndoToast()
const confirm = useConfirm()

const newStageInput = ref<HTMLInputElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const showDialog = ref(false)
const positionDialog = ref(0)
const editTask = ref<Task | null>(null)
const creationMode = ref(true)
const taskLists = reactive(new Map<number, Task[]>())
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

// Filtre par tag actif : le DnD des tâches est alors désactivé
const filterActive = computed(() => props.filterTagIds.length > 0)

/**
 * Colonnes telles qu'affichées. taskLists reste la liste complète, seule source
 * des positions et du DnD. Sans filtre, c'est taskLists lui-même : chaque
 * colonne reçoit alors le tableau d'origine, que vuedraggable modifie sur place.
 * Avec un filtre, des copies filtrées (OU logique), jamais modifiées
 * puisque le DnD est désactivé.
 */
const visibleTaskLists = computed<Map<number, Task[]>>(() => {
  if (!filterActive.value) return taskLists

  const selected = new Set(props.filterTagIds)
  const map = new Map<number, Task[]>()

  for (const [stageId, list] of taskLists) {
    map.set(
      stageId,
      list.filter((task) => task.tags?.some((tag) => selected.has(tag.id))),
    )
  }

  return map
})

// Filtre actif sans aucune carte visible
const showFilterEmpty = computed(
  () => filterActive.value && [...visibleTaskLists.value.values()].every((list) => list.length === 0),
)

const stageMenuItems = [
  {
    label: 'Supprimer',
    icon: 'pi pi-trash',
    command: () => setTimeout(askDeleteStage),
    class: 'text-primary',
  },
]

function buildTaskLists() {
  const map = new Map<number, Task[]>()

  for (const stage of stagesLocal.value) {
    map.set(
      stage.id,
      props.tasks
        .filter((t) => t.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...t })),
    )
  }

  setAll(taskLists, map)
}

function buildStages() {
  stagesLocal.value = [...props.stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

buildStages()
buildTaskLists()

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
  return props.filterTagIds
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

  // Position = index actuel de la carte dans sa colonne : task.position peut
  // être obsolète juste après un DnD (sauvegarde batch en cours ou échouée)
  const index = taskLists.get(stageId)?.findIndex((t) => t.id === task.id) ?? -1

  stageDialog.value = stageId
  positionDialog.value = index === -1 ? task.position : index
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
  showError('Déplacement annulé')
}

/**
 * Enregistre l'ordre affiché des cartes : chaque tâche dont la colonne ou la
 * position diffère de l'état persisté est envoyée dans un seul batch.
 * @param stageIds Colonnes à enregistrer (toutes par défaut)
 * @returns Faux si l'enregistrement a échoué (rien n'a changé en base)
 */
async function saveTaskOrder(stageIds: number[] = stagesLocal.value.map((stage) => stage.id)): Promise<boolean> {
  // Comparaison avec le dernier état persisté, porté par les tâches de taskLists
  // (et non avec props.tasks, instantané figé au montage)
  const changes: { task: Task; position: number; stageId: number }[] = []

  for (const stageId of stageIds) {
    const currentTasks = taskLists.get(stageId) ?? []

    currentTasks.forEach((task, index) => {
      if (task.position !== index || task.stageId !== stageId) {
        changes.push({ task, position: index, stageId })
      }
    })
  }

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

  // Sauvegarde réussie : les tâches locales reflètent désormais l'état persisté
  for (const { task, position, stageId } of changes) {
    task.position = position
    task.stageId = stageId
  }
  return true
}

/**
 * Remet les cartes à leur dernière place enregistrée, après un DnD refusé.
 * Chaque tâche porte encore sa colonne et sa position persistées, qui ne sont
 * mises à jour qu'une fois la sauvegarde réussie.
 */
function restorePersistedTasks() {
  const tasks = [...taskLists.values()].flat()
  const map = new Map<number, Task[]>()

  for (const stage of stagesLocal.value) {
    map.set(
      stage.id,
      tasks.filter((t) => t.stageId === stage.id).sort((a, b) => a.position - b.position),
    )
  }

  setAll(taskLists, map)
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
    showError('Déplacement annulé')
    return
  }

  for (const { stage, position } of changes) {
    stage.position = position
  }
}

/**
 * Archivage
 */
/**
 * Retire un tag d'une tâche directement depuis sa carte (croix au survol du chip)
 * @param task Tâche de la carte
 * @param tagId Tag à retirer
 */
async function removeTagFromTask(task: Task, tagId: number) {
  // Un renommage en vol changerait les noms à envoyer
  await tagStore.waitForPendingEdits()

  const location = findTaskLocation(task.id)
  if (!location) return

  const oldTags = (location.list[location.index].tags ?? []).filter((tag) => !tagStore.wasDeleted(tag.id))
  const keptNames = oldTags
    .filter((tag) => tag.id !== tagId)
    .map((tag) => tagStore.getTagById(tag.id)?.name ?? tag.name)

  try {
    const updatedTask = await taskStore.updateTaskTags(task.id, keptNames)

    // Seuls les tags de la copie locale changent : la carte a pu bouger pendant l'appel
    const current = findTaskLocation(task.id)
    if (current) {
      const list = [...current.list]
      list[current.index] = { ...list[current.index], tags: updatedTask.tags }
      taskLists.set(current.stageId, list)
    }

    updateTagCounts(
      oldTags.map((tag) => tag.id),
      (updatedTask.tags ?? []).map((tag) => tag.id),
    )
  } catch {
    showError('Retrait impossible', "Le tag n'a pas été retiré de la tâche.")
  }
}

async function archiveTask(task: Task) {
  try {
    await taskStore.archiveTask(task.id)
  } catch {
    showError('Archivage impossible', "La tâche n'a pas été archivée.")
    return
  }

  // On retire la carte de sa colonne locale (taskLists est la source de
  // vérité après le montage — ne PAS reconstruire depuis props.tasks, qui est
  // un instantané figé et réafficherait la tâche archivée).
  // La colonne est retrouvée par id : task.stageId peut être obsolète après un DnD.
  const location = findTaskLocation(task.id)
  if (location) {
    taskLists.set(
      location.stageId,
      location.list.filter((t) => t.id !== task.id),
    )
  }

  logger.debug('Tâche archivée', task)

  // Place de la carte (position persistée), reprise si l'archivage est annulé
  const place = location ? { stageId: location.stageId, position: location.list[location.index].position } : undefined
  showUndo('Tâche archivée', { detail: task.title, undo: () => undoArchive(task.id, place) })
}

/**
 * Annule un archivage : la tâche reprend sa place au tableau (ou va en bas
 * de la première colonne si la sienne a été supprimée entre-temps)
 * @param taskId Id de la tâche archivée
 * @param place Colonne et position de la carte avant l'archivage
 */
async function undoArchive(taskId: number, place?: { stageId: number; position: number }) {
  try {
    const restored = await taskStore.restoreTask(taskId, place)
    insertTaskLocally(restored)
    logger.debug('Archivage annulé', restored)
  } catch {
    showError('Annulation impossible', "La tâche n'a pas été remise au tableau.")
  }
}

/**
 * Insère une carte placée au tableau par le serveur (archivage annulé, ajout
 * rapide). Comme côté serveur, les cartes de sa colonne à sa position ou après
 * descendent d'un cran : leur position locale reste celle enregistrée.
 * @param task Tâche telle que renvoyée par le serveur
 */
function insertTaskLocally(task: Task) {
  const list = taskLists.get(task.stageId)
  if (!list || findTaskLocation(task.id)) return

  for (const t of list) {
    if (t.position >= task.position) t.position += 1
  }

  const updated = [...list]
  const index = updated.findIndex((t) => t.position > task.position)
  updated.splice(index === -1 ? updated.length : index, 0, { ...task })
  taskLists.set(task.stageId, updated)
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
      showError('Ordre non enregistré', "La tâche a été créée, mais l'ordre de la colonne n'a pas été enregistré.")
    }
    return
  }

  // Édition : remplacement sur place, dans la colonne où la carte est affichée.
  // Pas de tri par position : celles des autres cartes peuvent être obsolètes
  // tant que la sauvegarde d'un DnD n'a pas abouti.
  const location = findTaskLocation(task.id)
  if (!location) return

  const oldTagIds = (location.list[location.index].tags ?? []).map((tag) => tag.id)
  const list = [...location.list]
  list[location.index] = task
  taskLists.set(location.stageId, list)
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
 * Retrouve la colonne locale et l'index d'une carte par son id.
 * On ne se fie pas à task.stageId : vuedraggable déplace l'objet entre les
 * listes sans le modifier, le champ n'est remis à jour qu'après la sauvegarde.
 * @param taskId Id de la tâche
 */
function findTaskLocation(taskId: number): { stageId: number; list: Task[]; index: number } | null {
  for (const [stageId, list] of taskLists) {
    const index = list.findIndex((t) => t.id === taskId)
    if (index !== -1) return { stageId, list, index }
  }
  return null
}

/**
 * Création de la colonne
 */
async function createStage() {
  // Nom nettoyé comme le titre des tâches (schéma zod de TaskDialog)
  const name = newStageName.value.trim()
  if (!name) return

  let newStage: Stage

  try {
    newStage = await stageStore.saveStage(name, stagesLocal.value.length)
  } catch {
    // La saisie est conservée pour pouvoir réessayer
    showError('Création impossible', "La liste n'a pas été créée.")
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

  const consequence = count === 1 ? 'Sa tâche sera archivée' : `Ses ${count} tâches seront archivées`
  confirm.require({
    target: stageMenuTrigger.value ?? undefined,
    message: `Supprimer la liste « ${stage.name} » ? ${consequence}.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Supprimer', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: () => deleteStage(stage),
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

    const newTaskLists = new Map(taskLists)
    newTaskLists.delete(stageId)
    setAll(taskLists, newTaskLists)

    logger.debug('Colonne supprimée : ', stageId)
  } catch (error) {
    logger.error('Erreur lors de la suppression de la colonne', {
      stageId,
      error,
    })
    showError('Suppression impossible', "La liste n'a pas été supprimée.")
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
    showError('Renommage annulé')
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

// Tâches créées depuis la fenêtre d'ajout rapide, insérées sans recharger le tableau
const stopQuickAddListener = globalThis.quickAdd.onTaskCreated(insertTaskLocally)
onBeforeUnmount(stopQuickAddListener)

onMounted(() => {
  if (!scrollContainer.value) return
  const el = scrollContainer.value

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return
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
