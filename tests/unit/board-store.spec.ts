import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Board } from '../../src/renderer/types/board.types'
import type { Stage } from '../../src/renderer/types/stage.types'
import type { Task } from '../../src/renderer/types/task.types'

/**
 * Tests unitaires du store des tableaux (stores/Board.ts), avec une Pinia
 * neuve par test. Tableau affiché et ses replis, enregistrement du dernier
 * tableau, suppression d'un tableau et compteur de tâches. Puis les actions
 * du store Task qui passent d'un tableau à l'autre (déplacement, restauration).
 *
 * Le pont des paramètres du preload et l'API sont simulés, comme la
 * préférence de thème de l'OS lue au chargement du store des paramètres.
 */

// Pont des paramètres du preload, simulé avant l'import des stores
const settingsBridge = vi.hoisted(() => {
  const bridge = { set: vi.fn(async () => undefined), getAll: vi.fn(), reset: vi.fn() }
  Object.assign(globalThis, {
    settings: bridge,
    matchMedia: () => ({ matches: true, addEventListener: () => undefined }),
  })
  return bridge
})

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))

vi.mock('../../src/renderer/utils/api.helper', () => ({ api, httpStatus: () => undefined }))
vi.mock('../../src/renderer/utils/logger', () => {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { getLogger: () => log }
})
vi.mock('../../src/renderer/utils/theme.helper', () => ({ applyTheme: vi.fn() }))

const { useBoardStore } = await import('../../src/renderer/stores/Board')
const { useSettingsStore } = await import('../../src/renderer/stores/Settings')
const { useStageStore } = await import('../../src/renderer/stores/Stage')
const { useTaskStore } = await import('../../src/renderer/stores/Task')

/**
 * Tableau minimal.
 * @param id Id
 * @param position Position dans le sélecteur
 */
function board(id: number, position: number): Board {
  return { id, name: `Tableau ${id}`, color: null, position }
}

/**
 * Colonne minimale, sans tâche.
 * @param id Id
 * @param boardId Tableau de la colonne
 */
function stage(id: number, boardId: number): Stage {
  return { id, name: `Colonne ${id}`, position: id, boardId, tasks: [] }
}

/**
 * Tâche minimale.
 * @param id Id
 * @param stageId Colonne
 * @param boardId Tableau
 * @param isHistorized Tâche archivée
 */
function task(id: number, stageId: number, boardId: number, isHistorized = false): Task {
  return { id, stageId, boardId, position: 0, title: `T${id}`, version: '1.0.0', description: '', isHistorized }
}

/** Tableaux 7 (premier par sa position), 5 et 9, tâches et colonnes en cache. */
function loadSample() {
  useBoardStore().setAllBoardsCache([board(5, 1), board(7, 0), board(9, 2)])
  useStageStore().setAllStagesCache([stage(1, 5), stage(2, 5), stage(3, 7)])
  useTaskStore().setAllTasksCache([task(10, 1, 5), task(11, 2, 5), task(12, 3, 7), task(13, 1, 5, true)])
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  settingsBridge.set.mockResolvedValue(undefined)
})

describe('current', () => {
  test('vaut null tant que les tableaux ne sont pas chargés', () => {
    expect(useBoardStore().current).toBeNull()
  })

  test('sans tableau choisi ni paramètre, vaut le premier tableau par position', () => {
    loadSample()
    expect(useBoardStore().current?.id).toBe(7)
  })

  test('vaut le dernier tableau affiché, lu dans les paramètres', () => {
    loadSample()
    useSettingsStore().$patch({ lastBoardId: 9 })
    expect(useBoardStore().current?.id).toBe(9)
  })

  test('se replie sur le premier tableau si le dernier affiché a disparu', () => {
    loadSample()
    useSettingsStore().$patch({ lastBoardId: 42 })
    expect(useBoardStore().current?.id).toBe(7)
  })

  test('vaut le tableau choisi, avant le paramètre', () => {
    loadSample()
    const store = useBoardStore()
    useSettingsStore().$patch({ lastBoardId: 9 })
    store.currentId = 5
    expect(store.current?.id).toBe(5)
  })

  test('se replie sur le paramètre si le tableau choisi a disparu', () => {
    loadSample()
    const store = useBoardStore()
    useSettingsStore().$patch({ lastBoardId: 9 })
    store.currentId = 42
    expect(store.current?.id).toBe(9)
  })
})

