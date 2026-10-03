import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'
import { getTags, type Task } from '../../helpers/tag.helper'

/**
 * Tests E2E des tâches archivées : filtre d'historisation de GET /tasks,
 * restauration (POST /tasks/:id/restore), page des archives ouverte depuis les
 * Paramètres (liste, restauration, suppression définitive annulable) et purge
 * automatique, déclenchée à la demande via POST /test/run-archive-purge (la
 * maintenance quotidienne ne tourne pas en mode test).
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

const DAY = 24 * 60 * 60 * 1000

// Première colonne seedée (plus petite position, cf. prisma/seeds/01_initial_stages.sql)
const FIRST_COLUMN = 'A faire'

/** Tâche telle que renvoyée par l'API, avec les champs d'archivage. */
type ArchivableTask = Task & { position: number; historizationDate: string | null }

/** Id de la première colonne (plus petite position). */
async function firstStageId(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; position: number }[]
  return [...stages].sort((a, b) => a.position - b.position)[0].id
}

/**
 * Crée une tâche active dans la première colonne.
 * @param request Contexte de requête Playwright
 * @param title Titre
 * @param position Position dans la colonne
 * @param tags Noms des tags
 */
async function createActive(
  request: APIRequestContext,
  title: string,
  position = 0,
  tags: string[] = [],
): Promise<ArchivableTask> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId: await firstStageId(request), position, title, version: '1.0.0', description: '', tags },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ArchivableTask
}

/**
 * Crée une tâche puis l'archive à la date donnée (comme le bouton corbeille :
 * historisée et détachée de sa colonne).
 * @param request Contexte de requête Playwright
 * @param title Titre
 * @param archivedAt Date d'archivage
 * @param tags Noms des tags
 */
