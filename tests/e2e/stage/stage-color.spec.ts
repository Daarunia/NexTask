import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la couleur d'une colonne : `PATCH /stages/:id` (couleur de la
 * palette des tags ou null), export et import des données, et sous-menu
 * « Couleur » du menu d'une colonne, qui pose un liseré gardé au rechargement.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

interface ApiStage {
  id: number
  name: string
  color: string | null
}

/**
 * Colonne `COLUMN` telle qu'en base.
 * @param request Contexte de requête Playwright
 */
async function column(request: APIRequestContext): Promise<ApiStage> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
  return stages.find((stage) => stage.name === COLUMN)!
}

test.describe('PATCH /stages/:id', () => {
  test.use({ ui: false })

  test('pose, refuse puis retire une couleur', async ({ request }) => {
    const { id, color } = await column(request)
    expect(color).toBeNull()

    const res = await request.patch(`${API}/stages/${id}`, { data: { color: 'teal' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id, color: 'teal' })

    // Hors de la palette
    expect((await request.patch(`${API}/stages/${id}`, { data: { color: 'pink' } })).status()).toBe(400)
    expect((await column(request)).color).toBe('teal')

    await request.patch(`${API}/stages/${id}`, { data: { color: null } })
    expect((await column(request)).color).toBeNull()
  })

  test('la couleur passe par l’export et l’import, une couleur inconnue est ignorée', async ({ request }) => {
    const { id } = await column(request)
    await request.patch(`${API}/stages/${id}`, { data: { color: 'rose' } })

    const exported = await (await request.get(`${API}/data/export`)).json()
    expect(exported.stages.find((stage: ApiStage) => stage.id === id).color).toBe('rose')

    // Couleur inconnue sur une colonne, champ absent sur une autre (ancien export)
    exported.stages[0].color = 'pink'
    delete exported.stages[1].color
    expect((await request.post(`${API}/data/import`, { data: exported })).ok()).toBeTruthy()

    const stages = (await (await request.get(`${API}/stages`)).json()) as ApiStage[]
    expect(stages.find((stage) => stage.id === exported.stages[0].id)!.color).toBeNull()
    expect(stages.find((stage) => stage.id === exported.stages[1].id)!.color).toBeNull()
  })
})

test('le menu d’une colonne lui donne une couleur, gardée au rechargement', async ({ page, taskBoard }) => {
  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Couleur' }).click()
  await page.getByRole('menuitem', { name: 'Turquoise' }).click()

  await expect(taskBoard.column(COLUMN)).toHaveAttribute('data-color', 'teal')
  await expect.poll(async () => (await column(page.request)).color).toBe('teal')

  await page.reload()
  await expect(taskBoard.column(COLUMN)).toHaveAttribute('data-color', 'teal')

  await taskBoard.openStageMenu(COLUMN)
  await page.getByRole('menuitem', { name: 'Couleur' }).click()
  await page.getByRole('menuitem', { name: 'Aucune' }).click()
  await expect(taskBoard.column(COLUMN)).not.toHaveAttribute('data-color')
  await expect.poll(async () => (await column(page.request)).color).toBeNull()
})
