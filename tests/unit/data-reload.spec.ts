import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Tests unitaires du rechargement après un import (utils/data.helper.ts),
 * avec une Pinia neuve par test. Caches vidés, dernier tableau oublié, tags
 * relus, même si l'enregistrement du dernier tableau échoue.
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
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock('../../src/renderer/utils/api.helper', () => ({ api, httpStatus: () => undefined }))
vi.mock('../../src/renderer/utils/logger', () => ({ getLogger: () => log }))
vi.mock('../../src/renderer/utils/theme.helper', () => ({ applyTheme: vi.fn() }))

const { reloadDataAfterImport } = await import('../../src/renderer/utils/data.helper')
const { useBoardStore } = await import('../../src/renderer/stores/Board')
const { useSettingsStore } = await import('../../src/renderer/stores/Settings')
const { useTagStore } = await import('../../src/renderer/stores/Tag')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  settingsBridge.set.mockResolvedValue(undefined)
  api.get.mockResolvedValue([{ id: 1, name: 'bug', color: 'red', taskCount: 0 }])
})

describe('reloadDataAfterImport', () => {
  test('vide le cache des tableaux, oublie le dernier tableau et relit les tags', async () => {
    useBoardStore().setAllBoardsCache([{ id: 5, name: 'Tableau 5', color: null, position: 0 }])
    useSettingsStore().$patch({ lastBoardId: 5 })

    await reloadDataAfterImport()

    expect(useBoardStore().getAllBoards).toEqual([])
    expect(useSettingsStore().lastBoardId).toBeNull()
    expect(settingsBridge.set).toHaveBeenCalledWith('lastBoardId', null)
    expect(api.get).toHaveBeenCalledWith('/tags')
    expect(useTagStore().getAllTags.map((tag) => tag.name)).toEqual(['bug'])
  })

  test("logue l'échec de l'enregistrement du dernier tableau sans interrompre le rechargement", async () => {
    useSettingsStore().$patch({ lastBoardId: 5 })
    settingsBridge.set.mockRejectedValueOnce(new Error('IPC indisponible'))

    await expect(reloadDataAfterImport()).resolves.toBeUndefined()

    expect(log.error).toHaveBeenCalledWith(
      "Erreur lors de l'oubli du dernier tableau après l'import :",
      expect.any(Error),
    )
    expect(api.get).toHaveBeenCalledWith('/tags')
  })
})
