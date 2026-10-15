import type { APIRequestContext, Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de l'ajout rapide : route POST /tasks/quick-add (version et place
 * tirées des paramètres), fenêtre ouverte par le raccourci global et réglage
 * de la page Paramètres.
 *
 * Le raccourci global n'est jamais enregistré en mode test (il le serait pour
 * toute la machine) : la fenêtre est ouverte via POST /test/open-quick-add.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture
 * `cleanState`), qui ferme aussi une fenêtre d'ajout rapide restée ouverte.
 */

// Colonnes seedées (cf. prisma/seeds/fr/01_initial_stages.sql)
const FIRST_COLUMN = 'A faire'
const OTHER_COLUMN = 'En cours'

/** Tâche telle que renvoyée par l'API. */
type ApiTask = {
  id: number
  title: string
  version: string
  description: string
  position: number
  stageId: number
  checklist: { items: { text: string; isChecked: boolean }[] } | null
}

/** Modèle de checklist tel que renvoyé par l'API. */
type ApiTemplate = { id: number; name: string; items: { text: string }[] }

/**
 * Crée un modèle de checklist (aucun modèle après le reset de la base).
 * @param request Contexte de requête Playwright
 * @param name Nom du modèle
 * @param items Textes des points
 */
async function createTemplate(request: APIRequestContext, name: string, items: string[]): Promise<ApiTemplate> {
  const res = await request.post(`${API}/checklist-templates`, { data: { name, items } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ApiTemplate
}

/** Ids des colonnes seedées, par nom. */
async function stageIds(request: APIRequestContext): Promise<Record<string, number>> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  return Object.fromEntries(stages.map((stage) => [stage.name, stage.id]))
}

/**
 * Crée une tâche par la route classique.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne
 * @param title Titre
 * @param position Position dans la colonne
 */
async function createTask(request: APIRequestContext, stageId: number, title: string, position: number) {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position, title, version: '1.4.4', description: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

/**
 * Ajout rapide par l'API.
 * @param request Contexte de requête Playwright
 * @param data Corps de la requête
 */
async function quickAdd(
  request: APIRequestContext,
  data: { title: string; stageId?: number; checklistTemplateId?: number },
): Promise<ApiTask> {
  const res = await request.post(`${API}/tasks/quick-add`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ApiTask
}

/**
 * Ouvre la fenêtre d'ajout rapide, comme le raccourci global.
 * @param electronApp App Electron lancée
 * @param page Fenêtre principale
 * @returns Page de la fenêtre d'ajout rapide, prête à la saisie
 */
async function openQuickAdd(electronApp: ElectronApplication, page: Page): Promise<Page> {
  const [win] = await Promise.all([electronApp.waitForEvent('window'), page.request.post(`${API}/test/open-quick-add`)])
  await expect(win.getByTestId('quick-add-title')).toBeVisible()
  return win
}

test.describe('POST /tasks/quick-add', () => {
  test.use({ ui: false })

  test('crée la tâche en bas de la première colonne, avec la version par défaut', async ({ page }) => {
    const ids = await stageIds(page.request)
    await createTask(page.request, ids[FIRST_COLUMN], 'Existante', 0)

    const task = await quickAdd(page.request, { title: '  Note rapide  ' })

    expect(task).toMatchObject({
      title: 'Note rapide',
      version: '1.5.0',
      description: '',
      stageId: ids[FIRST_COLUMN],
      position: 1,
    })
  })

  test('« en haut » : la tâche prend la position 0, les autres descendent', async ({ page }) => {
    const ids = await stageIds(page.request)
    await createTask(page.request, ids[FIRST_COLUMN], 'A', 0)
    await createTask(page.request, ids[FIRST_COLUMN], 'B', 1)
    await page.evaluate(() => (globalThis as any).settings.set('newTaskPosition', 'top'))

    await quickAdd(page.request, { title: 'En tête' })

    const tasks = (await (await page.request.get(`${API}/tasks?isHistorized=false`)).json()) as ApiTask[]
    expect(tasks.map((t) => [t.title, t.position])).toEqual([
      ['En tête', 0],
      ['A', 1],
      ['B', 2],
    ])
  })

  test('dans la colonne demandée, ou la première si elle a été supprimée', async ({ page }) => {
    const ids = await stageIds(page.request)

    expect(await quickAdd(page.request, { title: 'Ailleurs', stageId: ids[OTHER_COLUMN] })).toMatchObject({
      stageId: ids[OTHER_COLUMN],
    })
    expect(await quickAdd(page.request, { title: 'Perdue', stageId: 999999 })).toMatchObject({
      stageId: ids[FIRST_COLUMN],
    })
  })

  test('409 sans aucune colonne au tableau', async ({ page }) => {
    for (const stageId of Object.values(await stageIds(page.request))) {
      expect((await page.request.delete(`${API}/stages/${stageId}`)).ok()).toBeTruthy()
    }

    const res = await page.request.post(`${API}/tasks/quick-add`, { data: { title: 'Sans colonne' } })
    expect(res.status()).toBe(409)
    expect(await (await page.request.get(`${API}/tasks`)).json()).toEqual([])
  })

  test('avec un modèle, ses points sont copiés décochés dans la tâche', async ({ page }) => {
    const template = await createTemplate(page.request, 'Release', ['Changelog', 'Tests', 'Tag'])

    const task = await quickAdd(page.request, { title: 'Release 2.0', checklistTemplateId: template.id })
    expect(task.checklist!.items).toEqual(
      template.items.map((item) => expect.objectContaining({ text: item.text, isChecked: false })),
    )
  })

  test('un modèle introuvable est ignoré, la tâche est créée sans checklist', async ({ page }) => {
    const task = await quickAdd(page.request, { title: 'Sans modèle', checklistTemplateId: 999999 })
    expect(task.title).toBe('Sans modèle')
    expect(task.checklist).toBeNull()
  })

  test('400 pour un titre vide', async ({ page }) => {
    const res = await page.request.post(`${API}/tasks/quick-add`, { data: { title: '   ' } })
    expect(res.status()).toBe(400)
  })
})

test.describe("Fenêtre d'ajout rapide", () => {
  test('Entrée ajoute la tâche au tableau sans le recharger, puis ferme la fenêtre', async ({
    electronApp,
    page,
    taskBoard,
  }) => {
    const win = await openQuickAdd(electronApp, page)

    const closed = win.waitForEvent('close')
    await win.getByTestId('quick-add-title').fill('Idée soudaine')
    // Touche enfoncée seulement : l'envoi peut fermer la fenêtre avant le relâchement
    await win.keyboard.down('Enter')
    await closed

    await expect.poll(() => taskBoard.columnTaskTitles(FIRST_COLUMN)).toEqual(['Idée soudaine'])
    await expect(taskBoard.columnCount(FIRST_COLUMN)).toHaveText('1')
  })

  test('la colonne choisie reçoit la tâche, en haut si le paramètre le demande', async ({
    electronApp,
    page,
    taskBoard,
  }) => {
    const ids = await stageIds(page.request)
    await createTask(page.request, ids[OTHER_COLUMN], 'Déjà là', 0)
    await page.evaluate(() => (globalThis as any).settings.set('newTaskPosition', 'top'))
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Déjà là'])

    const win = await openQuickAdd(electronApp, page)
    const option = win.getByTestId('quick-add-stage').getByRole('button', { name: OTHER_COLUMN, exact: true })
    await option.click()
    await expect(option).toHaveAttribute('aria-pressed', 'true')

    const closed = win.waitForEvent('close')
    await win.getByTestId('quick-add-title').fill('Urgent')
    // Touche enfoncée seulement : l'envoi peut fermer la fenêtre avant le relâchement
    await win.keyboard.down('Enter')
    await closed

    await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Urgent', 'Déjà là'])

    // Même ordre une fois le tableau relu en base
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(OTHER_COLUMN)).toEqual(['Urgent', 'Déjà là'])
  })

  test('le modèle de checklist choisi remplit la checklist de la tâche', async ({ electronApp, page, taskBoard }) => {
    await createTemplate(page.request, 'Courses', ['Pain'])
    const template = await createTemplate(page.request, 'Release', ['Changelog', 'Tests', 'Tag'])
    const win = await openQuickAdd(electronApp, page)

    const option = win.getByTestId('quick-add-template').getByRole('button', { name: template.name, exact: true })
    await option.click()
    await expect(option).toHaveAttribute('aria-pressed', 'true')

    const closed = win.waitForEvent('close')
    await win.getByTestId('quick-add-title').fill('Release 2.0')
    // Touche enfoncée seulement : l'envoi peut fermer la fenêtre avant le relâchement
    await win.keyboard.down('Enter')
    await closed

    await expect(taskBoard.cardChecklistBadge('Release 2.0')).toHaveText('0/3')
  })

  test('sans modèle avec des points, aucun choix de modèle', async ({ electronApp, page }) => {
    await createTemplate(page.request, 'Vide', [])

    const win = await openQuickAdd(electronApp, page)
    await expect(win.getByTestId('quick-add-stage')).toBeVisible()
    await expect(win.getByTestId('quick-add-template')).toHaveCount(0)
  })

  test('Échap ferme la fenêtre sans rien ajouter', async ({ electronApp, page }) => {
    const win = await openQuickAdd(electronApp, page)

    const closed = win.waitForEvent('close')
    await win.getByTestId('quick-add-title').fill('Abandonnée')
    // Touche enfoncée seulement : la fenêtre se ferme avant le relâchement
    await win.keyboard.down('Escape')
    await closed

    const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as ApiTask[]
    expect(tasks).toEqual([])
  })

  test('un titre vide ne crée rien et laisse la fenêtre ouverte', async ({ electronApp, page }) => {
    const win = await openQuickAdd(electronApp, page)

    await win.getByTestId('quick-add-title').fill('   ')
    await win.getByTestId('quick-add-title').press('Enter')

    await expect(win.getByTestId('quick-add-title')).toBeVisible()
    const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as ApiTask[]
    expect(tasks).toEqual([])
  })
})

test.describe('Réglage « Ajout rapide »', () => {
  test('activé par défaut, avec le raccourci affiché ; le choix est conservé', async ({
    page,
    header,
    settingsPage,
  }) => {
    await header.goSettings()
    await expect(settingsPage.quickAddSwitch).toBeChecked()
    await expect(settingsPage.quickAddRow).toContainText(/Ctrl\+Alt\+N|Cmd\+Option\+N/)

    await settingsPage.quickAddSwitch.click()
    await expect(settingsPage.quickAddSwitch).not.toBeChecked()

    await page.reload()

    await expect(settingsPage.quickAddSwitch).not.toBeChecked()
  })
})