async function createArchived(
  request: APIRequestContext,
  title: string,
  archivedAt: Date = new Date(),
  tags: string[] = [],
): Promise<ArchivableTask> {
  const task = await createActive(request, title, 0, tags)
  const res = await request.patch(`${API}/tasks/${task.id}`, {
    data: { isHistorized: true, stageId: null, historizationDate: archivedAt.toISOString() },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as ArchivableTask
}

/** Titres renvoyés par GET /tasks avec la requête donnée, dans l'ordre reçu. */
async function listTitles(request: APIRequestContext, query = ''): Promise<string[]> {
  const res = await request.get(`${API}/tasks${query}`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as Task[]).map((t) => t.title)
}

test.describe("GET /tasks : filtre d'historisation", () => {
  test('isHistorized=true ne renvoie que les tâches archivées, la plus récente en tête', async ({ page }) => {
    await createActive(page.request, 'Active')
    await createArchived(page.request, 'Ancienne', new Date(Date.now() - 3 * DAY))
    await createArchived(page.request, 'Récente', new Date(Date.now() - DAY))
    await createArchived(page.request, 'Moyenne', new Date(Date.now() - 2 * DAY))

    expect(await listTitles(page.request, '?isHistorized=true')).toEqual(['Récente', 'Moyenne', 'Ancienne'])
  })

  test('isHistorized=false ne renvoie que les tâches actives', async ({ page }) => {
    await createActive(page.request, 'Active')
    await createArchived(page.request, 'Archivée')

    expect(await listTitles(page.request, '?isHistorized=false')).toEqual(['Active'])
  })

  test('sans filtre, toutes les tâches sont renvoyées', async ({ page }) => {
    await createActive(page.request, 'Active')
    await createArchived(page.request, 'Archivée')

    expect((await listTitles(page.request)).sort()).toEqual(['Active', 'Archivée'])
  })
})

test.describe('POST /tasks/:id/restore', () => {
  test('restaure la tâche en bas de la première colonne, avec ses tags', async ({ page }) => {
    await createActive(page.request, 'A', 0)
    await createActive(page.request, 'B', 1)
    const archived = await createArchived(page.request, 'C', new Date(), ['bug'])

    const res = await page.request.post(`${API}/tasks/${archived.id}/restore`)
    expect(res.ok(), await res.text()).toBeTruthy()

    const restored = (await res.json()) as ArchivableTask
    expect(restored).toMatchObject({
      id: archived.id,
      isHistorized: false,
      historizationDate: null,
      stageId: await firstStageId(page.request),
      position: 2,
    })
    expect(restored.tags.map((t) => t.name)).toEqual(['bug'])
  })

  test('404 pour une tâche inexistante', async ({ page }) => {
    const res = await page.request.post(`${API}/tasks/999999/restore`)
    expect(res.status()).toBe(404)
  })

  test("409 pour une tâche qui n'est pas archivée", async ({ page }) => {
    const task = await createActive(page.request, 'Active')
    const res = await page.request.post(`${API}/tasks/${task.id}/restore`)
    expect(res.status()).toBe(409)
  })

  test('avec stageId et position, reprend cette place et décale les tâches suivantes', async ({ page }) => {
    const stageId = await firstStageId(page.request)
    await createActive(page.request, 'A', 0)
    const b = await createActive(page.request, 'B', 1)
    const c = await createActive(page.request, 'C', 2)

    // B archivé, puis C remonté à sa place : la position 1 est occupée
    expect((await page.request.put(`${API}/tasks/${b.id}`)).ok()).toBeTruthy()
    expect((await page.request.patch(`${API}/tasks/batch`, { data: [{ id: c.id, position: 1 }] })).ok()).toBeTruthy()

    const res = await page.request.post(`${API}/tasks/${b.id}/restore?stageId=${stageId}&position=1`)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: b.id, isHistorized: false, stageId, position: 1 })

    const active = (await (await page.request.get(`${API}/tasks?isHistorized=false`)).json()) as ArchivableTask[]
    expect(active.map((t) => [t.title, t.position])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
    ])
  })

  test('colonne supprimée entre-temps : restaurée en bas de la première colonne', async ({ page }) => {
    await createActive(page.request, 'A', 0)
    const archived = await createArchived(page.request, 'Orpheline')

    const res = await page.request.post(`${API}/tasks/${archived.id}/restore?stageId=999999&position=0`)
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await res.json()).toMatchObject({ stageId: await firstStageId(page.request), position: 1 })
  })

  test('400 pour une colonne sans position (ou une position sans colonne)', async ({ page }) => {
    const archived = await createArchived(page.request, 'Archivée')

    expect((await page.request.post(`${API}/tasks/${archived.id}/restore?stageId=1`)).status()).toBe(400)
    expect((await page.request.post(`${API}/tasks/${archived.id}/restore?position=0`)).status()).toBe(400)
  })
})

