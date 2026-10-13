import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du titre obligatoire d'une tâche, contrôlé à la fois par le
 * formulaire (PrimeVue Forms + Zod dans TaskDialog) et par l'API Fastify.
 *
 * Les assertions ne supposent pas un tableau vide. On compare le nombre de
 * cartes avant et après un Save refusé, et les tâches créées sont ciblées par
 * leur titre, comme dans les autres specs.
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

const TITLE_REQUIRED = 'Le titre est obligatoire'

test('refuse de créer une tâche sans titre puis accepte un titre valide', async ({ taskBoard }) => {
  const title = 'Tâche avec titre'
  const cards = taskBoard.column(COLUMN).getByTestId('task-card')

  // Le tableau est chargé une fois la modale ouverte, le compte de départ est donc stable
  await taskBoard.openCreateDialog(COLUMN)
  const cardsBefore = await cards.count()

  await taskBoard.saveButton.click()

  // La modale reste ouverte avec le message d'erreur, et aucune carte n'est ajoutée
  await expect(taskBoard.titleError).toHaveText(TITLE_REQUIRED)
  await expect(taskBoard.dialog).toBeVisible()
  await expect(cards).toHaveCount(cardsBefore)

  // Une fois un titre saisi, l'erreur disparaît et la sauvegarde aboutit
  await taskBoard.titleInput.fill(title)
  await expect(taskBoard.titleError).toBeHidden()
  await taskBoard.saveButton.click()

  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toBeVisible()
})

test("refuse un titre composé uniquement d'espaces", async ({ taskBoard }) => {
  const cards = taskBoard.column(COLUMN).getByTestId('task-card')

  await taskBoard.openCreateDialog(COLUMN)
  const cardsBefore = await cards.count()

  await taskBoard.titleInput.fill('    ')
  await taskBoard.saveButton.click()

  await expect(taskBoard.titleError).toHaveText(TITLE_REQUIRED)
  await expect(taskBoard.dialog).toBeVisible()
  await expect(cards).toHaveCount(cardsBefore)

  // Refermer la modale, sinon son masque peut bloquer les clics du test suivant
  await taskBoard.cancelButton.click()
  await expect(taskBoard.dialog).toBeHidden()
})

test('enregistre le titre sans les espaces de début et de fin', async ({ taskBoard }) => {
  await taskBoard.createTask(COLUMN, { title: '   Tâche nettoyée   ' })

  await expect(taskBoard.taskCard('Tâche nettoyée')).toBeVisible()
})

test("empêche d'effacer le titre d'une tâche existante", async ({ taskBoard }) => {
  const title = 'Tâche à garder'

  await taskBoard.createTask(COLUMN, { title })
  await taskBoard.openEditDialog(title)

  await taskBoard.titleInput.fill('')
  await taskBoard.saveButton.click()

  await expect(taskBoard.titleError).toHaveText(TITLE_REQUIRED)
  await expect(taskBoard.dialog).toBeVisible()

  // Après annulation, la tâche garde son titre d'origine
  await taskBoard.cancelButton.click()
  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toBeVisible()
})

test("l'API refuse une tâche dont le titre est vide ou blanc", async ({ page }) => {
  const stagesRes = await page.request.get(`${API}/stages`)
  expect(stagesRes.ok()).toBeTruthy()
  const [stage] = (await stagesRes.json()) as { id: number }[]

  for (const title of ['', '   ']) {
    const res = await page.request.post(`${API}/tasks`, {
      data: { stageId: stage.id, position: 0, title, version: '1.5.0', description: '' },
    })
    expect(res.status(), `titre ${JSON.stringify(title)}`).toBe(400)
  }
})