describe('select', () => {
  test('affiche le tableau et enregistre lastBoardId', async () => {
    loadSample()
    const store = useBoardStore()

    await store.select(9)

    expect(store.current?.id).toBe(9)
    expect(useSettingsStore().lastBoardId).toBe(9)
    expect(settingsBridge.set).toHaveBeenCalledWith('lastBoardId', 9)
  })

  test("n'enregistre rien si le tableau est déjà le dernier affiché", async () => {
    loadSample()
    useSettingsStore().$patch({ lastBoardId: 9 })

    await useBoardStore().select(9)

    expect(settingsBridge.set).not.toHaveBeenCalled()
  })

  test("garde le tableau affiché si l'enregistrement échoue", async () => {
    loadSample()
    settingsBridge.set.mockRejectedValueOnce(new Error('IPC indisponible'))
    const store = useBoardStore()

    await expect(store.select(9)).resolves.toBeUndefined()

    expect(store.current?.id).toBe(9)
    expect(useSettingsStore().lastBoardId).toBeNull()
  })
})

describe('showTask', () => {
  test('affiche le tableau de la tâche puis demande son ouverture', async () => {
    loadSample()

    await useBoardStore().showTask(12)

    expect(useBoardStore().current?.id).toBe(7)
    expect(useSettingsStore().lastBoardId).toBe(7)
    expect(useTaskStore().taskToOpen).toBe(12)
  })

  test('demande sur le tableau affiché une tâche absente du cache', async () => {
    loadSample()
    const store = useBoardStore()
    store.currentId = 9

    await store.showTask(99)

    expect(store.current?.id).toBe(9)
    expect(useTaskStore().taskToOpen).toBe(99)
  })
})

describe('taskCount', () => {
  test('compte les tâches actives de chaque tableau', () => {
    loadSample()
    const store = useBoardStore()
    expect([store.taskCount(5), store.taskCount(7), store.taskCount(9)]).toEqual([2, 1, 0])
  })
})

describe('createBoard', () => {
  test('ajoute le tableau et ses colonnes aux caches', async () => {
    loadSample()
    api.post.mockResolvedValueOnce({ ...board(11, 3), stages: [stage(20, 11), stage(21, 11)] })
    const store = useBoardStore()

    const created = await store.createBoard('Tableau 11', null, { mode: 'default' })

    expect(api.post).toHaveBeenCalledWith('/boards', { name: 'Tableau 11', color: null, columns: { mode: 'default' } })
    expect(created).toEqual(board(11, 3))
    expect(store.getAllBoards.map((b) => b.id)).toEqual([7, 5, 9, 11])
    expect(
      useStageStore()
        .getStagesOfBoard(11)
        .map((s) => s.id),
    ).toEqual([20, 21])
  })
})

describe('deleteBoard', () => {
  test('archive ses tâches, retire ses colonnes et affiche le premier tableau restant', async () => {
    loadSample()
    useSettingsStore().$patch({ collapsedStageIds: [2, 3] })
    api.delete.mockResolvedValueOnce({ message: 'Tableau supprimé', archived: 2 })
    const store = useBoardStore()
    store.currentId = 5

    expect(await store.deleteBoard(5)).toBe(2)

    expect(store.getAllBoards.map((b) => b.id)).toEqual([7, 9])
    expect(useStageStore().getAllStages.map((s) => s.id)).toEqual([3])
    expect(useTaskStore().getAllTasks.map((t) => t.id)).toEqual([12])
    // Archives du tableau détachées de lui, comme côté serveur
    const archived = useTaskStore().allEntities?.data.filter((t) => t.isHistorized) ?? []
    expect(archived.map((t) => [t.id, t.boardId])).toEqual([
      [10, null],
      [11, null],
      [13, null],
    ])
    expect(useSettingsStore().collapsedStageIds).toEqual([3])
    expect(store.current?.id).toBe(7)
    expect(settingsBridge.set).toHaveBeenCalledWith('lastBoardId', 7)
  })

  test("garde le tableau affiché quand c'est un autre qui est supprimé", async () => {
    loadSample()
    api.delete.mockResolvedValueOnce({ message: 'Tableau supprimé', archived: 0 })
    const store = useBoardStore()
    store.currentId = 9

    await store.deleteBoard(7)

    expect(store.current?.id).toBe(9)
    expect(settingsBridge.set).not.toHaveBeenCalled()
  })

  test('laisse les caches intacts si le serveur refuse', async () => {
    loadSample()
    api.delete.mockRejectedValueOnce(new Error('HTTP 409'))
    const store = useBoardStore()

    await expect(store.deleteBoard(7)).rejects.toThrow('HTTP 409')

    expect(store.getAllBoards).toHaveLength(3)
    expect(useStageStore().getAllStages).toHaveLength(3)
  })
})

