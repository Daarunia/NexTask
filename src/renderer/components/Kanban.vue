<template>
  <div
    class="flex h-4/5 pt-8 overflow-x-auto ml-4 before:content-[''] before:flex-1 after:content-[''] after:flex-1 pb-4"
    ref="scrollContainer"
  >
    <draggable
      v-model="stagesLocal"
      itemKey="id"
      :forceFallback="true"
      :fallbackTolerance="3"
      class="flex gap-4"
      handle=".stage-handle"
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
            <template v-else>
              <h2
                data-testid="stage-title"
                class="stage-handle cursor-grab text-lg"
                @dblclick="startEditingStage(stage)"
              >
                {{ stage.name }}
              </h2>
            </template>

            <!-- Menu -->
            <Button
              icon="pi pi-ellipsis-v"
              data-testid="btn-stage-menu"
              @click="(event) => toggleStageMenu(event, stage)"
              text
            />
          </div>

          <StageTaskList
            :tasks="taskLists.get(stage.id) ?? []"
            @tasks-drop="onTasksDrop"
            @edit-task="openEditTaskDialog(stage.id, $event)"
            @archive-task="archiveTask"
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
    @task-saved="onTaskSaved"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, reactive } from 'vue'
import draggable from 'vuedraggable'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import StageTaskList from './StageTaskList.vue'
import TaskDialog from './TaskDialog.vue'
import { useTaskStore } from '../stores/Task'
import { useStageStore } from '../stores/Stage'
import { Task } from '../types/task.types'
import { Stage } from '../types/stage.types'
import { getLogger } from '../utils/logger'
import { setAll } from '../utils/map.helper'
import { useErrorToast } from '../utils/toast.helper'

const props = defineProps<{
  stages: Stage[]
  tasks: Task[]
}>()

const logger = getLogger()
const taskStore = useTaskStore()
const stageStore = useStageStore()
const showError = useErrorToast()

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
const editingStageId = ref<number | null>(null) // stage en cours d'édition
const editedStageName = ref('') // nom temporaire pour l'édition

const stageMenuItems = [
  {
    label: 'Supprimer',
    icon: 'pi pi-trash',
    command: () => deleteStage(),
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
  positionDialog.value = taskLists.get(stageId)?.length ?? 0
  editTask.value = null
  creationMode.value = true
  showDialog.value = true
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
  // Comparaison avec le dernier état persisté, porté par les tâches de taskLists
  // (et non avec props.tasks, instantané figé au montage)
  const changes: { task: Task; position: number; stageId: number }[] = []

  for (const stage of stagesLocal.value) {
    const currentTasks = taskLists.get(stage.id) ?? []

    currentTasks.forEach((task, index) => {
      if (task.position !== index || task.stageId !== stage.id) {
        changes.push({ task, position: index, stageId: stage.id })
      }
    })
  }

  if (!changes.length) return

  // Seuls les champs du déplacement sont envoyés, car renvoyer la tâche entière ferait
  // échouer tout le batch si une ancienne tâche a un titre vide (refusé par l'API)
  const modifiedTasks = changes.map(({ task, position, stageId }) => ({ id: task.id, position, stageId }))
  logger.debug('Mise à jour DnD des tâches', modifiedTasks)

  try {
    await taskStore.updateTaskBatch(modifiedTasks)
  } catch {
    restorePersistedTasks()
    showError('Déplacement annulé')
    return
  }

  // Sauvegarde réussie : les tâches locales reflètent désormais l'état persisté
  for (const { task, position, stageId } of changes) {
    task.position = position
    task.stageId = stageId
  }
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
}

/**
 * Save depuis dialog
 */
function onTaskSaved(task: Task) {
  if (creationMode.value) {
    // Nouvelle carte : ajoutée en fin de colonne (position = longueur à l'ouverture)
    const list = taskLists.get(task.stageId) ?? []
    taskLists.set(task.stageId, [...list, task])
    return
  }

  // Édition : remplacement sur place, dans la colonne où la carte est affichée.
  // Pas de tri par position : celles des autres cartes peuvent être obsolètes
  // tant que la sauvegarde d'un DnD n'a pas abouti.
  const location = findTaskLocation(task.id)
  if (!location) return

  const list = [...location.list]
  list[location.index] = task
  taskLists.set(location.stageId, list)
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

async function deleteStage() {
  if (!selectedStage.value) return
  const stageId = selectedStage.value.id

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
  } finally {
    selectedStage.value = null
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
  stageMenu.value.toggle(event)
}

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

.stage-handle {
  user-select: none;
}
</style>
