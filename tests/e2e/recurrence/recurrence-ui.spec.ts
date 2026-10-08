import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { APIRequestContext } from '@playwright/test'
import type { TaskBoard } from '../../components/TaskBoard'
import {
  DAILY,
  createRecurringTask,
  getTask,
  localDate,
  plusMinutes,
  runRecurrences,
  seriesTasks,
  stageIds,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de l'interface des tâches récurrentes : champ « Répéter » de
 * l'écran de tâche (préréglages, règle personnalisée, résumé), icône des
 * cartes et des archives, arrivée des occurrences au tableau, modification
 * et arrêt d'une série avec son annulation.
 *
 * Les occurrences sont créées via POST /test/run-recurrences (le planificateur
 * ne tourne pas en mode test), avec un « maintenant » injecté.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée (cf. prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

// Route des tâches
const API_TASKS = `${API}/tasks`

// Noms des jours, du lundi au dimanche (libellés du préréglage hebdomadaire)
const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/**
 * Date au format affiché par la date de début : « jj/mm/aaaa hh:mm ».
 * @param date Date
 */
function displayed(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Crée une tâche sans répétition, avec une date de début, via l'API.
 * @param request Contexte de requête Playwright
 * @param title Titre
 * @param startDate Date de début
 */
async function createDatedTask(request: APIRequestContext, title: string, startDate: Date): Promise<{ id: number }> {
  const res = await request.post(API_TASKS, {
    data: {
      stageId: (await stageIds(request))[COLUMN],
      position: 0,
      title,
      version: '1.5.0',
      description: '',
      startDate: startDate.toISOString(),
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

/**
 * Ouvre l'écran de tâche de la première carte d'un titre (une série a
 * plusieurs cartes du même titre).
 * @param taskBoard Objet page du tableau
 * @param title Titre exact
 */
async function openFirstCard(taskBoard: TaskBoard, title: string) {
  const card = taskBoard.taskCard(title).first()
  await card.hover()
  await card.getByTestId('btn-edit-task').click()
  await expect(taskBoard.dialog).toBeVisible()
}

test.describe('Champ « Répéter »', () => {
  test('préréglage : date de début préremplie, résumé, puis icône sur la carte', async ({
    page,
    taskBoard,
    recurrenceFields,
  }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Arrosage')
    await expect(taskBoard.startDateInput).toHaveValue('')

    // Libellés calculés depuis la date de début (aujourd'hui sans date)
    await recurrenceFields.select.click()
    const today = new Date()
    await expect(
      page.getByRole('option', { name: `Toutes les semaines le ${WEEKDAY_NAMES[(today.getDay() + 6) % 7]}` }),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    // Une répétition rend la date obligatoire : aujourd'hui à 09:00
    await recurrenceFields.choose('Tous les jours')
    await expect(taskBoard.startDateInput).toHaveValue(displayed(localDate(0)))
    await expect(recurrenceFields.summary).toHaveText('Tous les jours à 09:00')
    await expect(recurrenceFields.next).toContainText('Prochaine :')

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    const icon = taskBoard.taskCard('Arrosage').getByTestId('task-card-recurrence')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveAttribute('data-status', 'active')
    await expect(icon).toHaveAttribute('aria-label', /^Tous les jours à 09:00\nProchaine : /)

    const [task] = (await (await page.request.get(`${API_TASKS}`)).json()) as { id: number }[]
    expect((await getTask(page.request, task.id)).recurrence).toMatchObject({ frequency: 'daily', interval: 1 })
  })

  test('règle personnalisée enregistrée puis relue à l’identique', async ({ page, taskBoard, recurrenceFields }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Revue')
    await recurrenceFields.choose('Personnaliser…')
    await expect(recurrenceFields.custom).toBeVisible()

    await recurrenceFields.setEvery(2, 'semaines')
    await recurrenceFields.setWeekdays([2, 4])
    await recurrenceFields.endAfter(5)
    await recurrenceFields.skipIfPending.uncheck()
    await expect(recurrenceFields.summary).toHaveText('Toutes les 2 semaines le mardi et le jeudi à 09:00, 5 fois')

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    const [created] = (await (await page.request.get(`${API_TASKS}`)).json()) as { id: number }[]
    expect((await getTask(page.request, created.id)).recurrence).toMatchObject({
      frequency: 'weekly',
      interval: 2,
      weekdays: '2,4',
      endType: 'afterCount',
      maxCount: 5,
      skipIfPending: false,
    })

    // Réouverture : mêmes valeurs
    await taskBoard.openEditDialog('Revue')
    await expect(recurrenceFields.select).toHaveText('Personnaliser…')
    await expect(recurrenceFields.interval).toHaveValue('2')
    await expect(recurrenceFields.unit).toHaveText('semaines')
    expect(await recurrenceFields.selectedWeekdays()).toEqual([2, 4])
    await expect(recurrenceFields.endAfterCount).toBeChecked()
    await expect(recurrenceFields.endCount).toHaveValue('5')
    await expect(recurrenceFields.skipIfPending).not.toBeChecked()
    await expect(recurrenceFields.summary).toHaveText('Toutes les 2 semaines le mardi et le jeudi à 09:00, 5 fois')

    // Enregistrer sans rien changer ne touche pas à la série
    const before = (await getTask(page.request, created.id)).recurrence
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    expect((await getTask(page.request, created.id)).recurrence).toEqual(before)
  })

  test('une série existante réaffiche son préréglage', async ({ page, taskBoard, recurrenceFields }) => {
    await createRecurringTask(page.request, {
      title: 'Hebdo',
      startDate: localDate(1),
      recurrence: {
        frequency: 'weekly',
        interval: 1,
        weekdays: [localDate(1).getDay() || 7],
        endType: 'never',
        skipIfPending: true,
      },
    })
    await page.reload()

    await taskBoard.openEditDialog('Hebdo')
    await expect(recurrenceFields.select).toHaveText(
      `Toutes les semaines le ${WEEKDAY_NAMES[(localDate(1).getDay() + 6) % 7]}`,
    )
    await expect(recurrenceFields.custom).toBeHidden()
    await expect(recurrenceFields.next).toContainText('Prochaine :')
  })

  test('validation : au moins un jour en hebdomadaire', async ({ taskBoard, recurrenceFields }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Invalide')
    await recurrenceFields.choose('Personnaliser…')
    await recurrenceFields.setWeekdays([])

    await taskBoard.saveButton.click()
    await expect(recurrenceFields.error).toHaveText('Choisis au moins un jour de la semaine')
    await expect(taskBoard.dialog).toBeVisible()

    await recurrenceFields.setWeekdays([1])
    await expect(recurrenceFields.error).toBeHidden()
  })

  test('indication pour un mensuel un jour 29, 30 ou 31', async ({ page, taskBoard, recurrenceFields }) => {
    // Série du 31 : le 31 janvier de cette année
    const date = new Date(new Date().getFullYear(), 0, 31, 9, 0)
    await createRecurringTask(page.request, {
      title: 'Fin de mois',
      startDate: date,
      recurrence: { frequency: 'monthly', interval: 1, endType: 'never', skipIfPending: true },
    })
    await page.reload()

    await taskBoard.openEditDialog('Fin de mois')
    await expect(recurrenceFields.select).toHaveText('Tous les mois le 31')
    await expect(recurrenceFields.monthEndHint).toHaveText(
      "Les mois de moins de 31 jours, l'occurrence tombe le dernier jour du mois.",
    )
  })
})

test.describe('Mensuel personnalisé', () => {
  test('les 3 jours du mois sont enregistrés puis relus à l’identique', async ({
    page,
    taskBoard,
    recurrenceFields,
  }) => {
    // 15 octobre 2026 : un jeudi, le 3e du mois
    const task = await createDatedTask(page.request, 'Mensuelle', new Date(2026, 9, 15, 9, 0))
    await page.reload()

    await taskBoard.openEditDialog('Mensuelle')
    await recurrenceFields.choose('Personnaliser…')
    await recurrenceFields.setEvery(1, 'mois')

    // Libellés tirés de la date de début, jour fixe par défaut
    await expect(recurrenceFields.monthlyLabel('dayOfMonth')).toHaveText('le 15')
    await expect(recurrenceFields.monthlyLabel('nthWeekday')).toHaveText('le 3e jeudi')
    await expect(recurrenceFields.monthlyLabel('lastDay')).toHaveText('le dernier jour')
    await expect(recurrenceFields.monthlyMode('dayOfMonth')).toBeChecked()

    const modes = [
      { mode: 'nthWeekday', summary: 'Tous les mois le 3e jeudi à 09:00', select: 'Personnaliser…' },
      { mode: 'lastDay', summary: 'Tous les mois le dernier jour à 09:00', select: 'Personnaliser…' },
      // Jour fixe, sans fin et sans empiler : le préréglage mensuel
      { mode: 'dayOfMonth', summary: 'Tous les mois le 15 à 09:00', select: 'Tous les mois le 15' },
    ] as const

    for (const [index, { mode, summary, select }] of modes.entries()) {
      // Le mode précédent étant personnalisé, le bloc s'affiche à la réouverture
      if (index > 0) await taskBoard.openEditDialog('Mensuelle')
      await recurrenceFields.monthlyMode(mode).check()
      await expect(recurrenceFields.summary).toHaveText(summary)
      await taskBoard.saveButton.click()
      await expect(taskBoard.dialog).toBeHidden()

      expect((await getTask(page.request, task.id)).recurrence).toMatchObject({
        frequency: 'monthly',
        monthlyMode: mode,
      })

      // Réouverture : même choix, même résumé
      await taskBoard.openEditDialog('Mensuelle')
      await expect(recurrenceFields.select).toHaveText(select)
      await expect(recurrenceFields.summary).toHaveText(summary)
      if (select === 'Personnaliser…') await expect(recurrenceFields.monthlyMode(mode)).toBeChecked()
      await taskBoard.cancelButton.click()
      await expect(taskBoard.dialog).toBeHidden()
    }
  })

  test('un 5e jeudi est proposé comme le dernier jeudi', async ({ page, taskBoard, recurrenceFields }) => {
    // 29 octobre 2026 : 5e jeudi du mois
    await createDatedTask(page.request, 'Fin octobre', new Date(2026, 9, 29, 9, 0))
    await page.reload()

    await taskBoard.openEditDialog('Fin octobre')
    await recurrenceFields.choose('Personnaliser…')
    await recurrenceFields.setEvery(2, 'mois')

    await expect(recurrenceFields.monthlyLabel('nthWeekday')).toHaveText('le dernier jeudi')
    await expect(recurrenceFields.monthEndHint).toBeVisible()

    // L'indication des jours 29 à 31 ne concerne que le jour fixe
    await recurrenceFields.monthlyMode('nthWeekday').check()
    await expect(recurrenceFields.summary).toHaveText('Tous les 2 mois le dernier jeudi à 09:00')
    await expect(recurrenceFields.monthEndHint).toBeHidden()
  })
})

test.describe('Création anticipée', () => {
  test('« N jours avant » enregistré, résumé, puis relu ; « le jour même » le retire', async ({
    page,
    taskBoard,
    recurrenceFields,
  }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Préparée')
    await recurrenceFields.choose('Tous les jours')
    await recurrenceFields.choose('Personnaliser…')
    await expect(recurrenceFields.leadSameDay).toBeChecked()

    await recurrenceFields.createDaysBefore(2)
    await expect(recurrenceFields.leadBefore).toBeChecked()
    await expect(recurrenceFields.summary).toHaveText('Tous les jours à 09:00, créée 2 jours avant')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    const [created] = (await (await page.request.get(API_TASKS)).json()) as { id: number }[]
    expect((await getTask(page.request, created.id)).recurrence).toMatchObject({ frequency: 'daily', leadDays: 2 })
    await expect(taskBoard.taskCard('Préparée').getByTestId('task-card-recurrence')).toHaveAttribute(
      'aria-label',
      /^Tous les jours à 09:00, créée 2 jours avant\n/,
    )

    // Réouverture : règle personnalisée avec le même délai
    await taskBoard.openEditDialog('Préparée')
    await expect(recurrenceFields.select).toHaveText('Personnaliser…')
    await expect(recurrenceFields.leadBefore).toBeChecked()
    await expect(recurrenceFields.leadDays).toHaveValue('2')
    await expect(recurrenceFields.summary).toHaveText('Tous les jours à 09:00, créée 2 jours avant')

    // Le jour même : plus de délai, la règle redevient le préréglage
    await recurrenceFields.leadSameDay.check()
    await expect(recurrenceFields.summary).toHaveText('Tous les jours à 09:00')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    expect((await getTask(page.request, created.id)).recurrence).toMatchObject({ leadDays: 0 })

    await taskBoard.openEditDialog('Préparée')
    await expect(recurrenceFields.select).toHaveText('Tous les jours')
  })

  test('validation : de 1 à 30 jours', async ({ taskBoard, recurrenceFields }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Trop tôt')
    await recurrenceFields.choose('Personnaliser…')
    await recurrenceFields.leadBefore.check()
    await recurrenceFields.leadDays.click()
    await recurrenceFields.leadDays.press('ControlOrMeta+a')
    await recurrenceFields.leadDays.press('Backspace')
    await recurrenceFields.leadDays.press('Tab')

    await taskBoard.saveButton.click()
    await expect(recurrenceFields.error).toHaveText('Le nombre de jours doit être compris entre 1 et 30')
    await expect(taskBoard.dialog).toBeVisible()

    await recurrenceFields.typeNumber(recurrenceFields.leadDays, 3)
    await expect(recurrenceFields.error).toBeHidden()
  })
})

test.describe('Occurrences au tableau', () => {
  test('la carte de la nouvelle occurrence apparaît sans recharger', async ({ page, taskBoard }) => {
    await createRecurringTask(page.request, { title: 'Quotidienne', startDate: localDate(1), recurrence: DAILY })
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Quotidienne'])

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })

    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Quotidienne', 'Quotidienne'])
    await expect(taskBoard.columnCount(COLUMN)).toHaveText('2')
    await expect(taskBoard.taskCard('Quotidienne').getByTestId('task-card-recurrence')).toHaveCount(2)
  })

  test('icône sur une occurrence archivée', async ({ page, header, settingsPage, archivesPage }) => {
    const task = await createRecurringTask(page.request, {
      title: 'Archivée',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    expect((await page.request.put(`${API_TASKS}/${task.id}`)).ok()).toBeTruthy()

    await header.goSettings()
    await settingsPage.openArchivesButton.click()
    await archivesPage.expectVisible()

    const icon = archivesPage.item('Archivée').getByTestId('archived-task-recurrence')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveAttribute('aria-label', /^Tous les jours à 09:00\nProchaine : /)
  })
})

test.describe('Modification et arrêt', () => {
  test('contenu reporté sur les prochaines occurrences, sauf case décochée', async ({
    page,
    taskBoard,
    recurrenceFields,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Avant',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await page.reload()

    // Case cochée par défaut : le modèle prend le nouveau titre
    await taskBoard.openEditDialog('Avant')
    await expect(recurrenceFields.applyToSeries).toBeVisible()
    await expect(recurrenceFields.applyToSeries).toBeChecked()
    await taskBoard.fillAndSave({ title: 'Modèle' })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    // Case décochée : seule la tâche change (la tâche d'origine, première des deux cartes)
    await openFirstCard(taskBoard, 'Modèle')
    await taskBoard.titleInput.fill('Ici seulement')
    await recurrenceFields.applyToSeries.uncheck()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await runRecurrences(page.request, plusMinutes(localDate(3), 1))

    const tasks = await seriesTasks(page.request, origin.recurrenceId!)
    expect(tasks.map((task) => task.title)).toEqual(['Ici seulement', 'Modèle', 'Modèle'])
  })

  test('« Ne pas répéter » arrête la série, « Annuler » la relance', async ({
    page,
    taskBoard,
    recurrenceFields,
    undoToast,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Série',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))
    await page.reload()
    await expect(taskBoard.taskCard('Série').getByTestId('task-card-recurrence')).toHaveCount(2)

    await openFirstCard(taskBoard, 'Série')
    await recurrenceFields.choose('Ne pas répéter')
    await expect(recurrenceFields.stopHint).toBeVisible()
    await expect(recurrenceFields.applyToSeries).toBeHidden()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // Toutes les occurrences de la série sont grisées, et conservées
    const icons = taskBoard.taskCard('Série').getByTestId('task-card-recurrence')
    await expect(icons).toHaveCount(2)
    for (const icon of await icons.all()) await expect(icon).toHaveAttribute('data-status', 'ended')
    await expect(icons.first()).toHaveAttribute('aria-label', /\nSérie arrêtée$/)
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({ status: 'ended', nextRunAt: null })

    await undoToast.undo('Série')

    for (const icon of await icons.all()) await expect(icon).toHaveAttribute('data-status', 'active')
    const resumed = (await getTask(page.request, origin.id)).recurrence!
    expect(resumed.status).toBe('active')
    expect(new Date(resumed.nextRunAt!).getTime()).toBeGreaterThan(Date.now())
  })

  test('le lien « Arrêter la série » choisit « Ne pas répéter »', async ({ page, taskBoard, recurrenceFields }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Lien',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await page.reload()

    await taskBoard.openEditDialog('Lien')
    await recurrenceFields.stopLink.click()
    await expect(recurrenceFields.select).toHaveText('Ne pas répéter')
    await expect(recurrenceFields.stopLink).toBeHidden()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCard('Lien').getByTestId('task-card-recurrence')).toHaveAttribute('data-status', 'ended')
    expect((await getTask(page.request, origin.id)).recurrence?.status).toBe('ended')

    // Réouverte, la tâche d'une série arrêtée ne se répète plus
    await taskBoard.openEditDialog('Lien')
    await expect(recurrenceFields.select).toHaveText('Ne pas répéter')
    await expect(recurrenceFields.stopHint).toBeHidden()
  })
})
