import type { Page, Request } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import type { TaskBoard } from '../../components/TaskBoard'
import { createTaskViaApi, getTasks, tagNames, type Task } from '../../helpers/tag.helper'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du filtre du Kanban par tag : OU logique entre les tags cochés, tags
 * proposés, DnD des tâches désactivé sous filtre, création pré-remplie et
 * positionnée sur la colonne complète, message quand plus rien n'est visible
 * et sortie du filtre d'un tag supprimé.
 *
 * Les cartes masquées par le filtre sont absentes du DOM : `task-card` ne
 * compte que les cartes visibles.
 *
 * Le décor (`BOARD`) est créé via l'API avec des positions explicites, puis la
 * page est rechargée pour que le tableau le charge. La remise à zéro du filtre
 * au redémarrage de l'app n'est pas couverte.
 *
 * Isolation : la base, tags compris, est remise à zéro avant chaque test
 * (fixture automatique `cleanState`).
 */

const A_FAIRE = 'A faire'
const EN_COURS = 'En cours'
const EN_ATTENTE = 'En attente'
const TERMINE = 'Terminé'

/**
 * Décor commun : tâches de chaque colonne dans leur ordre (position = index).
 * - bug : A1, A4, B2
 * - ui  : A3, B2, C1
 * - doc : B3
 */
const BOARD: Record<string, { title: string; tags: string[] }[]> = {
  [A_FAIRE]: [
    { title: 'A1', tags: ['bug'] },
    { title: 'A2', tags: [] },
    { title: 'A3', tags: ['ui'] },
    { title: 'A4', tags: ['bug'] },
  ],
  [EN_COURS]: [
    { title: 'B1', tags: [] },
    { title: 'B2', tags: ['bug', 'ui'] },
    { title: 'B3', tags: ['doc'] },
  ],
  [EN_ATTENTE]: [{ title: 'C1', tags: ['ui'] }],
}

const ALL_TITLES = Object.values(BOARD).flatMap((tasks) => tasks.map((t) => t.title))

// Ordre complet de chaque colonne, tel que créé
const fullOrder = (column: string) => (BOARD[column] ?? []).map((t) => t.title)

// Délai laissé à un éventuel envoi du batch après un drop, pour conclure à son absence
const BATCH_SETTLE_MS = 1000

interface Stage {
  id: number
  name: string
}

// Place d'une tâche active en base
interface Placement {
  stageId: number | null
  position: number
}

/** Id de chaque colonne seedée, par nom. */
async function stageIds(page: Page): Promise<Record<string, number>> {
  const res = await page.request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as Stage[]
  return Object.fromEntries(stages.map((s) => [s.name, s.id]))
}

/**
 * Crée le décor `BOARD` via l'API puis recharge le tableau.
 * @returns L'id de chaque colonne, par nom
 */
async function seedBoard(page: Page): Promise<Record<string, number>> {
  const ids = await stageIds(page)

  for (const [column, tasks] of Object.entries(BOARD)) {
    for (const [position, task] of tasks.entries()) {
      const res = await page.request.post(`${API}/tasks`, {
        data: { stageId: ids[column], position, title: task.title, version: '1.0.0', description: '', tags: task.tags },
      })
      expect(res.ok(), await res.text()).toBeTruthy()
    }
  }

  // Les tâches créées par l'API n'apparaissent qu'après rechargement du tableau
  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(ALL_TITLES.length)
  return ids
}

/** Colonne et position de chaque tâche active en base, par titre (GET /tasks). */
async function placements(page: Page): Promise<Record<string, Placement>> {
  const tasks = (await getTasks(page.request)) as (Task & { position: number })[]
  return Object.fromEntries(
    tasks.filter((t) => !t.isHistorized).map((t) => [t.title, { stageId: t.stageId, position: t.position }]),
  )
}

/**
 * Vérifie que seules les cartes attendues sont présentes, colonne par colonne
 * et dans l'ordre (les autres sont absentes du DOM).
 * @param expected Titres visibles attendus par colonne (colonne absente = vide)
 */
async function expectVisibleCards(taskBoard: TaskBoard, expected: Record<string, string[]>) {
  const total = Object.values(expected).reduce((sum, titles) => sum + titles.length, 0)
  await expect(taskBoard.page.getByTestId('task-card')).toHaveCount(total)

  for (const column of [A_FAIRE, EN_COURS, EN_ATTENTE, TERMINE]) {
    await expect.poll(() => taskBoard.columnTaskTitles(column)).toEqual(expected[column] ?? [])
  }
}

/** Vérifie que toutes les cartes du décor sont visibles, dans leur ordre d'origine. */
async function expectFullBoard(taskBoard: TaskBoard) {
  await expectVisibleCards(taskBoard, {
    [A_FAIRE]: fullOrder(A_FAIRE),
    [EN_COURS]: fullOrder(EN_COURS),
    [EN_ATTENTE]: fullOrder(EN_ATTENTE),
  })
}

