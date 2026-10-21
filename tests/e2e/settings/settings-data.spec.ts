import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'
import { createTaskViaApi } from '../../helpers/tag.helper'
import { restoreDialogs, stubOpenDialog, stubSaveDialog } from '../../helpers/dialog.helper'
import { createRecurringTask, DAILY, getTask, localDate, stageIds } from '../../helpers/recurrence.helper'
import { EXPORT_FORMAT, EXPORT_VERSION } from '../../../src/main/shared/data.constants'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E de l'export / import des données et de la sauvegarde automatique.
 *
 * Les routes GET /data/export et POST /data/import, qu'utilise le main, sont
 * testées directement, aller-retour compris, checklists, modèles et tableaux
 * aussi (fichiers antérieurs aux checklists ou aux tableaux, textes trop longs
 * raccourcis). Les boutons de la page Paramètres sont testés avec des boîtes de dialogue natives remplacées dans
 * le main (cf. dialog.helper). La sauvegarde, quotidienne en temps normal,
 * est déclenchée à la demande via POST /test/run-backup.
 *
 * Isolation : base, paramètres et sauvegardes remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées, dans l'ordre (cf. prisma/seeds/fr/01_initial_stages.sql)
const SEEDED_STAGES = ['A faire', 'En cours', 'En attente', 'Terminé']

/** Fichier d'export, tel que renvoyé par GET /data/export. */
interface ExportFile {
  format: string
  version: number
  appVersion: string
  exportedAt: string
  stages: { id: number; name: string; position: number }[]
  tags: { id: number; name: string; color: string; createdAt: string }[]
  tasks: {
    id: number
    title: string
    stageId: number | null
    isHistorized: boolean
    historizationDate: string | null
    position: number
    updatedAt: string
    tagIds: number[]
  }[]
}

