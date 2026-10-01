import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des réglages de la section Tâches de la page Paramètres (hors
 * versions, testées à part) : confirmation avant archivage.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

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