test.describe('Filtrage des cartes', () => {
  test('filtrer sur un tag ne laisse que les cartes qui le portent, dans toutes les colonnes', async ({
    page,
    taskBoard,
    tagFilter,
  }) => {
    await seedBoard(page)

    await tagFilter.select('bug')

    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A1', 'A4'],
      [EN_COURS]: ['B2'],
    })
    for (const title of ['A2', 'A3', 'B1', 'B3', 'C1']) await expect(taskBoard.taskCard(title)).toHaveCount(0)
    await expect(tagFilter.emptyMessage).toHaveCount(0)
  })

  test('deux tags cochés montrent les cartes qui portent au moins un des deux (OU)', async ({
    page,
    taskBoard,
    tagFilter,
  }) => {
    await seedBoard(page)

    await tagFilter.select('bug', 'doc')

    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A1', 'A4'],
      [EN_COURS]: ['B2', 'B3'],
    })

    // Autre paire : une carte qui porte les deux tags (B2) n'apparaît qu'une fois
    await tagFilter.unselect('bug', 'doc')
    await tagFilter.select('ui', 'doc')

    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A3'],
      [EN_COURS]: ['B2', 'B3'],
      [EN_ATTENTE]: ['C1'],
    })
  })

  test("décocher tous les tags réaffiche toutes les cartes dans leur ordre d'origine", async ({
    page,
    taskBoard,
    tagFilter,
  }) => {
    await seedBoard(page)

    await tagFilter.select('bug', 'doc')
    await expect(page.getByTestId('task-card')).toHaveCount(4)

    await tagFilter.unselect('bug')
    await expectVisibleCards(taskBoard, { [EN_COURS]: ['B3'] })

    await tagFilter.unselect('doc')
    await expectFullBoard(taskBoard)
  })

  test("l'indication de DnD désactivé n'est présente que pendant le filtrage", async ({ page, tagFilter }) => {
    await seedBoard(page)
    await expect(tagFilter.dndHint).toHaveCount(0)

    await tagFilter.select('ui')
    await expect(tagFilter.dndHint).toBeVisible()

    // Toujours présente tant qu'il reste un tag coché
    await tagFilter.select('doc')
    await tagFilter.unselect('ui')
    await expect(tagFilter.dndHint).toBeVisible()

    await tagFilter.unselect('doc')
    await expect(tagFilter.dndHint).toHaveCount(0)
  })

  test('le compteur de chaque colonne affiche les cartes visibles sur le total sous filtre', async ({
    page,
    taskBoard,
    tagFilter,
  }) => {
    await seedBoard(page)

    const expectCounts = async (counts: string[]) => {
      for (const [index, column] of [A_FAIRE, EN_COURS, EN_ATTENTE, TERMINE].entries()) {
        await expect(taskBoard.columnCount(column)).toHaveText(counts[index])
      }
    }

    await expectCounts(['4', '3', '1', '0'])

    await tagFilter.select('bug')
    await expectCounts(['2/4', '1/3', '0/1', '0/0'])

    await tagFilter.unselect('bug')
    await expectCounts(['4', '3', '1', '0'])
  })
})

