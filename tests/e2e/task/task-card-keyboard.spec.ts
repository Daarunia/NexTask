import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du clavier sur les cartes du tableau, depuis le titre d'une carte :
 * flèches haut et bas, Début et Fin dans la colonne, flèches gauche et droite
 * vers la colonne voisine qui a des cartes, et Alt+flèche pour déplacer la
 * carte elle-même.
 *
 * Isolation, la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'
const WAITING_COLUMN = 'En attente'

/**
 * Titres des tâches actives d'une colonne en base, dans l'ordre des positions.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 */
async function savedTitles(request: APIRequestContext, column: string): Promise<string[]> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  const tasks = (await (await request.get(`${API}/tasks`)).json()) as {
    title: string
    position: number
    stageId: number
  }[]
  return tasks
    .filter((task) => task.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.title)
}

/**
 * Crée les tâches données, dans l'ordre, dans une colonne.
 * @param request Contexte de requête Playwright
 * @param column Nom de la colonne
 * @param titles Titres des tâches
 */
async function createTasks(request: APIRequestContext, column: string, ...titles: string[]) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === column)!.id
  for (const [position, title] of titles.entries()) {
    const res = await request.post(`${API}/tasks`, {
      data: { stageId, position, title, version: '1.0.0', description: '' },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }
}

test('les flèches passent d’une carte à l’autre', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Un', 'Deux', 'Trois')
  // « En cours », vide entre les deux, est sautée
  await createTasks(page.request, WAITING_COLUMN, 'Quatre')
  await page.reload()

  const title = (name: string) => taskBoard.taskCard(name).getByTestId('task-card-open')
  await title('Un').focus()

  // Rien au-dessus de la première carte
  await page.keyboard.press('ArrowUp')
  await expect(title('Un')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(title('Deux')).toBeFocused()
  await page.keyboard.press('End')
  await expect(title('Trois')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(title('Un')).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(title('Quatre')).toBeFocused()
  // Retour à la même hauteur, ramenée à la dernière carte de la colonne courte
  await page.keyboard.press('ArrowLeft')
  await expect(title('Un')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowRight')
  await expect(title('Quatre')).toBeFocused()

  // Entrée ouvre la carte atteinte
  await page.keyboard.press('Enter')
  await taskBoard.waitForDialogOpened()
  await expect(taskBoard.titleInput).toHaveValue('Quatre')
})

test('Alt+flèche déplace la carte, le focus la suit', async ({ page, taskBoard }) => {
  await createTasks(page.request, COLUMN, 'Un', 'Deux', 'Trois')
  await createTasks(page.request, OTHER_COLUMN, 'Quatre', 'Cinq')
  await page.reload()

  const title = (name: string) => taskBoard.taskCard(name).getByTestId('task-card-open')
  await title('Un').focus()

  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Deux', 'Un', 'Trois'])
  await expect(title('Un')).toBeFocused()

  // Même hauteur dans la colonne voisine
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Quatre', 'Un', 'Cinq'])
  await expect(title('Un')).toBeFocused()

  // Déjà tout en haut après un cran : le suivant ne fait rien
  await page.keyboard.press('Alt+ArrowUp')
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Un', 'Quatre', 'Cinq'])

  await expect.poll(() => savedTitles(page.request, OTHER_COLUMN)).toEqual(['Un', 'Quatre', 'Cinq'])
  expect(await savedTitles(page.request, COLUMN)).toEqual(['Deux', 'Trois'])
})
