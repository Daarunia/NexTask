import { useI18n } from 'vue-i18n'
import { useBoardStore } from '../stores/Board'
import { useBoardFilterStore } from '../stores/BoardFilter'
import { useSettingsStore } from '../stores/Settings'
import { useStageStore } from '../stores/Stage'
import { useTagStore } from '../stores/Tag'
import { useTaskStore } from '../stores/Task'
import type { Tag, TagSelection } from '../types/tag.types'
import type { Task } from '../types/task.types'
import type { SeriesPlacement } from '@core/shared/recurrence.constants'
import { useDangerConfirm } from './confirm.helper'
import { getLogger } from './logger'
import { compareTagNames } from './tag.helper'
import { useActionToast, useErrorToast, useUndoToast } from './toast.helper'

/** Carte affichée par une vue, avec sa colonne affichée. */
export interface TaskCardLocation {
  task: Task
  stageId: number
}

/**
 * Cartes d'une vue. Le Kanban y branche ses colonnes locales. Le Planning lit
 * directement le store, qui est déjà à jour après chaque action : ses `insert`,
 * `remove` et `update` n'ont rien à faire.
 */
export interface TaskCardSource {
  /** Retrouve une carte par son id, `null` si elle n'est plus affichée. */
  find(taskId: number): TaskCardLocation | null
  /** Affiche une carte placée par le serveur. */
  insert(task: Task): void
  /** Retire une carte de la vue, et renvoie sa place si la vue en garde une. */
  remove(taskId: number): TaskCardLocation | null
  /** Remplace une carte par sa nouvelle version. */
  update(taskId: number, change: (task: Task) => Task): void
  /** Ouvre une carte en édition. */
  open(taskId: number): void
  /** Envoi vers un autre tableau annulé, la carte étant de nouveau à sa place. */
  onMoveToBoardUndone?(boardId: number): unknown
}

/**
 * Actions d'une carte communes au Kanban et au Planning, avec leurs toasts et
 * leurs annulations : archivage, duplication, tags, date de début et envoi vers
 * un autre tableau. À appeler dans le setup d'un composant (toasts et i18n
 * reposent sur l'injection Vue).
 * @param source Cartes de la vue
 */