test.describe('Tags proposés', () => {
  test('ne propose que les tags portés par une tâche active, et suit les tags ajoutés sans rechargement', async ({
    page,
    taskBoard,
    tagPicker,
    tagFilter,
  }) => {
    await createTaskViaApi(page.request, 'Active', ['bug'])

    // Tag porté uniquement par une tâche historisée
    const archived = await createTaskViaApi(page.request, 'Historisée', ['archive'])
    expect((await page.request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()

    // Tag sans aucune tâche
    expect((await page.request.post(`${API}/tags`, { data: { name: 'orphelin' } })).ok()).toBeTruthy()

    await page.reload()
    await expect(taskBoard.taskCard('Active')).toBeVisible()

    await tagFilter.open()
    await tagFilter.expectOptions(['bug'])
    await expect(tagFilter.option('archive')).toHaveCount(0)
    await expect(tagFilter.option('orphelin')).toHaveCount(0)
    await tagFilter.close()

    // Un tag existant et un tag créé à la volée, ajoutés via le dialogue
    await taskBoard.openEditDialog('Active')
    await tagPicker.open()
    await tagPicker.select('orphelin')
    await tagPicker.createWithOption('nouveau')
    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(taskBoard.taskCardTags('Active')).toHaveText(['bug', 'nouveau', 'orphelin'])

    // Proposés aussitôt, sans rechargement
    await tagFilter.open()
    await tagFilter.expectOptions(['bug', 'nouveau', 'orphelin'])
    await expect(tagFilter.option('archive')).toHaveCount(0)
    await tagFilter.close()
  })
})

test.describe('Drag-and-drop sous filtre', () => {
  test('un drag de tâche sous filtre ne déplace rien, puis le DnD refonctionne une fois le filtre vidé', async ({
    page,
    taskBoard,
    tagFilter,
  }) => {
    const ids = await seedBoard(page)
    const before = await placements(page)

    // Toute sauvegarde batch des tâches envoyée pendant le filtrage
    const batchRequests: Request[] = []
    const onRequest = (req: Request) => {
      if (req.url().includes('/tasks/batch') && req.method() === 'PATCH') batchRequests.push(req)
    }
    page.on('request', onRequest)

    await tagFilter.select('bug')
    await expect(tagFilter.dndHint).toBeVisible()
    await expectVisibleCards(taskBoard, { [A_FAIRE]: ['A1', 'A4'], [EN_COURS]: ['B2'] })

    // Réordonnancement dans la colonne : A4 lâchée au-dessus de A1
    await taskBoard.dragTaskOntoCard('A4', 'A1', 'before')
    // Déplacement vers une autre colonne : A1 lâchée en fin de « En cours »
    await taskBoard.dragTaskToColumnEnd('A1', EN_COURS)
    await page.waitForTimeout(BATCH_SETTLE_MS)

    // Rien n'a bougé à l'écran, rien n'a été envoyé, rien n'a changé en base
    await expectVisibleCards(taskBoard, { [A_FAIRE]: ['A1', 'A4'], [EN_COURS]: ['B2'] })
    expect(batchRequests).toHaveLength(0)
    expect(await placements(page)).toEqual(before)
    page.off('request', onRequest)

    // Filtre vidé : ordre complet d'origine
    await tagFilter.unselect('bug')
    await expect(tagFilter.dndHint).toHaveCount(0)
    await expectFullBoard(taskBoard)

    // Le DnD refonctionne et part au serveur
    const saved = page.waitForResponse(
      (res) => res.url().includes('/tasks/batch') && res.request().method() === 'PATCH' && res.ok(),
    )
    await taskBoard.dragTaskOntoCard('A4', 'A1', 'before')
    await expect.poll(() => taskBoard.columnTaskTitles(A_FAIRE)).toEqual(['A4', 'A1', 'A2', 'A3'])
    await saved

    await expect
      .poll(async () => {
        const after = await placements(page)
        return fullOrder(A_FAIRE)
          .filter((title) => after[title].stageId === ids[A_FAIRE])
          .sort((a, b) => after[a].position - after[b].position)
      })
      .toEqual(['A4', 'A1', 'A2', 'A3'])
  })

  test('le réordonnancement des colonnes reste possible sous filtre', async ({ page, taskBoard, tagFilter }) => {
    await seedBoard(page)

    await tagFilter.select('bug')
    await expect(tagFilter.dndHint).toBeVisible()

    await taskBoard.dragStageBefore(EN_COURS, A_FAIRE)
    await expect.poll(() => taskBoard.orderedStagesAmong([A_FAIRE, EN_COURS])).toEqual([EN_COURS, A_FAIRE])

    // Le filtre est toujours appliqué, chaque carte dans sa colonne
    await expect(tagFilter.dndHint).toBeVisible()
    await expectVisibleCards(taskBoard, { [A_FAIRE]: ['A1', 'A4'], [EN_COURS]: ['B2'] })
  })
})

test.describe('Création sous filtre', () => {
  test('pré-remplit les tags du filtre et place la tâche en fin de colonne complète', async ({
    page,
    taskBoard,
    tagPicker,
    tagFilter,
  }) => {
    const title = 'Nouvelle'
    const ids = await seedBoard(page)
    const before = await placements(page)

    await tagFilter.select('bug', 'ui')
    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A1', 'A3', 'A4'],
      [EN_COURS]: ['B2'],
      [EN_ATTENTE]: ['C1'],
    })

    // Le dialogue de création arrive avec les tags du filtre
    await taskBoard.openCreateDialog(A_FAIRE)
    await expect(tagPicker.fieldChips).toHaveCount(2)
    await expect(tagPicker.fieldChip('bug')).toBeVisible()
    await expect(tagPicker.fieldChip('ui')).toBeVisible()
    await taskBoard.fillAndSave({ title })

    // Visible sous filtre, à la suite des cartes filtrées de sa colonne
    await expect(taskBoard.taskCard(title)).toBeVisible()
    await expect(taskBoard.taskCardTags(title)).toHaveText(['bug', 'ui'])
    await expect.poll(() => taskBoard.columnTaskTitles(A_FAIRE)).toEqual(['A1', 'A3', 'A4', title])

    // Filtre vidé : en dernière position de la colonne complète
    await tagFilter.unselect('bug', 'ui')
    await expect.poll(() => taskBoard.columnTaskTitles(A_FAIRE)).toEqual([...fullOrder(A_FAIRE), title])
    await expect.poll(() => taskBoard.columnTaskTitles(EN_COURS)).toEqual(fullOrder(EN_COURS))

    // En base : position = nombre de tâches déjà dans la colonne, les autres n'ont pas bougé
    const after = await placements(page)
    expect(after[title]).toEqual({ stageId: ids[A_FAIRE], position: fullOrder(A_FAIRE).length })
    const others = Object.fromEntries(Object.entries(after).filter(([t]) => t !== title))
    expect(others).toEqual(before)

    const created = (await getTasks(page.request)).find((t) => t.title === title)
    expect(tagNames(created?.tags ?? [])).toEqual(['bug', 'ui'])
  })
})

