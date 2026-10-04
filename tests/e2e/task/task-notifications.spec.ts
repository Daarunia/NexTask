import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du planificateur de notifications (§10 de la spec).
 *
 * Le cron automatique est désactivé en mode `--test` ; chaque test déclenche un
 * passage de façon déterministe via l'endpoint test-only POST /test/run-notifications.
 *
 * Isolation : la base est remise à zéro avant chaque test (fixture automatique `cleanState`),
 * donc on part d'un tableau propre avec seulement les colonnes seedées.
 */

const DAY = 24 * 60 * 60 * 1000

/** Récupère l'id d'une colonne seedée pour rattacher les tâches créées. */
async function firstStageId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as { id: number }[]
  expect(stages.length).toBeGreaterThan(0)
  return stages[0].id
}

/** Crée une tâche via l'API et renvoie l'objet créé. */
async function createTask(
  request: APIRequestContext,
  stageId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; notifiedAt: string | null }> {
  const res = await request.post(`${API}/tasks`, {
    data: {
      stageId,
      position: 0,
      title: 'Notif test',
      version: '1.0.0',
      description: 'desc',
      ...overrides,
    },
  })
  expect(res.ok()).toBeTruthy()
  return res.json()
}

async function getTask(request: APIRequestContext, id: number): Promise<{ notifiedAt: string | null }> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok()).toBeTruthy()
  return res.json()
}

/** Déclenche un passage du planificateur et renvoie le nombre de tâches notifiées. */
async function runNotifications(request: APIRequestContext): Promise<number> {
  const res = await request.post(`${API}/test/run-notifications`, { data: {} })
  expect(res.ok()).toBeTruthy()
  const { count } = (await res.json()) as { count: number }
  return count
}

const pastDate = () => new Date(Date.now() - DAY).toISOString()
const futureDate = () => new Date(Date.now() + DAY).toISOString()

test('notifie les tâches dont la startDate est dépassée et marque notifiedAt', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)

  const overdue = await createTask(request, stageId, { title: 'Échue', startDate: pastDate() })
  const upcoming = await createTask(request, stageId, { title: 'À venir', startDate: futureDate() })

  // À la création, aucune tâche n'est encore notifiée.
  expect(overdue.notifiedAt).toBeFalsy()

  // Seule la tâche échue est notifiée.
  expect(await runNotifications(request)).toBe(1)

  expect((await getTask(request, overdue.id)).notifiedAt).toBeTruthy()
  expect((await getTask(request, upcoming.id)).notifiedAt).toBeFalsy()
})

test('ignore les tâches sans startDate et les tâches archivées', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)

  // startDate nulle → jamais notifiée.
  const noDate = await createTask(request, stageId, { title: 'Sans date' })

  // startDate passée mais tâche archivée → jamais notifiée.
  const archived = await createTask(request, stageId, { title: 'Archivée', startDate: pastDate() })
  const putRes = await request.put(`${API}/tasks/${archived.id}`)
  expect(putRes.ok()).toBeTruthy()

  expect(await runNotifications(request)).toBe(0)
  expect((await getTask(request, noDate.id)).notifiedAt).toBeFalsy()
})

test('ne re-notifie pas une tâche déjà notifiée (idempotence)', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)

  await createTask(request, stageId, { title: 'Échue', startDate: pastDate() })

  expect(await runNotifications(request)).toBe(1)
  // Un second passage ne remonte plus rien.
  expect(await runNotifications(request)).toBe(0)
})

test('repousser startDate dans le futur réarme notifiedAt', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)

  const task = await createTask(request, stageId, { title: 'À replanifier', startDate: pastDate() })

  // Première notification → notifiedAt renseigné.
  expect(await runNotifications(request)).toBe(1)
  expect((await getTask(request, task.id)).notifiedAt).toBeTruthy()

  // startDate repoussée dans le futur → notifiedAt remis à null.
  const patchRes = await request.patch(`${API}/tasks/${task.id}`, {
    data: { startDate: futureDate() },
  })
  expect(patchRes.ok()).toBeTruthy()
  expect((await getTask(request, task.id)).notifiedAt).toBeFalsy()
})

