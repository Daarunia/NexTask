import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  DAILY,
  createRecurringTask,
  getTask,
  localDate,
  plusMinutes,
  runRecurrences,
  seriesTasks,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de la section « Tâches récurrentes » des Paramètres : liste des
 * séries (GET /recurrences), mise en pause, reprise, arrêt avec annulation et
 * réactivation, et leur effet sur l'icône des cartes du tableau.
 *
 * Les séries sont préparées par l'API, puis la page est rechargée pour que le
 * tableau les connaisse.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/**
 * Change l'état d'une série via PATCH /recurrences/:id.
 * @param request Contexte de requête Playwright
 * @param id Id de la série
 * @param status Nouvel état
 */
async function setStatus(request: APIRequestContext, id: number, status: string) {
  const res = await request.patch(`${API}/recurrences/${id}`, { data: { status } })
  expect(res.ok(), await res.text()).toBeTruthy()
}

test.describe('Liste des séries', () => {
  test('sans série, la liste invite à en créer depuis une tâche', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.recurrencesEmpty).toBeVisible()
    await expect(settingsPage.recurrenceItems).toHaveCount(0)
  })

  test('GET /recurrences : séries en cours puis terminées, avec le titre du modèle', async ({ page }) => {
    const beta = await createRecurringTask(page.request, { title: 'Bêta', startDate: localDate(1), recurrence: DAILY })
    const alpha = await createRecurringTask(page.request, {
      title: 'alpha',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const stopped = await createRecurringTask(page.request, {
      title: 'Arrêtée',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await setStatus(page.request, stopped.recurrenceId!, 'ended')
    await setStatus(page.request, beta.recurrenceId!, 'paused')

    const res = await page.request.get(`${API}/recurrences`)
    expect(res.ok()).toBeTruthy()
    const list = (await res.json()) as { id: number; title: string; status: string; frequency: string }[]
    expect(list.map(({ title, status }) => [title, status])).toEqual([
      ['alpha', 'active'],
      ['Bêta', 'paused'],
      ['Arrêtée', 'ended'],
    ])
    expect(list[0]).toMatchObject({ id: alpha.recurrenceId, frequency: 'daily', nextRunAt: localDate(2).toISOString() })
  })

  test('colonnes : tâche, règle, prochaine date ou état', async ({ page, header, settingsPage }) => {
    await createRecurringTask(page.request, {
      title: 'Hebdo',
      startDate: localDate(1),
      recurrence: { frequency: 'weekly', interval: 2, weekdays: [2, 4], endType: 'never', skipIfPending: true },
    })
    const paused = await createRecurringTask(page.request, {
      title: 'Pause',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await setStatus(page.request, paused.recurrenceId!, 'paused')
    // Une seule occurrence : terminée dès sa création, sans rien à réactiver
    await createRecurringTask(page.request, {
      title: 'Unique',
      startDate: localDate(1),
      recurrence: { ...DAILY, endType: 'afterCount', maxCount: 1 },
    })
    const stopped = await createRecurringTask(page.request, {
      title: 'Arrêtée',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await setStatus(page.request, stopped.recurrenceId!, 'ended')

    await header.goSettings()
    await expect.poll(() => settingsPage.recurrenceTitles()).toEqual(['Hebdo', 'Pause', 'Arrêtée', 'Unique'])

    const weekly = settingsPage.recurrence('Hebdo')
    await expect(weekly.getByTestId('settings-recurrence-rule')).toHaveText(
      'Toutes les 2 semaines le mardi et le jeudi à 09:00',
    )
    await expect(weekly.getByTestId('settings-recurrence-next')).not.toHaveText(/Terminée|En pause/)
    await expect(weekly.getByTestId('btn-recurrence-pause')).toBeVisible()
    await expect(weekly.getByTestId('btn-recurrence-stop')).toBeVisible()

    const pause = settingsPage.recurrence('Pause')
    await expect(pause.getByTestId('settings-recurrence-next')).toHaveText('En pause')
    await expect(pause.getByTestId('btn-recurrence-resume')).toBeVisible()
    await expect(pause.getByTestId('btn-recurrence-pause')).toHaveCount(0)

    // Terminée par l'utilisateur : réactivable ; au bout de ses occurrences : non
    await expect(settingsPage.recurrence('Arrêtée').getByTestId('settings-recurrence-next')).toHaveText('Terminée')
    await expect(settingsPage.recurrence('Arrêtée').getByTestId('btn-recurrence-reactivate')).toBeVisible()
    await expect(settingsPage.recurrence('Unique').getByTestId('settings-recurrence-next')).toHaveText('Terminée')
    await expect(settingsPage.recurrence('Unique').getByRole('button')).toHaveCount(0)
  })
})

test.describe('Actions', () => {
  test('pause puis reprise : liste, icônes des cartes et série à jour', async ({
    page,
    header,
    taskBoard,
    settingsPage,
    recurrenceFields,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Pilote',
      startDate: localDate(-5),
      recurrence: DAILY,
    })
    await page.reload()
    const icons = taskBoard.taskCard('Pilote').getByTestId('task-card-recurrence')
    await expect(icons).toHaveCount(1)

    await header.goSettings()
    const row = settingsPage.recurrence('Pilote')
    await row.getByTestId('btn-recurrence-pause').click()
    await expect(row).toHaveAttribute('data-status', 'paused')
    await expect(row.getByTestId('settings-recurrence-next')).toHaveText('En pause')
    expect((await getTask(page.request, origin.id)).recurrence?.status).toBe('paused')

    // Cartes grisées sans recharger, pause rappelée dans l'écran de tâche
    await header.goHome()
    for (const icon of await icons.all()) await expect(icon).toHaveAttribute('data-status', 'paused')
    await expect(icons.first()).toHaveAttribute('title', /\nSérie en pause$/)
    await taskBoard.taskCard('Pilote').first().hover()
    await taskBoard.taskCard('Pilote').first().getByTestId('btn-edit-task').click()
    await expect(recurrenceFields.pausedHint).toBeVisible()
    await expect(recurrenceFields.next).toBeHidden()
    await taskBoard.cancelButton.click()

    // En pause, aucun passage ne crée d'occurrence
    expect(await runRecurrences(page.request, localDate(10))).toMatchObject({ created: 0 })

    await header.goSettings()
    await row.getByTestId('btn-recurrence-resume').click()
    await expect(row).toHaveAttribute('data-status', 'active')
    await expect(row.getByTestId('settings-recurrence-next')).toHaveText(/\d{2}:\d{2}$/)

    // Reprise sans rattrapage : prochaine date après maintenant
    const resumed = (await getTask(page.request, origin.id)).recurrence!
    expect(resumed.status).toBe('active')
    expect(resumed.nextRunAt).toBe(localDate(new Date().getHours() < 9 ? 0 : 1).toISOString())
    expect(await runRecurrences(page.request, plusMinutes(new Date(), 1))).toMatchObject({ created: 0 })

    await header.goHome()
    for (const icon of await icons.all()) await expect(icon).toHaveAttribute('data-status', 'active')
  })

  test('arrêt puis annulation : la série retrouve son état', async ({
    page,
    header,
    taskBoard,
    settingsPage,
    undoToast,
  }) => {
    const active = await createRecurringTask(page.request, {
      title: 'Active',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const paused = await createRecurringTask(page.request, {
      title: 'Suspendue',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await setStatus(page.request, paused.recurrenceId!, 'paused')
    await page.reload()

    await header.goSettings()

    // Série active : arrêtée, puis relancée par « Annuler »
    await settingsPage.recurrence('Active').getByTestId('btn-recurrence-stop').click()
    await expect(settingsPage.recurrence('Active')).toHaveAttribute('data-status', 'ended')
    await expect(settingsPage.recurrence('Active').getByTestId('settings-recurrence-next')).toHaveText('Terminée')
    expect((await getTask(page.request, active.id)).recurrence).toMatchObject({ status: 'ended', nextRunAt: null })

    await undoToast.undo('Active')
    await expect(settingsPage.recurrence('Active')).toHaveAttribute('data-status', 'active')
    expect((await getTask(page.request, active.id)).recurrence).toMatchObject({
      status: 'active',
      nextRunAt: localDate(2).toISOString(),
    })

    // Série en pause : arrêtée, puis de nouveau en pause
    await settingsPage.recurrence('Suspendue').getByTestId('btn-recurrence-stop').click()
    await expect(settingsPage.recurrence('Suspendue')).toHaveAttribute('data-status', 'ended')
    await undoToast.undo('Suspendue')
    await expect(settingsPage.recurrence('Suspendue')).toHaveAttribute('data-status', 'paused')
    expect((await getTask(page.request, paused.id)).recurrence?.status).toBe('paused')

    // Arrêt définitif une fois le toast expiré, icône grisée au tableau
    await settingsPage.recurrence('Active').getByTestId('btn-recurrence-stop').click()
    await undoToast.waitForExpiry('Active')
    await header.goHome()
    await expect(taskBoard.taskCard('Active').getByTestId('task-card-recurrence')).toHaveAttribute(
      'data-status',
      'ended',
    )
    expect((await getTask(page.request, active.id)).recurrence?.status).toBe('ended')
  })

  test('réactivation d’une série arrêtée, sans rattrapage', async ({ page, header, taskBoard, settingsPage }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Relancée',
      startDate: localDate(-3),
      recurrence: DAILY,
    })
    await setStatus(page.request, origin.recurrenceId!, 'ended')
    await page.reload()

    await header.goSettings()
    const row = settingsPage.recurrence('Relancée')
    await row.getByTestId('btn-recurrence-reactivate').click()
    await expect(row).toHaveAttribute('data-status', 'active')
    await expect(row.getByTestId('btn-recurrence-reactivate')).toHaveCount(0)

    const resumed = (await getTask(page.request, origin.id)).recurrence!
    expect(new Date(resumed.nextRunAt!).getTime()).toBeGreaterThan(Date.now())
    expect(await runRecurrences(page.request, plusMinutes(new Date(), 1))).toMatchObject({ created: 0 })
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(1)

    await header.goHome()
    await expect(taskBoard.taskCard('Relancée').getByTestId('task-card-recurrence')).toHaveAttribute(
      'data-status',
      'active',
    )
  })
})
