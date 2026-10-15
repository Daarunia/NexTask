import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la navigation au clavier entre les cartes du tableau, depuis le
 * titre d'une carte : flèches haut et bas, Début et Fin dans la colonne,
 * flèches gauche et droite vers la colonne voisine qui a des cartes.
 *
 * Isolation, la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

// Colonnes seedées par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'
const WAITING_COLUMN = 'En attente'

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