describe('moveTaskToStage', () => {
  test('met la tâche dans le tableau et la colonne visés, en bas sans position', async () => {
    loadSample()
    api.post.mockResolvedValueOnce({ ...task(10, 3, 7), position: 1 })
    const taskStore = useTaskStore()

    await taskStore.moveTaskToStage(10, 3)

    expect(api.post).toHaveBeenCalledWith('/tasks/10/move', { stageId: 3, position: undefined })
    expect(useBoardStore().taskCount(5)).toBe(1)
    expect(useBoardStore().taskCount(7)).toBe(2)
    expect(taskStore.getAllTasks.find((t) => t.id === 12)?.position).toBe(0)
  })

  test('fait descendre les tâches de la colonne visée à cette position ou après', async () => {
    loadSample()
    api.post.mockResolvedValueOnce(task(10, 3, 7))
    const taskStore = useTaskStore()

    await taskStore.moveTaskToStage(10, 3, 0)

    expect(api.post).toHaveBeenCalledWith('/tasks/10/move', { stageId: 3, position: 0 })
    expect(taskStore.getAllTasks.find((t) => t.id === 12)?.position).toBe(1)
    // Une tâche d'une autre colonne ne bouge pas
    expect(taskStore.getAllTasks.find((t) => t.id === 11)?.position).toBe(0)
  })

  test('renvoie la place d’avant de la série, hors de la tâche mise en cache', async () => {
    loadSample()
    api.post.mockResolvedValueOnce({ ...task(10, 3, 7), previousSeries: { stageId: null, boardId: 5 } })
    const taskStore = useTaskStore()

    const result = await taskStore.moveTaskToStage(10, 3)

    expect(result.previousSeries).toEqual({ stageId: null, boardId: 5 })
    expect(result.task).not.toHaveProperty('previousSeries')
    expect(taskStore.getAllTasks.find((t) => t.id === 10)).not.toHaveProperty('previousSeries')
  })

  test('annulation : rend sa place à la série, null devient absent', async () => {
    loadSample()
    api.post.mockResolvedValue({ ...task(10, 1, 5), previousSeries: null })
    const taskStore = useTaskStore()

    const result = await taskStore.moveTaskToStage(10, 1, 0, { stageId: null, boardId: 5 })
    expect(api.post).toHaveBeenLastCalledWith('/tasks/10/move', {
      stageId: 1,
      position: 0,
      seriesPlace: { stageId: null, boardId: 5 },
    })
    expect(result.previousSeries).toBeNull()

    // Envoi qui n'avait pas changé la série : rien à lui rendre, null n'est pas envoyé (refusé par le schéma)
    await taskStore.moveTaskToStage(10, 1, 0, null)
    expect(api.post.mock.lastCall?.[1].seriesPlace).toBeUndefined()
  })
})

describe('restoreTask', () => {
  test('passe le tableau de repli au serveur', async () => {
    loadSample()
    api.post.mockResolvedValueOnce({ ...task(13, 3, 7), removedOccurrenceId: null })

    await useTaskStore().restoreTask(13, undefined, 7)

    expect(api.post).toHaveBeenCalledWith('/tasks/13/restore', undefined, { params: { boardId: 7 } })
    expect(useBoardStore().taskCount(7)).toBe(2)
  })

  test('garde la place demandée, sans tableau de repli', async () => {
    loadSample()
    api.post.mockResolvedValueOnce({ ...task(13, 1, 5), removedOccurrenceId: null })

    await useTaskStore().restoreTask(13, { stageId: 1, position: 0 })

    expect(api.post).toHaveBeenCalledWith('/tasks/13/restore', undefined, {
      params: { stageId: 1, position: 0, boardId: undefined },
    })
  })
})
