import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des réglages Notifications et Démarrage de la page Paramètres.
 *
 * L'icône de la zone de notification et l'inscription au démarrage de l'OS ne
 * sont jamais créées en mode test, et la taille de la fenêtre n'y est ni
 * enregistrée ni restaurée : seuls l'état des réglages et leur persistance
 * sont vérifiés ici. Les rappels, eux, sont observés via le
 * passage manuel du planificateur (POST /test/run-notifications).
 */

const DAY = 24 * 60 * 60 * 1000

/** Crée une tâche dont la date de début est passée, et renvoie son id. */
async function createOverdueTask(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number }[]
  const res = await request.post(`${API}/tasks`, {
    data: {
      stageId: stages[0].id,
      position: 0,
      title: 'Échue',
      version: '1.5.0',
      description: '',
      startDate: new Date(Date.now() - DAY).toISOString(),
    },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: number }).id
}

test.describe('Notifications', () => {
  test('les rappels sont activés par défaut', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.notificationsSwitch).toBeChecked()
  })

  test('rappels désactivés : la tâche échue est marquée sans notification', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.notificationsSwitch.click()
    await expect(settingsPage.notificationsSwitch).not.toBeChecked()

    const id = await createOverdueTask(page.request)
    const res = await page.request.post(`${API}/test/run-notifications`, { data: {} })
    expect(await res.json()).toEqual({ count: 1, shown: false, style: null, title: null })

    // Marquée quand même : elle ne ressortira pas à la réactivation
    const task = (await (await page.request.get(`${API}/tasks/${id}`)).json()) as { notifiedAt: string | null }
    expect(task.notifiedAt).toBeTruthy()
  })

  test('le réglage est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.notificationsSwitch.click()
    await expect(settingsPage.notificationsSwitch).not.toBeChecked()

    await page.reload()

    await expect(settingsPage.notificationsSwitch).not.toBeChecked()
  })
})

test.describe('Style des rappels', () => {
  test('persistante par défaut, désactivé avec les rappels', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.notificationStyleOption('Persistante')).toHaveAttribute('aria-pressed', 'true')

    await settingsPage.notificationsSwitch.click()
    await expect(settingsPage.notificationStyleOption('Temporaire')).toBeDisabled()
  })

  test('la notification envoyée suit le style choisi', async ({ page, header, settingsPage }) => {
    await header.goSettings()

    // Style par défaut : toast « reminder » qui reste à l'écran (Windows)
    await createOverdueTask(page.request)
    let res = await page.request.post(`${API}/test/run-notifications`, { data: {} })
    expect(await res.json()).toEqual({ count: 1, shown: true, style: 'reminder', title: 'Tâches à démarrer (1)' })

    await settingsPage.notificationStyleOption('Temporaire').click()
    await expect(settingsPage.notificationStyleOption('Temporaire')).toHaveAttribute('aria-pressed', 'true')

    await createOverdueTask(page.request)
    res = await page.request.post(`${API}/test/run-notifications`, { data: {} })
    expect(await res.json()).toEqual({ count: 1, shown: true, style: 'default', title: 'Tâches à démarrer (1)' })
  })

  test('le style est conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.notificationStyleOption('Temporaire').click()
    await expect(settingsPage.notificationStyleOption('Temporaire')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()

    await expect(settingsPage.notificationStyleOption('Temporaire')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Démarrage et arrière-plan', () => {
  test('tout est désactivé par défaut, « démarrer réduite » attend le lancement au démarrage', async ({
    header,
    settingsPage,
  }) => {
    await header.goSettings()

    await expect(settingsPage.traySwitch).not.toBeChecked()
    await expect(settingsPage.startupSwitch).not.toBeChecked()
    await expect(settingsPage.minimizedSwitch).not.toBeChecked()
    await expect(settingsPage.minimizedSwitch).toBeDisabled()

    await settingsPage.startupSwitch.click()
    await expect(settingsPage.minimizedSwitch).toBeEnabled()
  })

  test("la fenêtre s'ouvre maximisée par défaut, le choix est conservé après un rechargement", async ({
    page,
    header,
    settingsPage,
  }) => {
    await header.goSettings()
    await expect(settingsPage.windowModeOption('Maximisée')).toHaveAttribute('aria-pressed', 'true')

    await settingsPage.windowModeOption('Dernière taille').click()
    await expect(settingsPage.windowModeOption('Dernière taille')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()

    await expect(settingsPage.windowModeOption('Dernière taille')).toHaveAttribute('aria-pressed', 'true')
  })

  test('les réglages sont conservés après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.traySwitch.click()
    await settingsPage.startupSwitch.click()
    await settingsPage.minimizedSwitch.click()
    await expect(settingsPage.minimizedSwitch).toBeChecked()

    await page.reload()

    await expect(settingsPage.traySwitch).toBeChecked()
    await expect(settingsPage.startupSwitch).toBeChecked()
    await expect(settingsPage.minimizedSwitch).toBeChecked()
  })
})