test.describe('Filtre sans résultat', () => {
  test("archiver la seule tâche d'un tag filtré affiche le message, le tag restant sélectionné", async ({
    page,
    taskBoard,
    tagPicker,
    tagFilter,
  }) => {
    const title = 'Relance doc'
    await seedBoard(page)
    await expect(tagFilter.emptyMessage).toHaveCount(0)

    await tagFilter.select('doc')
    await expectVisibleCards(taskBoard, { [EN_COURS]: ['B3'] })

    await taskBoard.archiveTask('B3')

    // Plus rien de visible : message affiché, filtre toujours actif
    await expect(tagFilter.emptyMessage).toBeVisible()
    await expect(tagFilter.emptyMessage).toContainText('Aucune tâche ne correspond au filtre')
    await expect(page.getByTestId('task-card')).toHaveCount(0)
    await expect(tagFilter.dndHint).toBeVisible()

    // « doc » n'est plus porté par une tâche active : on le prouve encore sélectionné par une
    // création sous filtre, pré-remplie avec lui et donc visible
    await taskBoard.openCreateDialog(A_FAIRE)
    await expect(tagPicker.fieldChips).toHaveCount(1)
    await expect(tagPicker.fieldChip('doc')).toBeVisible()
    await taskBoard.fillAndSave({ title })

    await expect(tagFilter.emptyMessage).toHaveCount(0)
    await expectVisibleCards(taskBoard, { [A_FAIRE]: [title] })

    // De nouveau porté par une tâche active, « doc » est proposé et coché : on vide le filtre
    await tagFilter.open()
    await tagFilter.expectSelected('doc')
    await tagFilter.close()
    await tagFilter.unselect('doc')

    await expect(tagFilter.emptyMessage).toHaveCount(0)
    await expect(tagFilter.dndHint).toHaveCount(0)
    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: [...fullOrder(A_FAIRE), title],
      [EN_COURS]: ['B1', 'B2'],
      [EN_ATTENTE]: fullOrder(EN_ATTENTE),
    })
  })
})

test.describe('Tag supprimé', () => {
  test('supprimer un tag filtré le sort du filtre et réaffiche les cartes selon le filtre restant', async ({
    page,
    taskBoard,
    tagPicker,
    tagFilter,
  }) => {
    await seedBoard(page)

    await tagFilter.select('bug', 'ui')
    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A1', 'A3', 'A4'],
      [EN_COURS]: ['B2'],
      [EN_ATTENTE]: ['C1'],
    })

    // Suppression de « bug » depuis le menu « … » du sélecteur d'une tâche visible
    await taskBoard.openEditDialog('B2')
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.deleteTag()
    await expect(tagPicker.anyChip('bug')).toHaveCount(0)
    await tagPicker.closeIfOpen()
    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // Il ne reste que « ui » dans le filtre : A1 et A4 (qui n'avaient que « bug ») disparaissent
    await expect(tagFilter.dndHint).toBeVisible()
    await expectVisibleCards(taskBoard, {
      [A_FAIRE]: ['A3'],
      [EN_COURS]: ['B2'],
      [EN_ATTENTE]: ['C1'],
    })
    await tagFilter.open()
    await expect(tagFilter.option('bug')).toHaveCount(0)
    await tagFilter.expectSelected('ui')
    await tagFilter.close()

    // Suppression du dernier tag filtré : plus de filtre, tout réapparaît
    await taskBoard.openEditDialog('B2')
    await tagPicker.open()
    await tagPicker.openMenu('ui')
    await tagPicker.deleteTag()
    await expect(tagPicker.anyChip('ui')).toHaveCount(0)
    await tagPicker.closeIfOpen()
    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(tagFilter.dndHint).toHaveCount(0)
    await expect(tagFilter.emptyMessage).toHaveCount(0)
    await expectFullBoard(taskBoard)
  })
})
