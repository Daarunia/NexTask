import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { DEFAULT_BOARD, createBoard, defaultBoardId } from '../../helpers/board.helper'
import { DAILY, createRecurringTask, localDate } from '../../helpers/recurrence.helper'

/**
 * Tests E2E du tableau des séries dans la liste « Tâches récurrentes » des
 * Paramètres. Rien avec un seul tableau, le tableau de chaque série avec
 * plusieurs, « Tableau supprimé » pour une série dont le tableau a été
 * supprimé (même s'il ne reste qu'un tableau).
 *
 * Le tableau par défaut (« Mon tableau », colonnes des seeds) est là à chaque
 * test, « Perso » est créé par POST /boards avec une colonne. Les ids se
 * lisent par l'API.
 *
 * Isolation, base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Second tableau. */
const SECOND_BOARD = 'Perso'

/**
 * Recharge la page, pour que le renderer relise tableaux et séries créés par l'API.
 * @param page Page de l'app
 */
async function reload(page: Page) {
  await page.reload()
  await expect(page.getByTestId('board-switcher')).toBeVisible()
}

test.describe('Tableau des séries', () => {
  test('aucun tableau affiché avec un seul tableau', async ({ page, header, settingsPage }) => {
    await createRecurringTask(page.request, { title: 'Quotidienne', startDate: localDate(1), recurrence: DAILY })
    await reload(page)

    await header.goSettings()
    await expect(settingsPage.recurrence('Quotidienne')).toBeVisible()
    await expect(settingsPage.recurrenceList.getByTestId('settings-recurrence-board')).toHaveCount(0)
  })

  test('le tableau de chaque série, puis « Tableau supprimé » après sa suppression', async ({
    page,
    header,
    settingsPage,
  }) => {
    const defaultId = await defaultBoardId(page.request)
    const second = await createBoard(page.request, SECOND_BOARD, 'emerald', ['Idées'])
    await createRecurringTask(page.request, { title: 'Maison', startDate: localDate(1), recurrence: DAILY })
    await createRecurringTask(page.request, {
      title: 'Sport',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: second.stageIds[0],
    })
    await reload(page)

    await header.goSettings()
    const home = settingsPage.recurrence('Maison').getByTestId('settings-recurrence-board')
    const sport = settingsPage.recurrence('Sport').getByTestId('settings-recurrence-board')
    await expect(home).toHaveText(DEFAULT_BOARD)
    await expect(home).toHaveAttribute('data-board-id', String(defaultId))
    await expect(sport).toHaveText(SECOND_BOARD)
    await expect(sport).toHaveAttribute('data-board-id', String(second.id))

    // Tableau supprimé, sa série est arrêtée et le signale, l'autre garde son tableau
    const res = await page.request.delete(`${API}/boards/${second.id}`)
    expect(res.ok(), await res.text()).toBeTruthy()
    // Rechargement sur la page des Paramètres, qui relit séries et tableaux
    await page.reload()
    await expect(settingsPage.recurrence('Sport')).toHaveAttribute('data-status', 'ended')
    await expect(sport).toHaveText('Tableau supprimé')
    await expect(sport).not.toHaveAttribute('data-board-id')
    await expect(home).toHaveText(DEFAULT_BOARD)
  })
})
