import { test, expect } from '../../fixtures/test'

/**
 * Vérifie que les données sont réellement persistées côté serveur/DB, et pas
 * seulement mises à jour de façon optimiste dans l'UI : on recharge la page et
 * la tâche doit toujours être là (l'app re-fetch depuis le serveur au montage).
 */

test('une tâche créée persiste après rechargement', async ({ taskBoard, page }) => {
  const title = `Persist ${Date.now().toString().slice(-6)}`

  await taskBoard.createTask('A faire', { title })
  await expect(taskBoard.taskCard(title)).toBeVisible()

  await page.reload()

  await expect(taskBoard.taskCard(title)).toBeVisible()

  await taskBoard.archiveTask(title)
})

test('une date de début effacée reste vide après rechargement', async ({ taskBoard, page }) => {
  const title = `Date effacée ${Date.now().toString().slice(-6)}`

  // Création avec une date de début
  await taskBoard.openCreateDialog('A faire')
  await taskBoard.titleInput.fill(title)
  const expectedDate = await taskBoard.pickStartDateFirstOfMonth()
  await taskBoard.saveButton.click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toBeVisible()

  // Réédition : la date est pré-remplie, on l'efface puis on sauvegarde
  await taskBoard.openEditDialog(title)
  await expect(taskBoard.startDateInput).toHaveValue(new RegExp(`^${expectedDate}`))
  await taskBoard.clearStartDate()
  await taskBoard.saveButton.click()
  await expect(taskBoard.dialog).toBeHidden()

  // Rechargement : les données viennent du serveur, pas du cache optimiste
  await page.reload()
  await expect(taskBoard.taskCard(title)).toBeVisible()

  await taskBoard.openEditDialog(title)
  await expect(taskBoard.startDateInput).toHaveValue('')

  await taskBoard.cancelButton.click()
  await expect(taskBoard.dialog).toBeHidden()
})
