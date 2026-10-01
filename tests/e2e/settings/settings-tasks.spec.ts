import { test, expect } from '../../fixtures/test'
import type { Page } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des réglages de la section Tâches de la page Paramètres (hors
 * versions, testées à part) : position d'une nouvelle tâche et confirmation
 * avant archivage.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

/** Id de la colonne seedée `COLUMN`. */
async function columnId(page: Page): Promise<number> {
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stage = stages.find((s) => s.name === COLUMN)
  expect(stage).toBeDefined()
  return stage!.id
}

/**
 * Crée des tâches via l'API dans `COLUMN`, positions = index, puis recharge la
 * page pour que le tableau les affiche.
 * @param tasks Titre et tags de chaque tâche, dans l'ordre de la colonne
 */
async function seedColumn(page: Page, tasks: { title: string; tags?: string[] }[]) {
  const stageId = await columnId(page)
  for (const [position, task] of tasks.entries()) {
    const res = await page.request.post(`${API}/tasks`, {
      data: { stageId, position, title: task.title, version: '1.0.0', description: '', tags: task.tags ?? [] },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(tasks.length)
}

/** Titres des tâches actives de `COLUMN` en base, triés par position. */
async function persistedOrder(page: Page): Promise<{ title: string; position: number }[]> {
  const stageId = await columnId(page)
  const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as {
    title: string
    position: number
    stageId: number | null
    isHistorized: boolean
  }[]
  return tasks
    .filter((t) => t.stageId === stageId && !t.isHistorized)
    .sort((a, b) => a.position - b.position)
    .map((t) => ({ title: t.title, position: t.position }))
}

test.describe("Position d'une nouvelle tâche", () => {
  test('en bas par défaut', async ({ page, header, taskBoard, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.newTaskPositionOption('En bas')).toHaveAttribute('aria-pressed', 'true')
    await header.goHome()

    await taskBoard.createTask(COLUMN, { title: 'Première' })
    await taskBoard.createTask(COLUMN, { title: 'Seconde' })

    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Première', 'Seconde'])
    await expect
      .poll(() => persistedOrder(page))
      .toEqual([
        { title: 'Première', position: 0 },
        { title: 'Seconde', position: 1 },
      ])
  })

  test('en haut : la tâche passe en tête et les autres sont renumérotées', async ({
    page,
    header,
    taskBoard,
    settingsPage,
  }) => {
    await seedColumn(page, [{ title: 'A' }, { title: 'B' }])

    await header.goSettings()
    await settingsPage.newTaskPositionOption('En haut').click()
    await expect(settingsPage.newTaskPositionOption('En haut')).toHaveAttribute('aria-pressed', 'true')
    await header.goHome()

    await taskBoard.createTask(COLUMN, { title: 'Nouvelle' })

    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Nouvelle', 'A', 'B'])
    await expect
      .poll(() => persistedOrder(page))
      .toEqual([
        { title: 'Nouvelle', position: 0 },
        { title: 'A', position: 1 },
        { title: 'B', position: 2 },
      ])

    // Après rechargement, le tableau relu en base garde le même ordre
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Nouvelle', 'A', 'B'])
  })

  test('en haut sous filtre : positions cohérentes sur la colonne complète', async ({
    page,
    header,
    taskBoard,
    tagFilter,
    settingsPage,
  }) => {
    await seedColumn(page, [{ title: 'A', tags: ['bug'] }, { title: 'B' }, { title: 'C', tags: ['bug'] }])

    await header.goSettings()
    await settingsPage.newTaskPositionOption('En haut').click()
    await expect(settingsPage.newTaskPositionOption('En haut')).toHaveAttribute('aria-pressed', 'true')
    await header.goHome()

    await tagFilter.select('bug')
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['A', 'C'])

    // Créée sous filtre : elle reçoit le tag du filtre et reste visible, en tête
    await taskBoard.createTask(COLUMN, { title: 'Nouvelle' })
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Nouvelle', 'A', 'C'])

    // La tâche masquée par le filtre est décalée elle aussi
    await expect
      .poll(() => persistedOrder(page))
      .toEqual([
        { title: 'Nouvelle', position: 0 },
        { title: 'A', position: 1 },
        { title: 'B', position: 2 },
        { title: 'C', position: 3 },
      ])

    await tagFilter.unselect('bug')
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Nouvelle', 'A', 'B', 'C'])
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.newTaskPositionOption('En haut').click()
    await expect(settingsPage.newTaskPositionOption('En haut')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()

    await expect(settingsPage.newTaskPositionOption('En haut')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Confirmation avant archivage', () => {
  test('désactivée par défaut : la corbeille archive en un clic', async ({ header, taskBoard, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.confirmArchiveSwitch).not.toBeChecked()
    await header.goHome()

    await taskBoard.createTask(COLUMN, { title: 'Sans confirmation' })
    await taskBoard.archiveTask('Sans confirmation')

    await expect(taskBoard.confirmPopup).toHaveCount(0)
    await expect(taskBoard.taskCard('Sans confirmation')).toHaveCount(0)
  })

  test("activée : l'archivage attend la confirmation", async ({ page, header, taskBoard, settingsPage }) => {
    const title = 'Avec confirmation'

    await header.goSettings()
    await settingsPage.confirmArchiveSwitch.click()
    await expect(settingsPage.confirmArchiveSwitch).toBeChecked()
    await header.goHome()

    await taskBoard.createTask(COLUMN, { title })

    // Annuler : la carte reste
    await taskBoard.archiveTask(title)
    await expect(taskBoard.confirmPopup).toBeVisible()
    await taskBoard.confirmRejectButton.click()
    await expect(taskBoard.confirmPopup).toBeHidden()
    await expect(taskBoard.taskCard(title)).toBeVisible()

    // Confirmer : la carte part et la tâche est archivée en base
    await taskBoard.archiveTask(title)
    await taskBoard.confirmAcceptButton.click()
    await expect(taskBoard.taskCard(title)).toHaveCount(0)

    const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as {
      title: string
      isHistorized: boolean
    }[]
    expect(tasks.find((t) => t.title === title)?.isHistorized).toBe(true)
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.confirmArchiveSwitch.click()
    await expect(settingsPage.confirmArchiveSwitch).toBeChecked()

    await page.reload()

    await expect(settingsPage.confirmArchiveSwitch).toBeChecked()
  })
})