export function useTaskActions(source: TaskCardSource) {
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

    const location = source.find(task.id)
    if (!location) return true

    const oldTags = (location.task.tags ?? []).filter((tag) => !tagStore.wasDeleted(tag.id))
    const oldIds = oldTags.map((tag) => tag.id)
    const names = change(oldIds).flatMap((id) => {
      const name = tagStore.getTagById(id)?.name ?? oldTags.find((tag) => tag.id === id)?.name
      return name ? [name] : []
    })

    try {
      const updatedTask = await taskStore.updateTaskTags(task.id, names)

      // Seuls les tags de la copie locale changent : la carte a pu bouger pendant l'appel
      source.update(task.id, (current) => ({ ...current, tags: updatedTask.tags }))
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
   * Pose ou retire un tag depuis le menu d'une carte.
   * @param task Tâche de la carte
   * @param tagId Tag basculé
   */
  async function toggleTaskTag(task: Task, tagId: number) {
    const toggled = (ids: number[]) => (ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId])
    if (!(await changeTaskTags(task, toggled))) showError(t('board.tagsNotSaved'))
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
      source.update(task.id, (current) => ({
        ...current,
        startDate: updated.startDate,
        notifiedAt: updated.notifiedAt,
      }))
    } catch {
      showError(t('board.dateFailed'))
    }
  }

  /**
   * Envoie une carte vers un autre tableau depuis son menu, en bas de la
   * première colonne de ce tableau. La colonne est choisie dans le cache, le
   * serveur reste juge (colonne supprimée entre-temps). La carte quitte le
   * tableau affiché une fois le déplacement enregistré, le cache des tâches
   * suit par le store. Le toast propose de l'annuler.
   * @param taskId Id de la tâche
   * @param boardId Tableau d'arrivée
   */
  async function moveTaskToBoard(taskId: number, boardId: number) {
    const target = boardStore.getAllBoards.find((candidate) => candidate.id === boardId)
    const stage = stageStore.getStagesOfBoard(boardId)[0]
    const before = source.find(taskId)
    if (!target || !stage || before === null) return

    let previousSeries: SeriesPlacement | null
    try {
      previousSeries = (await taskStore.moveTaskToStage(taskId, stage.id)).previousSeries
    } catch {
      showError(t('boards.send.failed'))
      return
    }

    // Place de la carte (position persistée), reprise si l'envoi est annulé
    const location = source.remove(taskId) ?? before
    logger.debug('Tâche envoyée vers un autre tableau', { taskId, boardId, stageId: stage.id })

    // Titre de la tâche en précision, comme les autres toasts d'annulation. La
    // série, si elle a suivi la carte, reprendra sa propre place, pas celle de la carte
    const place = { stageId: location.stageId, position: location.task.position, series: previousSeries }
    showUndo(t('boards.send.sent', { name: target.name }), {
      detail: location.task.title,
      undo: () => undoMoveToBoard(taskId, boardId, place),
    })
  }

  /**
   * Annule l'envoi d'une carte vers un autre tableau, par la même route avec
   * son ancienne colonne et son ancienne position. La série revient avec elle,
   * à sa propre place d'avant l'envoi (colonne du modèle, même supprimée), pas
   * à celle de la carte.
   * @param taskId Id de la tâche
   * @param boardId Tableau où elle a été envoyée
   * @param place Colonne et position de la carte avant l'envoi, et place de sa
   *   série si l'envoi l'a changée (null sinon)
   */
  async function undoMoveToBoard(
    taskId: number,
    boardId: number,
    place: { stageId: number; position: number; series: SeriesPlacement | null },
  ) {
    let restored: Task
    try {
      restored = (await taskStore.moveTaskToStage(taskId, place.stageId, place.position, place.series)).task
    } catch {
      showError(t('board.undoFailed'), t('boards.send.undoFailedDetail'))
      return
    }

    source.insert(restored)
    logger.debug('Envoi vers un autre tableau annulé', restored)
    await source.onMoveToBoardUndone?.(boardId)
  }

  /**
   * Archivage d'une carte, annulable depuis le toast
   * @param task Tâche de la carte
   */
  async function archiveTask(task: Task) {
    const before = source.find(task.id)

    try {
      await taskStore.archiveTask(task.id)
    } catch {
      showError(t('board.archiveFailed'), t('board.archiveFailedDetail'))
      return
    }

    // Carte retirée de la vue, retrouvée par id
    const location = source.remove(task.id) ?? before

    logger.debug('Tâche archivée', task)

    // Place de la carte (position persistée), reprise si l'archivage est annulé
    const place = location ? { stageId: location.stageId, position: location.task.position } : undefined
    showUndo(t('board.taskArchived'), { detail: task.title, undo: () => undoArchive(task.id, place) })
  }

  /**
   * Archivage d'une carte depuis son menu : direct, ou après confirmation dans
   * une bulle ancrée sur la carte si le paramètre est activé (comme la corbeille).
   * @param task Tâche de la carte
   * @param card Carte affichée, ancre de la bulle
   */
  function askArchiveTask(task: Task, card: HTMLElement | null) {
    if (!settings.confirmArchive) {
      void archiveTask(task)
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
      source.insert(restored)
      if (removed) {
        source.remove(removed.id)
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

    source.insert(copy)
    showAction(t('board.taskDuplicated'), copy.title, {
      label: t('board.openCopy'),
      run: () => source.open(copy.id),
      available: () => source.find(copy.id) !== null,
    })
  }

  return {
    filterTagSelection,
    updateTagCounts,
    changeTaskTags,
    toggleTaskTag,
    setStartDate,
    moveTaskToBoard,
    archiveTask,
    askArchiveTask,
    undoArchive,
    duplicateTask,
  }
}