test.describe('Page des archives', () => {
  test('ouverte depuis les Paramètres, vide par défaut', async ({ header, settingsPage, archivesPage }) => {
    await header.goSettings()
    await settingsPage.openArchivesButton.click()

    await archivesPage.expectVisible()
    await expect(archivesPage.empty).toBeVisible()
    await expect(archivesPage.count).toHaveText('0')

    // Retour aux Paramètres
    await archivesPage.backButton.click()
    await settingsPage.expectVisible()
  })

  test('liste titre, date et tags, de la plus récente à la plus ancienne', async ({
    page,
    header,
    settingsPage,
    archivesPage,
  }) => {
    const older = new Date(Date.now() - 5 * DAY)
    const newer = new Date(Date.now() - DAY)
    await createActive(page.request, 'Toujours active')
    await createArchived(page.request, 'Ancienne', older, ['ui'])
    await createArchived(page.request, 'Récente', newer, ['bug', 'ui'])

    await header.goSettings()
    await settingsPage.openArchivesButton.click()

    await expect.poll(() => archivesPage.titleList()).toEqual(['Récente', 'Ancienne'])
    await expect(archivesPage.count).toHaveText('2')
    await expect(archivesPage.date('Récente')).toHaveAttribute('datetime', newer.toISOString())
    await expect(archivesPage.date('Ancienne')).toHaveAttribute('datetime', older.toISOString())
    await expect(archivesPage.date('Récente')).toContainText('Archivée le')
    await expect(archivesPage.tags('Récente')).toHaveText(['bug', 'ui'])
    await expect(archivesPage.tags('Ancienne')).toHaveText(['ui'])
  })

  test('restaurer remet la tâche en bas de la première colonne du tableau', async ({
    page,
    header,
    taskBoard,
    settingsPage,
    archivesPage,
  }) => {
    await createActive(page.request, 'A', 0)
    await createActive(page.request, 'B', 1)
    await createArchived(page.request, 'Restaurée')

    // Tableau relu après la préparation par l'API
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(FIRST_COLUMN)).toEqual(['A', 'B'])

    await header.goSettings()
    await settingsPage.openArchivesButton.click()
    await archivesPage.restore('Restaurée')

    await expect(archivesPage.item('Restaurée')).toHaveCount(0)
    await expect(archivesPage.empty).toBeVisible()

    await header.goHome()
    await expect.poll(() => taskBoard.columnTaskTitles(FIRST_COLUMN)).toEqual(['A', 'B', 'Restaurée'])

    // Même ordre une fois le tableau relu en base
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(FIRST_COLUMN)).toEqual(['A', 'B', 'Restaurée'])
  })

  test('une tâche archivée depuis le tableau se restaure sans rechargement', async ({
    header,
    taskBoard,
    settingsPage,
    archivesPage,
  }) => {
    await taskBoard.createTask('En cours', { title: 'Aller-retour' })
    await taskBoard.createTask(FIRST_COLUMN, { title: 'Déjà là' })
    await taskBoard.archiveTask('Aller-retour')
    await expect(taskBoard.taskCard('Aller-retour')).toHaveCount(0)

    await header.goSettings()
    await settingsPage.openArchivesButton.click()
    await expect.poll(() => archivesPage.titleList()).toEqual(['Aller-retour'])
    await archivesPage.restore('Aller-retour')
    await expect(archivesPage.empty).toBeVisible()

    // Restaurée dans la première colonne, pas dans sa colonne d'origine
    await header.goHome()
    await expect.poll(() => taskBoard.columnTaskTitles(FIRST_COLUMN)).toEqual(['Déjà là', 'Aller-retour'])
    await expect.poll(() => taskBoard.columnTaskTitles('En cours')).toEqual([])
  })

  test('la suppression définitive peut être annulée tant que le toast est affiché', async ({
    page,
    header,
    settingsPage,
    archivesPage,
    undoToast,
  }) => {
    const task = await createArchived(page.request, 'À supprimer', new Date(), ['bug'])

    await header.goSettings()
    await settingsPage.openArchivesButton.click()

    // Masquée tout de suite, mais pas encore supprimée en base
    await archivesPage.delete('À supprimer')
    await expect(archivesPage.item('À supprimer')).toHaveCount(0)
    await expect(archivesPage.empty).toBeVisible()
    await expect(undoToast.toast('À supprimer')).toContainText('Tâche supprimée')
    expect((await page.request.get(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()

    // Annuler : la tâche revient
    await undoToast.undo('À supprimer')
    await expect(undoToast.toast('À supprimer')).toHaveCount(0)
    await expect(archivesPage.item('À supprimer')).toBeVisible()
    await expect(archivesPage.count).toHaveText('1')
    expect((await page.request.get(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
  })

  test('sans annulation, la tâche est supprimée à la fermeture du toast', async ({
    page,
    header,
    settingsPage,
    archivesPage,
    undoToast,
  }) => {
    const task = await createArchived(page.request, 'À supprimer', new Date(), ['bug'])

    await header.goSettings()
    await settingsPage.openArchivesButton.click()
    await archivesPage.delete('À supprimer')
    await undoToast.waitForExpiry('À supprimer')

    await expect.poll(async () => (await page.request.get(`${API}/tasks/${task.id}`)).status()).toBe(404)
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'bug', taskCount: 0 })])

    // Toujours absente une fois la liste relue
    await page.reload()
    await expect(archivesPage.empty).toBeVisible()
  })
})

