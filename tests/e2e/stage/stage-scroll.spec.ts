import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du défilement d'une colonne trop haute pour l'écran (issue #86).
 *
 * Régression : la molette sur le tableau était entièrement convertie en
 * défilement horizontal, si bien qu'une colonne dont les cartes dépassaient
 * la hauteur visible ne pouvait plus défiler verticalement.
 *
 * Isolation : la base est remise à zéro avant chaque test (fixture automatique `cleanState`).
 */

const TASK_COUNT = 30

test.describe('Défilement vertical des colonnes', () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(`${API}/stages`)
    expect(res.ok()).toBeTruthy()
    const [first] = ((await res.json()) as { id: number; position: number }[]).sort((a, b) => a.position - b.position)

    // Assez de cartes pour dépasser la hauteur de la fenêtre
    for (let i = 0; i < TASK_COUNT; i++) {
      const created = await page.request.post(`${API}/tasks`, {
        data: { stageId: first.id, position: i, title: `Carte ${i}`, version: '1.0.0', description: '' },
      })
      expect(created.ok()).toBeTruthy()
    }

    await page.reload()
  })

  test('la molette sur une colonne qui déborde fait défiler ses cartes', async ({ page, taskBoard }) => {
    const card = taskBoard.taskCard('Carte 0')
    await expect(card).toBeVisible()

    const list = taskBoard.page.getByTestId('task-list-scroll').filter({ has: card })
    const board = taskBoard.page.getByTestId('board-scroll')

    // La liste déborde bien de sa hauteur visible
    const overflows = await list.evaluate((el) => el.scrollHeight > el.clientHeight)
    expect(overflows).toBe(true)

    const boardLeft = await board.evaluate((el) => el.scrollLeft)

    await card.hover()
    await page.mouse.wheel(0, 400)

    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await board.evaluate((el) => el.scrollLeft)).toBe(boardLeft)

    // L'en-tête de la colonne et le bouton d'ajout restent visibles
    const column = taskBoard.column('A faire')
    await expect(column.getByTestId('stage-title')).toBeInViewport()
    await expect(column.getByTestId('btn-add-task')).toBeInViewport()
  })
})