/** Export courant via GET /data/export. */
async function exportData(request: APIRequestContext): Promise<ExportFile> {
  const res = await request.get(`${API}/data/export`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ExportFile
}

/**
 * Contenu comparable de deux exports : sans la date d'export ni la date de
 * dernière modification des tâches (gérée par Prisma).
 * @param data Export
 */
function comparable(data: ExportFile) {
  return {
    stages: data.stages,
    tags: data.tags,
    tasks: data.tasks.map(({ updatedAt: _updatedAt, ...task }) => task),
  }
}

/**
 * Décor commun : une colonne en plus, une tâche active à deux tags et une
 * tâche archivée à un tag.
 * @param request Contexte de requête Playwright
 */
async function seedData(request: APIRequestContext) {
  expect((await request.post(`${API}/stages`, { data: { name: 'Revue', position: 5 } })).ok()).toBeTruthy()
  await createTaskViaApi(request, 'Active', ['bug', 'ui'])
  const archived = await createTaskViaApi(request, 'Archivée', ['ui'])
  expect((await request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()
}

/**
 * Envoie un fichier à POST /data/import.
 * @param request Contexte de requête Playwright
 * @param data Contenu du fichier
 */
function importData(request: APIRequestContext, data: unknown) {
  return request.post(`${API}/data/import`, { data })
}

test.describe('GET /data/export', () => {
  test.use({ ui: false })

  test('exporte colonnes, tags et tâches (archives comprises) avec format et version', async ({ page }) => {
    await seedData(page.request)

    const data = await exportData(page.request)

    expect(data.format).toBe(EXPORT_FORMAT)
    expect(data.version).toBe(EXPORT_VERSION)
    expect(data.stages.map((s) => s.name)).toEqual([...SEEDED_STAGES, 'Revue'])
    expect(data.tags.map((t) => t.name).sort()).toEqual(['bug', 'ui'])

    const tagId = (name: string) => data.tags.find((t) => t.name === name)!.id
    const active = data.tasks.find((t) => t.title === 'Active')
    const archived = data.tasks.find((t) => t.title === 'Archivée')
    expect(active).toMatchObject({ isHistorized: false, tagIds: [tagId('bug'), tagId('ui')].sort((a, b) => a - b) })
    expect(archived).toMatchObject({ isHistorized: true, stageId: null, tagIds: [tagId('ui')] })
    expect(archived?.historizationDate).toBeTruthy()
  })
})

test.describe('POST /data/import', () => {
  test.use({ ui: false })

  test("l'aller-retour export → import restitue les mêmes données", async ({ page }) => {
    await seedData(page.request)
    const original = await exportData(page.request)

    // Les données changent après l'export…
    const revue = original.stages.find((s) => s.name === 'Revue')!
    expect((await page.request.delete(`${API}/stages/${revue.id}`)).ok()).toBeTruthy()
    await createTaskViaApi(page.request, 'Intruse', ['nouveau'])

    // … puis l'import les remplace toutes
    const res = await importData(page.request, original)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toEqual({ boards: 1, stages: 5, tags: 2, tasks: 2, checklistTemplates: 0, warnings: [] })

    expect(comparable(await exportData(page.request))).toEqual(comparable(original))

    // Les ids repris n'empêchent pas de créer ensuite de nouvelles données
    const created = await createTaskViaApi(page.request, 'Après import', ['bug'])
    expect(original.tasks.map((t) => t.id)).not.toContain(created.id)
    expect(created.tags.map((t) => t.id)).toEqual([original.tags.find((t) => t.name === 'bug')!.id])
  })

  test('un export vide vide toutes les données', async ({ page }) => {
    await seedData(page.request)
    const empty = { ...(await exportData(page.request)), stages: [], tags: [], tasks: [] }

    const res = await importData(page.request, empty)
    expect(res.ok(), await res.text()).toBeTruthy()

    const after = await exportData(page.request)
    expect([after.stages, after.tags, after.tasks]).toEqual([[], [], []])
  })

  test.describe('fichier invalide : refusé sans rien modifier', () => {
    /** Série valable, rattachée à la première colonne du fichier. */
    const series = (data: ExportFile) => ({
      id: 1,
      frequency: 'daily',
      interval: 1,
      time: '09:00',
      startsAt: '2030-01-01T08:00:00.000Z',
      endType: 'never',
      status: 'active',
      title: 'Série',
      description: '',
      version: '1.0.0',
      stageId: data.stages[0].id,
      tagIds: [],
    })

    const cases: { name: string; change: (data: ExportFile) => unknown; message?: RegExp }[] = [
      { name: 'version inconnue', change: (data) => ({ ...data, version: 99 }), message: /Version de format 99/ },
      { name: 'autre format', change: (data) => ({ ...data, format: 'autre' }), message: /pas un export NexTask/ },
      { name: 'sans les tâches', change: ({ tasks: _tasks, ...data }) => data },
      {
        name: 'tâche dans une colonne absente',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, stageId: t.stageId ?? 999999 })) }),
        message: /colonne absente/,
      },
      {
        name: 'tag absent du fichier',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, tagIds: [...t.tagIds, 999999] })) }),
        message: /tag absent/,
      },
      {
        name: 'noms de tags en double (casse mise à part)',
        change: (data) => ({ ...data, tags: data.tags.map((t) => ({ ...t, name: 'Doublon' })) }),
        message: /Plusieurs tags/,
      },
      {
        name: 'id de colonne en double',
        change: (data) => ({ ...data, stages: data.stages.map((s) => ({ ...s, id: data.stages[0].id })) }),
        message: /Colonne .* plusieurs fois/,
      },
      {
        name: 'id de tag en double',
        change: (data) => ({ ...data, tags: data.tags.map((t) => ({ ...t, id: data.tags[0].id })) }),
        message: /Tag .* plusieurs fois/,
      },
      {
        name: 'id de série en double',
        change: (data) => ({ ...data, recurrences: [series(data), series(data)] }),
        message: /Série 1 présente plusieurs fois/,
      },
      {
        name: 'série dans une colonne absente',
        change: (data) => ({ ...data, recurrences: [{ ...series(data), stageId: 999999 }] }),
        message: /série 1 référence une colonne absente/,
      },
      {
        name: 'série avec un tag absent du fichier',
        change: (data) => ({ ...data, recurrences: [{ ...series(data), tagIds: [999999] }] }),
        message: /série 1 référence un tag absent/,
      },
      {
        name: 'id de tâche en double',
        change: (data) => ({ ...data, tasks: data.tasks.map((t) => ({ ...t, id: data.tasks[0].id })) }),
        message: /plusieurs fois/,
      },
    ]

    for (const { name, change, message } of cases) {
      test(name, async ({ page }) => {
        await seedData(page.request)
        const before = await exportData(page.request)

        const res = await importData(page.request, change(before))
        expect(res.status()).toBe(400)
        if (message) expect(((await res.json()) as { message: string }).message).toMatch(message)

        expect(comparable(await exportData(page.request))).toEqual(comparable(before))
      })
    }

    test("un corps qui n'est pas du JSON", async ({ page }) => {
      await seedData(page.request)
      const before = await exportData(page.request)

      const res = await page.request.post(`${API}/data/import`, {
        headers: { 'Content-Type': 'application/json' },
        data: '{ pas du json',
      })
      expect(res.status()).toBe(400)

      expect(comparable(await exportData(page.request))).toEqual(comparable(before))
    })
  })
})