test.describe('Purge automatique des archives', () => {
  test('désactivée par défaut : aucune tâche archivée supprimée', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.archivePurgeSwitch).not.toBeChecked()
    await expect(settingsPage.archivePurgeDaysOption('90 jours')).toHaveAttribute('aria-pressed', 'true')
    await expect(settingsPage.archivePurgeDaysOption('30 jours')).toBeDisabled()

    const old = await createArchived(page.request, 'Très ancienne', new Date(Date.now() - 400 * DAY))

    const res = await page.request.post(`${API}/test/run-archive-purge`, { data: {} })
    expect(await res.json()).toEqual({ enabled: false, count: 0 })
    expect((await page.request.get(`${API}/tasks/${old.id}`)).ok()).toBeTruthy()
  })

  test('activée : seules les tâches archivées depuis plus longtemps que la durée choisie partent', async ({
    page,
    header,
    settingsPage,
    archivesPage,
  }) => {
    await header.goSettings()
    await settingsPage.archivePurgeSwitch.click()
    await expect(settingsPage.archivePurgeSwitch).toBeChecked()
    await settingsPage.archivePurgeDaysOption('30 jours').click()
    await expect(settingsPage.archivePurgeDaysOption('30 jours')).toHaveAttribute('aria-pressed', 'true')

    const active = await createActive(page.request, 'Active')
    const expired = await createArchived(page.request, 'Expirée', new Date(Date.now() - 40 * DAY))
    const recent = await createArchived(page.request, 'Récente', new Date(Date.now() - 10 * DAY))

    const res = await page.request.post(`${API}/test/run-archive-purge`, { data: {} })
    expect(await res.json()).toEqual({ enabled: true, count: 1 })

    expect((await page.request.get(`${API}/tasks/${expired.id}`)).status()).toBe(404)
    expect((await page.request.get(`${API}/tasks/${recent.id}`)).ok()).toBeTruthy()
    expect((await page.request.get(`${API}/tasks/${active.id}`)).ok()).toBeTruthy()

    await settingsPage.openArchivesButton.click()
    await expect.poll(() => archivesPage.titleList()).toEqual(['Récente'])
  })

  test('la date de référence fixe la limite de la purge', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.archivePurgeSwitch.click()
    await expect(settingsPage.archivePurgeSwitch).toBeChecked()

    // Archivée il y a 10 jours : conservée aujourd'hui avec 90 jours, purgée 100 jours plus tard
    const task = await createArchived(page.request, 'Bientôt purgée', new Date(Date.now() - 10 * DAY))

    let res = await page.request.post(`${API}/test/run-archive-purge`, { data: {} })
    expect(await res.json()).toEqual({ enabled: true, count: 0 })

    res = await page.request.post(`${API}/test/run-archive-purge`, {
      data: { now: new Date(Date.now() + 100 * DAY).toISOString() },
    })
    expect(await res.json()).toEqual({ enabled: true, count: 1 })
    expect((await page.request.get(`${API}/tasks/${task.id}`)).status()).toBe(404)
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.archivePurgeSwitch.click()
    await expect(settingsPage.archivePurgeSwitch).toBeChecked()
    await settingsPage.archivePurgeDaysOption('1 an').click()
    await expect(settingsPage.archivePurgeDaysOption('1 an')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()

    await expect(settingsPage.archivePurgeSwitch).toBeChecked()
    await expect(settingsPage.archivePurgeDaysOption('1 an')).toHaveAttribute('aria-pressed', 'true')
  })
})
