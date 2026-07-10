import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E de l'écran de tâche (TaskDialog), feature principale de l'app :
 * création, valeurs par défaut, annulation, édition et archivage d'une tâche
 * depuis le tableau Kanban.
 *
 * Isolation : la base de test est remise à zéro avant chaque test (voir le
 * beforeEach dans fixtures/test.ts). Chaque test part donc d'un tableau propre
 * avec uniquement les colonnes seedées — pas besoin de titres uniques ni de
 * nettoyage manuel.
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

test("ouvre l'écran de tâche en création avec les valeurs par défaut", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)

  // Champs vides et version par défaut à 1.5.0
  await expect(taskBoard.titleInput).toHaveValue('')
  await expect(taskBoard.descriptionInput).toHaveValue('')
  await expect(taskBoard.versionSelect).toContainText('1.5.0')
  // La date de début est vide par défaut (champ optionnel)
  await expect(taskBoard.startDateInput).toHaveValue('')

  await taskBoard.cancelButton.click()
  await expect(taskBoard.dialog).toBeHidden()
})

test('crée une nouvelle tâche qui apparaît dans la colonne', async ({ taskBoard }) => {
  const title = 'Tâche créée'

  await taskBoard.createTask(COLUMN, {
    title,
    description: 'Description de test',
    version: '1.4.5',
  })

  // La carte apparaît bien dans la colonne ciblée
  const card = taskBoard
    .column(COLUMN)
    .getByTestId('task-card')
    .filter({ has: taskBoard.page.getByText(title, { exact: true }) })
  await expect(card).toBeVisible()
})

test('annuler la création ne crée aucune tâche', async ({ taskBoard }) => {
  const title = 'Tâche annulée'

  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.titleInput.fill(title)
  await taskBoard.cancelButton.click()

  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toHaveCount(0)
})

test("pré-remplit l'écran puis reflète l'édition d'une tâche", async ({ taskBoard }) => {
  const title = 'Tâche à éditer'
  const editedTitle = `${title} (modifiée)`

  await taskBoard.createTask(COLUMN, { title, description: 'Avant' })

  await taskBoard.openEditDialog(title)

  // Les champs sont pré-remplis avec la tâche existante
  await expect(taskBoard.titleInput).toHaveValue(title)
  await expect(taskBoard.descriptionInput).toHaveValue('Avant')

  await taskBoard.fillAndSave({ title: editedTitle, description: 'Après' })

  // Nouveau titre visible, ancien titre disparu
  await expect(taskBoard.taskCard(editedTitle)).toBeVisible()
  await expect(taskBoard.taskCard(title)).toHaveCount(0)
})

test("enregistre une date de début et la ré-affiche à l'édition", async ({ taskBoard }) => {
  const title = 'Tâche avec date de début'

  // Création avec le 1er du mois courant comme date de début
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.titleInput.fill(title)
  const expectedDate = await taskBoard.pickStartDateFirstOfMonth()
  await taskBoard.saveButton.click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toBeVisible()

  // À la réouverture en édition, la date de début est pré-remplie (on vérifie la
  // partie date ; l'heure dépend de l'instant de sélection)
  await taskBoard.openEditDialog(title)
  await expect(taskBoard.startDateInput).toHaveValue(new RegExp(`^${expectedDate}`))

  await taskBoard.cancelButton.click()
  await expect(taskBoard.dialog).toBeHidden()
})

test('archive une tâche la retire du tableau', async ({ taskBoard }) => {
  const title = 'Tâche à archiver'

  await taskBoard.createTask(COLUMN, { title })
  await expect(taskBoard.taskCard(title)).toBeVisible()

  await taskBoard.archiveTask(title)
  await expect(taskBoard.taskCard(title)).toHaveCount(0)
})