test.describe('Checklists dans l’export et l’import', () => {
  test.use({ ui: false })

  /** Export réduit aux checklists, tel que renvoyé par GET /data/export. */
  interface ChecklistExport {
    checklistTemplates: { name: string; position: number; items: string[] }[]
    tasks: {
      id: number
      title: string
      updatedAt: string
      checklistItems?: { text: string; isChecked: boolean; checkedAt: string | null }[]
    }[]
    recurrences: { id: number; updatedAt: string; checklistItems?: string[] }[]
  }

  /** Export courant, lu avec ses checklists. */
  const exportChecklists = async (request: APIRequestContext) =>
    (await exportData(request)) as unknown as ExportFile & ChecklistExport

  /**
   * Contenu comparable des checklists de deux exports, sans les dates de
   * dernière modification (gérées par Prisma).
   * @param data Export
   */
  const comparableChecklists = (data: ChecklistExport) => ({
    checklistTemplates: data.checklistTemplates,
    tasks: data.tasks.map(({ updatedAt: _updatedAt, ...task }) => task),
    recurrences: data.recurrences.map(({ updatedAt: _updatedAt, ...series }) => series),
  })

  /**
   * Crée un modèle de checklist via POST /checklist-templates.
   * @param request Contexte de requête Playwright
   * @param name Nom du modèle
   * @param items Textes des points
   */
  async function createTemplate(request: APIRequestContext, name: string, items: string[]) {
    const res = await request.post(`${API}/checklist-templates`, { data: { name, items } })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  /** Modèles de checklist via GET /checklist-templates, réduits à leur nom et leurs textes. */
  async function templates(request: APIRequestContext) {
    const res = await request.get(`${API}/checklist-templates`)
    expect(res.ok()).toBeTruthy()
    const list = (await res.json()) as { name: string; items: { text: string; isChecked: boolean }[] }[]
    return list.map((template) => ({ name: template.name, items: template.items.map((item) => item.text) }))
  }

  /**
   * Décor des checklists : deux modèles, une tâche à un point coché sur deux,
   * une tâche sans point et une série quotidienne à deux points.
   * @param request Contexte de requête Playwright
   */
  async function seedChecklists(request: APIRequestContext) {
    await createTemplate(request, 'Revue de code', ['Relire le diff', 'Lancer les tests'])
    await createTemplate(request, 'Release', ['Taguer la version'])

    const res = await request.post(`${API}/tasks`, {
      data: {
        stageId: (await stageIds(request))['A faire'],
        position: 0,
        title: 'Avec points',
        version: '1.0.0',
        description: '',
        tags: [],
        checklistItems: [
          { text: 'Écrire le test', isChecked: true },
          { text: 'Corriger le bug', isChecked: false },
        ],
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    await createTaskViaApi(request, 'Sans point')

    await createRecurringTask(request, {
      title: 'Routine',
      startDate: localDate(1),
      recurrence: DAILY,
      checklistItems: [
        { text: 'Arroser les plantes', isChecked: false },
        { text: 'Sortir les poubelles', isChecked: false },
      ],
    })
  }

  test("l'aller-retour sur une base vidée restitue modèles, points cochés et points des séries", async ({ page }) => {
    await seedChecklists(page.request)
    const original = await exportChecklists(page.request)

    expect(original.checklistTemplates).toEqual([
      { name: 'Revue de code', position: 0, items: ['Relire le diff', 'Lancer les tests'] },
      { name: 'Release', position: 1, items: ['Taguer la version'] },
    ])
    const withItems = original.tasks.find((task) => task.title === 'Avec points')!
    expect(withItems.checklistItems).toMatchObject([
      { text: 'Écrire le test', isChecked: true },
      { text: 'Corriger le bug', isChecked: false, checkedAt: null },
    ])
    expect(withItems.checklistItems![0].checkedAt).toBeTruthy()
    expect(original.tasks.find((task) => task.title === 'Sans point')!.checklistItems).toEqual([])
    expect(original.recurrences[0].checklistItems).toEqual(['Arroser les plantes', 'Sortir les poubelles'])

    // Base vidée par un export vide, modèles compris
    const empty = { ...original, stages: [], tags: [], tasks: [], recurrences: [], checklistTemplates: [] }
    expect((await importData(page.request, empty)).ok()).toBeTruthy()
    expect(await templates(page.request)).toEqual([])

    const res = await importData(page.request, original)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ tasks: 3, checklistTemplates: 2, warnings: [] })

    expect(comparableChecklists(await exportChecklists(page.request))).toEqual(comparableChecklists(original))
    expect(await templates(page.request)).toEqual([
      { name: 'Revue de code', items: ['Relire le diff', 'Lancer les tests'] },
      { name: 'Release', items: ['Taguer la version'] },
    ])
    const task = await getTask(page.request, withItems.id)
    expect(task.checklist?.items.map((item) => [item.text, item.isChecked])).toEqual([
      ['Écrire le test', true],
      ['Corriger le bug', false],
    ])
  })

  test('un fichier sans les champs des checklists s’importe sans modèle ni point', async ({ page }) => {
    await seedChecklists(page.request)
    const { checklistTemplates: _templates, ...exported } = await exportChecklists(page.request)
    const legacy = {
      ...exported,
      tasks: exported.tasks.map(({ checklistItems: _items, ...task }) => task),
      recurrences: exported.recurrences.map(({ checklistItems: _items, ...series }) => series),
    }

    const res = await importData(page.request, legacy)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ tasks: 3, checklistTemplates: 0, warnings: [] })

    const after = await exportChecklists(page.request)
    expect(after.checklistTemplates).toEqual([])
    expect(after.tasks.map((task) => task.checklistItems)).toEqual([[], [], []])
    expect(after.recurrences.map((series) => series.checklistItems)).toEqual([[]])
    expect(await templates(page.request)).toEqual([])
  })

  test('les textes trop longs et les points en trop sont raccourcis et signalés', async ({ page }) => {
    await seedChecklists(page.request)
    const exported = await exportChecklists(page.request)
    const tooLong = 'x'.repeat(CHECKLIST_ITEM_MAX_LENGTH + 50)
    const tooMany = Array.from({ length: CHECKLIST_MAX_ITEMS + 3 }, (_, index) => `Point ${index + 1}`)
    const longName = 'N'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH + 10)
    const task = exported.tasks.find((item) => item.title === 'Avec points')!
    const series = exported.recurrences[0]

    const res = await importData(page.request, {
      ...exported,
      checklistTemplates: [
        { name: longName, position: 0, items: tooMany },
        // Même nom que le précédent une fois raccourci, casse mise à part
        { name: longName.toLowerCase(), position: 1, items: ['Ignoré'] },
      ],
      tasks: exported.tasks.map((item) =>
        item.id === task.id ? { ...item, checklistItems: [{ text: tooLong, isChecked: false }] } : item,
      ),
      recurrences: [{ ...series, checklistItems: [tooLong] }],
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    const limits = { maxItems: CHECKLIST_MAX_ITEMS, maxLength: CHECKLIST_ITEM_MAX_LENGTH }
    const name = longName.slice(0, CHECKLIST_TEMPLATE_NAME_MAX_LENGTH)
    expect(await res.json()).toMatchObject({
      checklistTemplates: 1,
      warnings: [
        { code: 'templateNameTruncated', params: { name, maxLength: CHECKLIST_TEMPLATE_NAME_MAX_LENGTH } },
        { code: 'templateChecklistClamped', params: { name, ...limits } },
        { code: 'templateNameTruncated', params: { name: name.toLowerCase() } },
        { code: 'duplicateTemplateName', params: { name: name.toLowerCase() } },
        { code: 'recurrenceChecklistClamped', params: { id: series.id, ...limits } },
        { code: 'taskChecklistClamped', params: { id: task.id, ...limits } },
      ],
    })

    const after = await exportChecklists(page.request)
    expect(after.checklistTemplates).toEqual([{ name, position: 0, items: tooMany.slice(0, CHECKLIST_MAX_ITEMS) }])
    expect(after.tasks.find((item) => item.id === task.id)!.checklistItems).toEqual([
      { text: tooLong.slice(0, CHECKLIST_ITEM_MAX_LENGTH), isChecked: false, checkedAt: null },
    ])
    expect(after.recurrences[0].checklistItems).toEqual([tooLong.slice(0, CHECKLIST_ITEM_MAX_LENGTH)])
  })
})

test.describe('Tableaux dans l’export et l’import', () => {
  test.use({ ui: false })

  /** Export lu avec ses tableaux, tel que renvoyé par GET /data/export. */
  interface BoardExport {
    boards: { id: number; name: string; color: string | null; position: number; createdAt: string }[]
    stages: { id: number; name: string; position: number; boardId?: number }[]
    tasks: { id: number; title: string; stageId: number | null; boardId?: number | null; updatedAt: string }[]
    recurrences: { id: number; stageId: number | null; boardId?: number | null; updatedAt: string }[]
  }

  /** Export courant, lu avec ses tableaux. */
  const exportBoards = async (request: APIRequestContext) =>
    (await exportData(request)) as unknown as ExportFile & BoardExport

  /**
   * Contenu comparable de deux exports, tableaux et séries compris, sans les
   * dates de dernière modification (gérées par Prisma).
   * @param data Export
   */
  const comparableBoards = (data: BoardExport) => ({
    boards: data.boards,
    stages: data.stages,
    tasks: data.tasks.map(({ updatedAt: _updatedAt, ...task }) => task),
    recurrences: data.recurrences.map(({ updatedAt: _updatedAt, ...series }) => series),
  })

  /**
   * Crée un tableau par POST /boards, avec les quatre colonnes par défaut.
   * @param request Contexte de requête Playwright
   * @param name Nom du tableau
   * @param color Couleur de la palette, ou null
   * @returns Id du tableau et ids de ses colonnes dans l'ordre
   */
  async function createBoard(request: APIRequestContext, name: string, color: string | null = null) {
    const res = await request.post(`${API}/boards`, { data: { name, color, columns: { mode: 'default' } } })
    expect(res.status(), await res.text()).toBe(201)
    const board = (await res.json()) as { id: number; stages: { id: number }[] }
    return { id: board.id, stageIds: board.stages.map((stage) => stage.id) }
  }

  /**
   * Décor à deux tableaux, « Perso » en plus du tableau par défaut, une
   * tâche active et une tâche archivée dans chacun, une série dans « Perso ».
   * @param request Contexte de requête Playwright
   * @returns Le tableau « Perso »
   */
  async function seedBoards(request: APIRequestContext) {
    // Tâches du tableau par défaut d'abord, createTaskViaApi visant une colonne de
    // position 0, que la première colonne de « Perso » partage
    await createTaskViaApi(request, 'Active défaut')
    const archivedDefault = await createTaskViaApi(request, 'Archivée défaut')
    const perso = await createBoard(request, 'Perso', 'sky')
    const createInPerso = async (title: string) => {
      const res = await request.post(`${API}/tasks`, {
        data: { stageId: perso.stageIds[1], position: 0, title, version: '1.0.0', description: '', tags: [] },
      })
      expect(res.ok(), await res.text()).toBeTruthy()
      return (await res.json()) as { id: number }
    }
    await createInPerso('Active perso')
    const archivedPerso = await createInPerso('Archivée perso')
    for (const task of [archivedDefault, archivedPerso]) {
      expect((await request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
    }
    await createRecurringTask(request, {
      title: 'Routine perso',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: perso.stageIds[0],
    })
    return perso
  }

  /**
   * Tableaux via GET /boards, dans leur ordre.
   * @param request Contexte de requête Playwright
   */
  async function boards(request: APIRequestContext) {
    const res = await request.get(`${API}/boards`)
    expect(res.ok()).toBeTruthy()
    return (await res.json()) as { id: number; name: string; color: string | null; position: number }[]
  }

  test('l’export donne les tableaux dans leur ordre et le tableau de chaque ligne', async ({ page }) => {
    const perso = await seedBoards(page.request)
    const [defaultBoard] = await boards(page.request)

    const data = await exportBoards(page.request)

    expect(data.boards.map(({ name, color, position }) => ({ name, color, position }))).toEqual([
      { name: 'Mon tableau', color: null, position: 0 },
      { name: 'Perso', color: 'sky', position: 1 },
    ])
    expect(data.boards.map((board) => board.id)).toEqual([defaultBoard.id, perso.id])
    expect(data.stages.filter((stage) => stage.boardId === perso.id).map((stage) => stage.id)).toEqual(perso.stageIds)
    const boardOf = (title: string) => data.tasks.find((task) => task.title === title)?.boardId
    expect(boardOf('Active défaut')).toBe(defaultBoard.id)
    expect(boardOf('Archivée défaut')).toBe(defaultBoard.id)
    expect(boardOf('Active perso')).toBe(perso.id)
    expect(boardOf('Archivée perso')).toBe(perso.id)
    expect(data.recurrences.map((series) => series.boardId)).toEqual([perso.id])
  })

  test('l’aller-retour restitue les deux tableaux, leurs colonnes, tâches et séries', async ({ page }) => {
    const perso = await seedBoards(page.request)
    const original = await exportBoards(page.request)

    // Les données changent après l'export…
    expect((await page.request.delete(`${API}/boards/${perso.id}`)).ok()).toBeTruthy()
    await createBoard(page.request, 'Intrus')

    // … puis l'import les remplace toutes, tableaux compris
    const res = await importData(page.request, original)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ boards: 2, stages: 8, tasks: 5, warnings: [] })

    expect(comparableBoards(await exportBoards(page.request))).toEqual(comparableBoards(original))
    expect((await boards(page.request)).map((board) => board.name)).toEqual(['Mon tableau', 'Perso'])

    // Les ids repris n'empêchent pas de créer ensuite un tableau
    const created = await createBoard(page.request, 'Après import')
    expect(original.boards.map((board) => board.id)).not.toContain(created.id)
  })

  test('un fichier sans tableaux s’importe dans un tableau par défaut', async ({ page }) => {
    await seedBoards(page.request)
    const { boards: _boards, ...exported } = await exportBoards(page.request)
    const legacy = {
      ...exported,
      stages: exported.stages.map(({ boardId: _boardId, ...stage }) => stage),
      tasks: exported.tasks.map(({ boardId: _boardId, ...task }) => task),
      recurrences: exported.recurrences.map(({ boardId: _boardId, ...series }) => series),
    }

    const res = await importData(page.request, legacy)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ boards: 1, stages: 8, tasks: 5 })

    const after = await boards(page.request)
    expect(after.map(({ name, color, position }) => ({ name, color, position }))).toEqual([
      { name: 'Mon tableau', color: null, position: 0 },
    ])
    // Colonnes, tâches archivées comprises, et séries dans ce seul tableau
    const data = await exportBoards(page.request)
    const boardIds = [...data.stages, ...data.tasks, ...data.recurrences].map((row) => row.boardId)
    expect(boardIds).toHaveLength(8 + 5 + 1)
    expect(new Set(boardIds)).toEqual(new Set([after[0].id]))
  })

  test('une colonne sans tableau prend le premier, une archive au tableau inconnu n’en a plus', async ({ page }) => {
    await seedBoards(page.request)
    const exported = await exportBoards(page.request)
    // Premier tableau par la position, pas par l'ordre du fichier
    const [first, second] = exported.boards
    const file = {
      ...exported,
      boards: [second, first],
      stages: exported.stages.map(({ boardId: _boardId, ...stage }) => stage),
      tasks: exported.tasks.map((task) => (task.stageId === null ? { ...task, boardId: 999999 } : task)),
    }

    const res = await importData(page.request, file)
    expect(res.ok(), await res.text()).toBeTruthy()

    const data = await exportBoards(page.request)
    expect(new Set(data.stages.map((stage) => stage.boardId))).toEqual(new Set([first.id]))
    const active = data.tasks.filter((task) => task.stageId !== null)
    expect(new Set(active.map((task) => task.boardId))).toEqual(new Set([first.id]))
    expect(data.tasks.filter((task) => task.stageId === null).map((task) => task.boardId)).toEqual([null, null])
  })

  test('un fichier sans colonne ni tableau garde un tableau par défaut', async ({ page }) => {
    await seedBoards(page.request)
    const exported = await exportBoards(page.request)

    const res = await importData(page.request, { ...exported, boards: [], stages: [], tasks: [], recurrences: [] })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ boards: 1, stages: 0, tasks: 0 })

    expect((await boards(page.request)).map((board) => board.name)).toEqual(['Mon tableau'])
  })

  test.describe('fichier invalide, refusé sans rien modifier', () => {
    const cases: { name: string; change: (data: BoardExport) => unknown; message: RegExp }[] = [
      {
        name: 'id de tableau en double',
        change: (data) => ({ ...data, boards: data.boards.map((board) => ({ ...board, id: data.boards[0].id })) }),
        message: /Tableau .* plusieurs fois/,
      },
      {
        name: 'noms de tableaux en double (casse mise à part)',
        change: (data) => ({
          ...data,
          boards: data.boards.map((board, index) => ({ ...board, name: index === 0 ? 'Doublon' : ' DOUBLON ' })),
        }),
        message: /Plusieurs tableaux portent le nom « doublon »/,
      },
      {
        name: 'colonne dans un tableau absent',
        change: (data) => ({ ...data, stages: data.stages.map((stage) => ({ ...stage, boardId: 999999 })) }),
        message: /colonne .* référence un tableau absent/,
      },
      {
        name: 'liste de tableaux vide avec des colonnes',
        change: (data) => ({ ...data, boards: [] }),
        message: /colonne .* référence un tableau absent/,
      },
    ]

    for (const { name, change, message } of cases) {
      test(name, async ({ page }) => {
        await seedBoards(page.request)
        const before = await exportBoards(page.request)

        const res = await importData(page.request, change(before))
        expect(res.status()).toBe(400)
        expect(((await res.json()) as { message: string }).message).toMatch(message)

        expect(comparableBoards(await exportBoards(page.request))).toEqual(comparableBoards(before))
      })
    }
  })
})