test('modifier startDate vers le passé ne réarme pas notifiedAt', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)

  const task = await createTask(request, stageId, { title: 'Déjà notifiée', startDate: pastDate() })

  expect(await runNotifications(request)).toBe(1)

  // Nouvelle startDate encore dans le passé → notifiedAt inchangé.
  const patchRes = await request.patch(`${API}/tasks/${task.id}`, {
    data: { startDate: new Date(Date.now() - 2 * DAY).toISOString() },
  })
  expect(patchRes.ok()).toBeTruthy()
  expect((await getTask(request, task.id)).notifiedAt).toBeTruthy()
})

/** Simule le clic sur une notification qui annonçait ces tâches. */
async function clickNotification(request: APIRequestContext, taskIds: number[]) {
  const res = await request.post(`${API}/test/click-notification`, { data: { taskIds } })
  expect(res.ok()).toBeTruthy()
}

test("le clic sur la notification d'une seule tâche l'ouvre en édition", async ({ page, taskBoard }) => {
  const stageId = await firstStageId(page.request)
  const task = await createTask(page.request, stageId, { title: 'Ouverte par notif', startDate: pastDate() })

  // Tâche créée par l'API : rechargement pour l'afficher au tableau
  await page.reload()
  await expect(taskBoard.taskCard('Ouverte par notif')).toBeVisible()

  await clickNotification(page.request, [task.id])

  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('Ouverte par notif')
})

test('le clic ramène au tableau depuis une autre page avant d’ouvrir la tâche', async ({ page, header, taskBoard }) => {
  const stageId = await firstStageId(page.request)
  const task = await createTask(page.request, stageId, { title: 'Depuis paramètres', startDate: pastDate() })

  await page.reload()
  await header.settingsButton.click()
  await expect(page.getByTestId('stage-column')).toHaveCount(0)

  await clickNotification(page.request, [task.id])

  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('Depuis paramètres')
})

test("le clic sur une notification de plusieurs tâches n'en ouvre aucune", async ({ page, taskBoard }) => {
  const stageId = await firstStageId(page.request)
  const first = await createTask(page.request, stageId, { title: 'Groupée 1', startDate: pastDate() })
  const second = await createTask(page.request, stageId, { title: 'Groupée 2', startDate: pastDate() })

  await page.reload()
  await expect(taskBoard.taskCard('Groupée 1')).toBeVisible()

  await clickNotification(page.request, [first.id, second.id])

  // Le tableau reste affiché, sans dialogue
  await expect(taskBoard.taskCard('Groupée 2')).toBeVisible()
  await expect(taskBoard.dialog).toBeHidden()
})

test('rappels désactivés : les tâches échues sont marquées sans notification, sans rafale à la réactivation', async ({
  page,
}) => {
  const { request } = page
  const stageId = await firstStageId(request)
  const task = await createTask(request, stageId, { title: 'Muette', startDate: pastDate() })

  await page.evaluate(() => (globalThis as any).settings.set('notificationsEnabled', false))

  const res = await request.post(`${API}/test/run-notifications`, { data: {} })
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toEqual({ count: 1, shown: false, style: null })
  expect((await getTask(request, task.id)).notifiedAt).toBeTruthy()

  // Réactivés : la tâche déjà marquée ne ressort pas
  await page.evaluate(() => (globalThis as any).settings.set('notificationsEnabled', true))
  expect(await runNotifications(request)).toBe(0)
})

test('repousser startDate dans le futur par le batch réarme notifiedAt', async ({ page }) => {
  const { request } = page
  const stageId = await firstStageId(request)
  const task = await createTask(request, stageId, { title: 'Replanifiée en batch', startDate: pastDate() })

  expect(await runNotifications(request)).toBe(1)

  const res = await request.patch(`${API}/tasks/batch`, { data: [{ id: task.id, startDate: futureDate() }] })
  expect(res.ok()).toBeTruthy()
  expect((await getTask(request, task.id)).notifiedAt).toBeFalsy()
})
