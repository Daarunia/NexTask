import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { ChecklistItemInput } from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E de l'avancement des checklists hors du dialogue de tâche, soit le
 * badge des cartes du tableau (absent sans point, « 2/3 » puis vert à 3/3,
 * infobulle et nom accessible), la recherche par le texte d'un point et le
 * badge de la page des archives.
 *
 * Les tâches et leurs points sont créés par l'API (`checklistItems` de
 * `POST /tasks` et `PATCH /tasks/:id`), puis le tableau est rechargé.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

interface Task {
  id: number
  title: string
  checklist: { id: number; items: { id: number; text: string; isChecked: boolean }[] } | null
}

/** Id de la colonne `COLUMN`. */
async function columnId(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  return stages.find((stage) => stage.name === COLUMN)!.id
}

/**
 * Crée une tâche dans la colonne `COLUMN`, avec ses points.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param checklistItems Points de la checklist, aucun par défaut
 * @param position Position dans la colonne
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  checklistItems: ChecklistItemInput[] = [],
  position = 0,
): Promise<Task> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId: await columnId(request), position, title, version: '1.0.0', description: '', checklistItems },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/**
 * Points non cochés, puis les `checked` premiers cochés.
 * @param texts Textes des points, dans l'ordre
 * @param checked Nombre de points cochés, en tête de liste
 */
function items(texts: string[], checked = 0): ChecklistItemInput[] {
  return texts.map((text, index) => ({ text, isChecked: index < checked }))
}

/**
 * Recharge la page et attend les cartes du tableau.
 * @param page Page de l'app
 * @param count Nombre de cartes attendues
 */
async function reloadBoard(page: Page, count: number) {
  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(count)
}

test('pas de badge sur une carte sans point', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Sans checklist')
  await reloadBoard(page, 1)

  await expect(taskBoard.taskCard('Sans checklist')).toBeVisible()
  await expect(taskBoard.cardChecklistBadge('Sans checklist')).toHaveCount(0)
})

test('affiche 2/3 puis passe au vert quand tous les points sont cochés', async ({ page, taskBoard }) => {
  const task = await createTask(page.request, 'Préparer la release', items(['Changelog', 'Tests', 'Tag'], 2))
  await reloadBoard(page, 1)

  const badge = taskBoard.cardChecklistBadge('Préparer la release')
  await expect(badge).toHaveText('2/3')
  await expect(badge).not.toHaveClass(/\bdone\b/)
  await expect(badge).toHaveAttribute('aria-label', '2 points cochés sur 3')
  await badge.hover()
  await expect(page.locator('.p-tooltip.info-tooltip')).toHaveText('2 points cochés sur 3')

  // Dernier point coché par l'API, les ids gardent les points existants
  const res = await page.request.patch(`${API}/tasks/${task.id}`, {
    data: { checklistItems: task.checklist!.items.map(({ id, text }) => ({ id, text, isChecked: true })) },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  await reloadBoard(page, 1)

  await expect(badge).toHaveText('3/3')
  await expect(badge).toHaveClass(/\bdone\b/)
  await expect(badge).toHaveAttribute('aria-label', '3 points cochés sur 3')
})

test("le badge se place avant l'icône de description", async ({ page, taskBoard }) => {
  const res = await page.request.post(`${API}/tasks`, {
    data: {
      stageId: await columnId(page.request),
      position: 0,
      title: 'Avec tout',
      version: '1.0.0',
      description: 'Contexte',
      checklistItems: items(['Un'], 0),
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  await reloadBoard(page, 1)

  const testIds = await taskBoard
    .taskCard('Avec tout')
    .locator('[data-testid^="task-card-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')))
  expect(testIds).toEqual(['task-card-checklist', 'task-card-description'])
  await expect(taskBoard.cardChecklistBadge('Avec tout')).toHaveText('0/1')
  await expect(taskBoard.cardChecklistBadge('Avec tout')).toHaveAttribute('aria-label', '0 point coché sur 1')
})

test("la recherche trouve une tâche par le texte d'un point", async ({ page, taskBoard, tagFilter }) => {
  await createTask(page.request, 'Courses', items(['Acheter du café', 'Pain complet'], 1), 0)
  await createTask(page.request, 'Ménage', items(['Aspirateur']), 1)
  await createTask(page.request, 'Sans point', [], 2)
  await reloadBoard(page, 3)

  // Sans tenir compte de la casse ni des accents, point coché compris
  await tagFilter.search('CAFE')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Courses'])
  await expect(tagFilter.taskOption('Courses')).toBeVisible()
  // Le point trouvé sert d'extrait, la description étant vide
  await expect(tagFilter.taskOption('Courses')).toContainText('Acheter du café')

  await tagFilter.search('aspirateur')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Ménage'])
})

test('la page des archives affiche le badge des tâches archivées', async ({
  page,
  header,
  settingsPage,
  archivesPage,
}) => {
  for (const [title, checklistItems] of [
    ['Terminée', items(['A', 'B'], 2)],
    ['Entamée', items(['A', 'B', 'C'], 1)],
    ['Sans point', []],
  ] as const) {
    const task = await createTask(page.request, title, [...checklistItems])
    const res = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { isHistorized: true, stageId: null, historizationDate: new Date().toISOString() },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  await header.goSettings()
  await settingsPage.openArchivesButton.click()
  await expect(archivesPage.items).toHaveCount(3)

  await expect(archivesPage.checklistBadge('Terminée')).toHaveText('2/2')
  await expect(archivesPage.checklistBadge('Terminée')).toHaveClass(/\bdone\b/)
  await expect(archivesPage.checklistBadge('Entamée')).toHaveText('1/3')
  await expect(archivesPage.checklistBadge('Entamée')).not.toHaveClass(/\bdone\b/)
  await expect(archivesPage.checklistBadge('Entamée')).toHaveAttribute('aria-label', '1 point coché sur 3')
  await expect(archivesPage.checklistBadge('Sans point')).toHaveCount(0)
})