test.describe('Export et import depuis les Paramètres', () => {
  test.afterEach(async ({ electronApp }) => {
    await restoreDialogs(electronApp)
  })

  test("l'export écrit le fichier choisi", async ({ page, electronApp, header, settingsPage }, testInfo) => {
    await seedData(page.request)
    const file = testInfo.outputPath('export.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    await stubSaveDialog(electronApp, file)

    await header.goSettings()
    await settingsPage.exportButton.click()

    await expect(page.getByText('Données exportées', { exact: true })).toBeVisible()
    await expect(page.getByText(/^5 colonnes, 2 tâches, 2 tags, 0 modèle de checklist dans /)).toBeVisible()
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as ExportFile
    expect(written.format).toBe(EXPORT_FORMAT)
    expect(comparable(written)).toEqual(comparable(await exportData(page.request)))
  })

  test("l'export compte les tableaux quand il y en a plusieurs", async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const res = await page.request.post(`${API}/boards`, { data: { name: 'Perso', columns: { mode: 'default' } } })
    expect(res.status(), await res.text()).toBe(201)
    const file = testInfo.outputPath('export.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    await stubSaveDialog(electronApp, file)

    await header.goSettings()
    await settingsPage.exportButton.click()

    await expect(page.getByText(/^2 tableaux, 8 colonnes, 0 tâche, 0 tag, 0 modèle de checklist dans /)).toBeVisible()
  })

  test("l'import remplace les données après confirmation et le tableau les affiche", async ({
    page,
    electronApp,
    header,
    taskBoard,
    settingsPage,
  }, testInfo) => {
    // Fichier exporté depuis un premier état…
    await createTaskViaApi(page.request, 'Importée', ['bug'])
    expect(
      (await page.request.post(`${API}/checklist-templates`, { data: { name: 'Release', items: ['Taguer'] } })).ok(),
    ).toBeTruthy()
    const file = testInfo.outputPath('import.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(await exportData(page.request)))

    // … puis remplacé par un autre état, affiché sur le tableau
    const [imported] = (await exportData(page.request)).tasks
    expect((await page.request.delete(`${API}/tasks/${imported.id}`)).ok()).toBeTruthy()
    await createTaskViaApi(page.request, 'Locale', ['ui'])
    await page.reload()
    await expect(taskBoard.taskCard('Locale')).toBeVisible()

    await stubOpenDialog(electronApp, file)
    await header.goSettings()

    // Annuler la confirmation ne change rien
    await settingsPage.askImport()
    await settingsPage.confirmRejectButton.click()
    await expect(settingsPage.confirmPopup).toBeHidden()
    await expect(settingsPage.tag('ui')).toBeVisible()

    // Confirmer importe le fichier : les tags et le tableau sont rechargés sans relancer l'app
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()
    await expect(page.getByText('Données importées', { exact: true })).toBeVisible()
    await expect(page.getByText('4 colonnes, 1 tâche, 1 tag, 1 modèle de checklist', { exact: true })).toBeVisible()
    await expect.poll(() => settingsPage.tagNames()).toEqual(['bug'])

    await header.goHome()
    await expect(taskBoard.taskCard('Importée')).toBeVisible()
    await expect(taskBoard.taskCard('Locale')).toHaveCount(0)
    await expect(taskBoard.taskCardTags('Importée')).toHaveText(['bug'])
  })

  test('un fichier invalide est refusé et ne change rien', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    await createTaskViaApi(page.request, 'Conservée', ['ui'])
    const before = await exportData(page.request)

    const file = testInfo.outputPath('invalid.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...before, version: 99 }))
    await stubOpenDialog(electronApp, file)

    await header.goSettings()
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import refusé', { exact: true })).toBeVisible()
    expect(comparable(await exportData(page.request))).toEqual(comparable(before))
  })
})

test.describe('Sauvegarde automatique', () => {
  /**
   * Passage de la sauvegarde à la date donnée.
   * @param request Contexte de requête Playwright
   * @param now Date de référence
   */
  async function runBackup(request: APIRequestContext, now: Date) {
    const res = await request.post(`${API}/test/run-backup`, { data: { now: now.toISOString() } })
    expect(res.ok(), await res.text()).toBeTruthy()
    return (await res.json()) as { enabled: boolean; created: string | null; backups: string[]; directory: string }
  }

  /**
   * Nom de la sauvegarde d'un jour (date locale, comme le main).
   * @param day Jour de janvier 2026
   */
  const backupName = (day: number) => `nextask-2026-01-${String(day).padStart(2, '0')}.db`

  /** Midi, heure locale, d'un jour de janvier 2026. */
  const januaryNoon = (day: number) => new Date(2026, 0, day, 12)

  test('désactivée par défaut : aucune sauvegarde', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.autoBackupSwitch).not.toBeChecked()

    const result = await runBackup(page.request, januaryNoon(1))
    expect(result).toMatchObject({ enabled: false, created: null, backups: [] })
  })

  test('activée : une copie de la base par jour', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    const first = await runBackup(page.request, januaryNoon(1))
    expect(first).toMatchObject({ enabled: true, created: backupName(1), backups: [backupName(1)] })

    // Une vraie base SQLite, dans le dossier des sauvegardes
    const header16 = fs
      .readFileSync(path.join(first.directory, backupName(1)))
      .subarray(0, 16)
      .toString('latin1')
    expect(header16).toBe('SQLite format 3\0')

    // Un second passage le même jour ne refait pas de copie
    const again = await runBackup(page.request, new Date(2026, 0, 1, 18))
    expect(again).toMatchObject({ created: null, backups: [backupName(1)] })
  })

  test('seules les 7 dernières sauvegardes sont gardées', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    let result = await runBackup(page.request, januaryNoon(1))
    for (let day = 2; day <= 9; day++) {
      result = await runBackup(page.request, januaryNoon(day))
      expect(result.created).toBe(backupName(day))
    }

    expect(result.backups).toEqual([9, 8, 7, 6, 5, 4, 3].map(backupName))
    expect(fs.existsSync(path.join(result.directory, backupName(2)))).toBe(false)
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoBackupSwitch.click()
    await expect(settingsPage.autoBackupSwitch).toBeChecked()

    await page.reload()

    await expect(settingsPage.autoBackupSwitch).toBeChecked()
  })
})
