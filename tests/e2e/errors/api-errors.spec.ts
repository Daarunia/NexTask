import { test, expect } from '../../fixtures/test'
import type { Page } from '@playwright/test'

/**
 * Tests E2E du comportement en cas d'échec de l'API.
 *
 * L'échec est simulé en interceptant la requête du renderer (page.route) :
 * l'utilisateur doit voir un toast d'erreur et l'écran doit revenir au dernier
 * état enregistré, au lieu d'afficher un état que la base n'a pas.
 *
 * Isolation : la base est remise à zéro avant chaque test (beforeEach global),
 * et les interceptions sont retirées après chaque test (la page est partagée).
 */

const API = 'http://localhost:3000'
const A_FAIRE = 'A faire'

const uid = () => Date.now().toString().slice(-6)

/**
 * Fait échouer (HTTP 500) les requêtes du renderer correspondant à une URL et une méthode.
 * @param page Page de l'app
 * @param method Méthode HTTP à faire échouer
 * @param url Motif d'URL (glob Playwright)
 */
async function failApi(page: Page, method: string, url: string) {
  await page.route(url, (route) =>
    route.request().method() === method
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur simulée"}' })
      : route.fallback(),
  )
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('annule le renommage refusé par le serveur', async ({ taskBoard, page }) => {
  const name = `Nom ${uid()}`
  const refused = `Refusé ${uid()}`

  await taskBoard.addStage(name)
  await failApi(page, 'PATCH', `${API}/stages/*`)

  await page.getByRole('heading', { name, exact: true }).dblclick()
  const input = page.getByTestId('stage-edit-input')
  await input.fill(refused)
  await input.press('Enter')

  await expect(page.getByText('Renommage annulé').first()).toBeVisible()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: refused, exact: true })).toHaveCount(0)
})

test('remet les colonnes en place si le déplacement est refusé', async ({ taskBoard, page }) => {
  const s = uid()
  const [a, b] = [`Col-A ${s}`, `Col-B ${s}`]

  await taskBoard.addStage(a)
  await taskBoard.addStage(b)
  await failApi(page, 'PATCH', `${API}/stages/batch`)

  await taskBoard.dragStageBefore(b, a)

  await expect(page.getByText('Déplacement annulé').first()).toBeVisible()
  await expect.poll(() => taskBoard.orderedStagesAmong([a, b])).toEqual([a, b])
})

test('remet les tâches en place si le déplacement est refusé', async ({ taskBoard, page }) => {
  const s = uid()
  const [t1, t2] = [`DnD-1 ${s}`, `DnD-2 ${s}`]

  await taskBoard.createTask(A_FAIRE, { title: t1 })
  await taskBoard.createTask(A_FAIRE, { title: t2 })
  await failApi(page, 'PATCH', `${API}/tasks/batch`)

  await taskBoard.dragTaskOntoCard(t2, t1, 'before')

  await expect(page.getByText('Déplacement annulé').first()).toBeVisible()
  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, [t1, t2])).toEqual([t1, t2])
})

test('signale un échec du chargement initial et permet de réessayer', async ({ taskBoard, page }) => {
  await failApi(page, 'GET', `${API}/stages`)
  await page.reload()

  // Plus de spinner infini : un toast et un bouton pour relancer le chargement
  await expect(page.getByText('Chargement impossible').first()).toBeVisible()
  await expect(page.getByTestId('board-load-error')).toBeVisible()

  // L'API répond de nouveau : le tableau s'affiche sans recharger la page
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.getByTestId('btn-retry-load').click()

  await expect(taskBoard.column(A_FAIRE)).toHaveCount(1)
  await expect(page.getByTestId('board-load-error')).toHaveCount(0)
})

test("garde la carte affichée si l'archivage est refusé", async ({ taskBoard, page }) => {
  const title = `Archive ${uid()}`

  await taskBoard.createTask(A_FAIRE, { title })
  await failApi(page, 'PUT', `${API}/tasks/*`)

  await taskBoard.archiveTask(title)

  await expect(page.getByText('Archivage impossible').first()).toBeVisible()
  await expect(taskBoard.taskCard(title)).toBeVisible()
})
