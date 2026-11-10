import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { desktop, setSetting } from '../../helpers/desktop.helper'
import { createBoard, createTaskIn, DEFAULT_BOARD } from '../../helpers/board.helper'
import {
  createRecurringTask,
  DAILY,
  getTask,
  localDate,
  runRecurrences,
  seriesTasks,
  stageIds,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de la vue Planning : sous-menu du rail, grille mois et semaine, déplacement au
 * glisser-déposer et au clavier, panneau « À planifier », filtres, création,
 * menu de la carte et occurrences à venir des séries.
 *
 * Les dates sont relatives à aujourd'hui. Les cellules visées restent dans la
 * grille affichée (quelques jours autour d'aujourd'hui, jours du mois voisin compris).
 *
 * Isolation : la base et les paramètres sont remis à zéro avant chaque test
 * (fixture `cleanState`).
 */

const A_FAIRE = 'A faire'
const EN_COURS = 'En cours'

/**
 * Crée une tâche dans une colonne du tableau par défaut.
 * @param request Contexte de requête Playwright
 * @param title Titre
 * @param startDate Date de début, aucune par défaut
 * @param column Nom de la colonne
 * @returns La tâche créée
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  startDate: Date | null = null,
  column = A_FAIRE,
): Promise<{ id: number }> {
  const stages = await stageIds(request)
  const res = await request.post(`${API}/tasks`, {
    data: {
      stageId: stages[column],
      position: 0,
      title,
      version: '1.0.0',
      description: '',
      startDate: startDate?.toISOString() ?? null,
    },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return res.json()
}

// Jours d'arrivée des déplacements : demain, dans la grille du mois affiché
const NEAR = 1

/**
 * Vrai si hier ou demain sort de la grille du mois : aujourd'hui en est le premier
 * jour (1er du mois, un lundi) ou le dernier (dernier du mois, un dimanche).
 */
function todayOnGridEdge(): boolean {
  const today = localDate(0)
  const firstCell = today.getDate() === 1 && today.getDay() === 1
  const lastCell = localDate(1).getDate() === 1 && today.getDay() === 0
  return firstCell || lastCell
}

test.beforeEach(() => {
  test.skip(todayOnGridEdge(), "Hier ou demain n'est pas dans la grille affichée")
})

/** Tableau supplémentaire, une colonne. */
const PERSO_STAGE = 'Colonne perso'

test.describe('sous-menu du rail', () => {
  test('passe au Planning puis revient, sans sélecteur de tableau dans le Planning', async ({ page, planningPage }) => {
    await expect(page.getByTestId('stage-column').first()).toBeVisible()
    await expect(page.getByTestId('board-switcher')).toBeVisible()

    await planningPage.open()
    await expect(page.getByTestId('stage-column')).toHaveCount(0)
    await expect(page.getByTestId('board-switcher')).toHaveCount(0)

    await planningPage.backToKanban()
    await expect(page.getByTestId('board-switcher')).toBeVisible()
  })

  test('garde la vue et l’échelle après un rechargement', async ({ page, planningPage }) => {
    await planningPage.open()
    await planningPage.chooseScale('Semaine')
    await expect(planningPage.scaleOption('Semaine')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(planningPage.calendar).toBeVisible()
    await expect(planningPage.railEntry).toHaveAttribute('aria-label', 'Planning')
    await expect(planningPage.scaleOption('Semaine')).toHaveAttribute('aria-pressed', 'true')
  })

  test('la remise à zéro des paramètres garde la vue affichée', async ({ page, planningPage }) => {
    await planningPage.open()
    await planningPage.chooseScale('Semaine')

    const values = await page.evaluate(() => (globalThis as any).settings.reset())
    expect(values).toMatchObject({ boardView: 'planning', planningScale: 'week' })
  })

  test('la date modifiée dans le Planning se voit au retour au Kanban', async ({ page, planningPage }) => {
    await createTask(page.request, 'Retour', null)
    await page.reload()
    await planningPage.open()

    await planningPage.drag(planningPage.panelCard('Retour'), planningPage.cell(localDate(NEAR)))
    await expect(planningPage.event('Retour')).toBeVisible()

    await planningPage.backToKanban()
    await expect(
      page.getByTestId('task-card').filter({ hasText: 'Retour' }).getByTestId('task-card-date'),
    ).toBeVisible()
  })
})

test.describe('grille', () => {
  test('montre une tâche sur son jour, en mois comme en semaine', async ({ page, planningPage }) => {
    await createTask(page.request, 'Datée', localDate(0, 14))
    await page.reload()
    await planningPage.open()

    await expect(planningPage.eventOn(localDate(0), 'Datée')).toBeVisible()
    await expect(planningPage.eventOn(localDate(0), 'Datée').getByTestId('planning-card-date')).toContainText('14')

    await planningPage.chooseScale('Semaine')
    await expect(planningPage.calendar.locator('[role="cell"][data-date]')).toHaveCount(7)
    await expect(planningPage.event('Datée')).toBeVisible()
  })

  test('navigue entre les périodes et revient à aujourd’hui', async ({ page, planningPage }) => {
    await createTask(page.request, 'Aujourd’hui', localDate(0, 10))
    await page.reload()
    await planningPage.open()
    const title = await planningPage.periodTitle()

    await planningPage.nextButton.click()
    await expect(planningPage.title).not.toHaveText(title)

    await planningPage.todayButton.click()
    await expect(planningPage.title).toHaveText(title)
    await expect(planningPage.event('Aujourd’hui')).toBeVisible()

    await page.keyboard.press('PageUp')
    await expect(planningPage.title).not.toHaveText(title)
    await page.keyboard.press('PageDown')
    await expect(planningPage.title).toHaveText(title)
  })

  test('garde la période affichée après un aller-retour au Kanban', async ({ planningPage }) => {
    await planningPage.open()
    await planningPage.nextButton.click()
    const title = await planningPage.periodTitle()

    await planningPage.backToKanban()
    await planningPage.open()
    await expect(planningPage.title).toHaveText(title)
  })

  test('replie les tâches d’un jour chargé dans « +N »', async ({ page, planningPage }) => {
    for (let hour = 8; hour < 20; hour++) await createTask(page.request, `Chargée ${hour}`, localDate(0, hour))
    await page.reload()
    await planningPage.open()

    await expect(planningPage.moreLink(localDate(0))).toBeVisible()
    await planningPage.moreLink(localDate(0)).click()
    await expect(page.getByTestId('planning-event').filter({ hasText: 'Chargée 19' })).toBeVisible()
  })

  test('ouvre une carte au clic', async ({ page, planningPage }) => {
    await createTask(page.request, 'À ouvrir', localDate(0, 10))
    await page.reload()
    await planningPage.open()

    await planningPage.event('À ouvrir').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('#inputValue')).toHaveValue('À ouvrir')
  })
})

test.describe('replanifier', () => {
  test('glisser vers un autre jour change la date, garde l’heure, la colonne et la position', async ({
    page,
    planningPage,
    undoToast,
  }) => {
    const task = await createTask(page.request, 'À déplacer', localDate(0, 10, 30), EN_COURS)
    const before = await getTask(page.request, task.id)
    await page.reload()
    await planningPage.open()

    await planningPage.drag(planningPage.event('À déplacer'), planningPage.cell(localDate(NEAR)))
    await expect(planningPage.eventOn(localDate(NEAR), 'À déplacer')).toBeVisible()
    await expect(undoToast.toast('À déplacer')).toBeVisible()

    await expect
      .poll(async () => (await getTask(page.request, task.id)).startDate)
      .toBe(localDate(NEAR, 10, 30).toISOString())
    const after = await getTask(page.request, task.id)
    expect(after.stageId).toBe(before.stageId)
    expect(after.position).toBe(before.position)
  })

  test('annule un déplacement sans seconde notification', async ({ electronApp, page, planningPage, undoToast }) => {
    const past = localDate(-1, 9)
    const task = await createTask(page.request, 'Notifiée', past)
    await desktop(electronApp, 'runNotifications')
    await expect.poll(async () => (await getTask(page.request, task.id)).notifiedAt).toBeTruthy()
    const notifiedAt = (await getTask(page.request, task.id)).notifiedAt

    await page.reload()
    await planningPage.open()

    // Repoussée dans le futur : le serveur réarme le rappel
    await planningPage.drag(planningPage.eventOn(localDate(-1), 'Notifiée'), planningPage.cell(localDate(NEAR)))
    await expect.poll(async () => (await getTask(page.request, task.id)).notifiedAt).toBeNull()

    await undoToast.undo('Notifiée')
    await expect.poll(async () => (await getTask(page.request, task.id)).startDate).toBe(past.toISOString())
    expect((await getTask(page.request, task.id)).notifiedAt).toBe(notifiedAt)

    const res = await desktop(electronApp, 'runNotifications')
    expect(res.count).toBe(0)
  })

  test('un enregistrement refusé ramène la carte à sa place', async ({ page, planningPage }) => {
    await createTask(page.request, 'Refusée', localDate(0, 10))
    await page.reload()
    await planningPage.open()

    await page.route('**/tasks/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur simulée"}' })
        : route.fallback(),
    )
    await planningPage.drag(planningPage.event('Refusée'), planningPage.cell(localDate(NEAR)))

    await expect(page.locator('.p-toast-message').first()).toBeVisible()
    await expect(planningPage.eventOn(localDate(0), 'Refusée')).toBeVisible()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('déplacer une occurrence ne touche pas à sa série et ne crée pas de doublon', async ({ page, planningPage }) => {
    const start = localDate(0, 9)
    const task = await createRecurringTask(page.request, { title: 'Quotidienne', startDate: start, recurrence: DAILY })
    const nextRunAt = task.recurrence?.nextRunAt
    await page.reload()
    await planningPage.open()

    await planningPage.drag(planningPage.event('Quotidienne'), planningPage.cell(localDate(NEAR)))
    await expect
      .poll(async () => (await getTask(page.request, task.id)).startDate)
      .toBe(localDate(NEAR, 9).toISOString())

    const moved = await getTask(page.request, task.id)
    expect(moved.occurrenceDate).toBe(start.toISOString())
    expect(moved.recurrence?.nextRunAt).toBe(nextRunAt)

    await runRecurrences(page.request, localDate(NEAR, 9, 1))
    const occurrences = await seriesTasks(page.request, task.recurrenceId!)
    const dates = occurrences.map((occurrence) => occurrence.occurrenceDate)
    expect(new Set(dates).size).toBe(dates.length)
  })

  test('au clavier : passe aux cartes voisines et déplace d’un jour', async ({ page, planningPage }) => {
    const task = await createTask(page.request, 'Clavier', localDate(0, 11))
    await createTask(page.request, 'Voisine', localDate(0, 12))
    await page.reload()
    await planningPage.open()

    await planningPage.event('Clavier').focus()
    await page.keyboard.press('ArrowDown')
    await expect(planningPage.event('Voisine')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(planningPage.event('Clavier')).toBeFocused()

    await page.keyboard.press('Alt+ArrowRight')
    await expect.poll(async () => (await getTask(page.request, task.id)).startDate).toBe(localDate(1, 11).toISOString())
    await expect(planningPage.event('Clavier')).toBeFocused()
  })

  test('Entrée ouvre la carte, Suppr l’archive', async ({ page, planningPage, undoToast }) => {
    await createTask(page.request, 'Touches', localDate(0, 11))
    await page.reload()
    await planningPage.open()

    await planningPage.event('Touches').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await planningPage.event('Touches').focus()
    await page.keyboard.press('Delete')
    await expect(planningPage.event('Touches')).toHaveCount(0)

    await undoToast.undo('Touches')
    await expect(planningPage.event('Touches')).toBeVisible()
  })
})

test.describe('panneau À planifier', () => {
  test('une tâche sans date déposée sur un jour reçoit 09:00', async ({ page, planningPage }) => {
    const task = await createTask(page.request, 'Sans date')
    await page.reload()
    await planningPage.open()
    await expect(planningPage.unscheduled.getByTestId('planning-unscheduled-count')).toHaveText('1')

    await planningPage.drag(planningPage.panelCard('Sans date'), planningPage.cell(localDate(NEAR)))

    await expect
      .poll(async () => (await getTask(page.request, task.id)).startDate)
      .toBe(localDate(NEAR, 9).toISOString())
    await expect(planningPage.panelCard('Sans date')).toHaveCount(0)
    await expect(planningPage.eventOn(localDate(NEAR), 'Sans date')).toBeVisible()
  })

  test('une carte de la grille déposée sur « Sans date » perd sa date', async ({ page, planningPage }) => {
    const task = await createTask(page.request, 'Sans plus de date', localDate(0, 10))
    await page.reload()
    await planningPage.open()

    await planningPage.drag(planningPage.event('Sans plus de date'), planningPage.unscheduled)

    await expect.poll(async () => (await getTask(page.request, task.id)).startDate).toBeNull()
    await expect(planningPage.panelCard('Sans plus de date')).toBeVisible()
    await expect(planningPage.event('Sans plus de date')).toHaveCount(0)
  })

  test('liste les tâches en retard hors de la période, sans les doublonner', async ({ page, planningPage }) => {
    await createTask(page.request, 'Ancienne', localDate(-70, 11))
    await createTask(page.request, 'Hier', localDate(-1, 11))
    await page.reload()
    await planningPage.open()

    await expect(planningPage.overdue.getByTestId('planning-panel-card').filter({ hasText: 'Ancienne' })).toBeVisible()
    await expect(planningPage.panelCard('Hier')).toHaveCount(0)
    await expect(planningPage.eventOn(localDate(-1), 'Hier')).toBeVisible()
  })

  test('une tâche en retard déposée sur un jour garde son heure', async ({ page, planningPage }) => {
    const task = await createTask(page.request, 'Rattrapée', localDate(-70, 11, 15))
    await page.reload()
    await planningPage.open()

    await planningPage.drag(planningPage.panelCard('Rattrapée'), planningPage.cell(localDate(NEAR)))

    await expect
      .poll(async () => (await getTask(page.request, task.id)).startDate)
      .toBe(localDate(NEAR, 11, 15).toISOString())
  })
})

test.describe('filtres', () => {
  test('montre tous les tableaux par défaut, et se filtre sur un ou plusieurs', async ({ page, planningPage }) => {
    const other = await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await createTask(page.request, 'Du premier', localDate(0, 9))
    await createTaskIn(page.request, other.stageIds[0], 'Du second', { startDate: localDate(0, 10).toISOString() })
    await page.reload()
    await planningPage.open()

    await expect(planningPage.boardFilter).toContainText('Tous les tableaux')
    await expect(planningPage.event('Du premier')).toBeVisible()
    await expect(planningPage.event('Du second')).toBeVisible()
    await expect(planningPage.event('Du second').getByTestId('planning-card-board')).toBeVisible()

    await planningPage.toggleBoard('Perso')
    await expect(planningPage.boardFilter).toContainText('Perso')
    await expect(planningPage.event('Du premier')).toHaveCount(0)
    await expect(planningPage.event('Du second')).toBeVisible()

    await planningPage.toggleBoard(DEFAULT_BOARD)
    await expect(planningPage.boardFilter).toContainText('2 tableaux')
    await expect(planningPage.event('Du premier')).toBeVisible()
  })

  test('revient à tous les tableaux au lancement suivant', async ({ page, planningPage }) => {
    await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await page.reload()
    await planningPage.open()
    await planningPage.toggleBoard('Perso')

    await page.reload()
    await expect(planningPage.boardFilter).toContainText('Tous les tableaux')
  })

  test('le filtre ne change pas le tableau du Kanban, même après une recherche', async ({
    page,
    planningPage,
    boardSwitcher,
    tagFilter,
  }) => {
    const other = await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await createTaskIn(page.request, other.stageIds[0], 'Cherchée', { startDate: localDate(0, 10).toISOString() })
    await page.reload()
    await expect(boardSwitcher.currentName).toHaveText(DEFAULT_BOARD)
    await planningPage.open()

    await planningPage.toggleBoard('Perso')
    await tagFilter.search('Cherchée')
    await tagFilter.taskOption('Cherchée').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await planningPage.backToKanban()
    await expect(boardSwitcher.currentName).toHaveText(DEFAULT_BOARD)
  })

  test('Ctrl+chiffre filtre sur un tableau, de nouveau pour revenir à tous', async ({ page, planningPage }) => {
    await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await page.reload()
    await planningPage.open()

    await page.keyboard.press('Control+Digit2')
    await expect(planningPage.boardFilter).toContainText('Perso')
    await page.keyboard.press('Control+Digit2')
    await expect(planningPage.boardFilter).toContainText('Tous les tableaux')
  })

  test('avec un seul tableau, ni filtre ni pastille', async ({ page, planningPage }) => {
    await createTask(page.request, 'Seule', localDate(0, 9))
    await page.reload()
    await planningPage.open()

    await expect(planningPage.boardFilter).toHaveCount(0)
    await expect(planningPage.event('Seule').getByTestId('planning-card-board')).toHaveCount(0)
  })

  test('le filtre de l’en-tête s’applique à la grille et au panneau, le DnD reste actif', async ({
    page,
    planningPage,
    tagFilter,
  }) => {
    const task = await createTask(page.request, 'Cible', localDate(0, 9))
    await createTask(page.request, 'Autre', localDate(0, 10))
    await createTask(page.request, 'Sans date ignorée')
    await page.reload()
    await planningPage.open()

    await tagFilter.search('Cible')
    await expect(planningPage.event('Autre')).toHaveCount(0)
    await expect(planningPage.panelCard('Sans date ignorée')).toHaveCount(0)

    await planningPage.drag(planningPage.event('Cible'), planningPage.cell(localDate(NEAR)))
    await expect
      .poll(async () => (await getTask(page.request, task.id)).startDate)
      .toBe(localDate(NEAR, 9).toISOString())

    await tagFilter.search('Introuvable')
    await expect(planningPage.filterEmpty).toBeVisible()
  })
})

test.describe('créer', () => {
  test('le numéro d’un jour ouvre le dialogue avec sa date', async ({ page, planningPage }) => {
    await page.reload()
    await planningPage.open()

    await planningPage.dayLink(localDate(NEAR)).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('#inputValue').fill('Créée')
    await page.getByTestId('task-save-btn').click()

    await expect(planningPage.eventOn(localDate(NEAR), 'Créée')).toBeVisible()
    await expect(planningPage.eventOn(localDate(NEAR), 'Créée').getByTestId('planning-card-date')).toContainText('09')
  })

  test('N crée sur aujourd’hui', async ({ page, planningPage }) => {
    await page.reload()
    await planningPage.open()

    await page.keyboard.press('n')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('#inputValue').fill('Au clavier')
    await page.getByTestId('task-save-btn').click()

    await expect(planningPage.eventOn(localDate(0), 'Au clavier')).toBeVisible()
  })

  test('crée dans le tableau filtré, pas dans le tableau courant', async ({ page, planningPage }) => {
    const other = await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await page.reload()
    await planningPage.open()
    await planningPage.toggleBoard('Perso')

    await planningPage.dayLink(localDate(NEAR)).click()
    await page.locator('#inputValue').fill('Dans Perso')
    await page.getByTestId('task-save-btn').click()
    await expect(planningPage.event('Dans Perso')).toBeVisible()

    const tasks = await (await page.request.get(`${API}/tasks`)).json()
    expect(tasks.find((task: { title: string }) => task.title === 'Dans Perso').stageId).toBe(other.stageIds[0])
  })

  test('« en haut de colonne » décale les autres cartes', async ({ page, planningPage }) => {
    const first = await createTask(page.request, 'Déjà là')
    await setSetting(page, 'newTaskPosition', 'top')
    await page.reload()
    await planningPage.open()

    await planningPage.dayLink(localDate(NEAR)).click()
    await page.locator('#inputValue').fill('En haut')
    await page.getByTestId('task-save-btn').click()
    await expect(planningPage.event('En haut')).toBeVisible()

    await expect.poll(async () => (await getTask(page.request, first.id)).position).toBe(1)
  })
})

test.describe('menu de la carte', () => {
  test('propose les colonnes de la tâche, sans « en haut / en bas »', async ({ page, planningPage }) => {
    const other = await createBoard(page.request, 'Perso', null, [PERSO_STAGE])
    await createTaskIn(page.request, other.stageIds[0], 'Ailleurs', { startDate: localDate(0, 10).toISOString() })
    await page.reload()
    await planningPage.open()

    await planningPage.event('Ailleurs').click({ button: 'right' })
    await expect(planningPage.cardMenu).toBeVisible()
    await expect(planningPage.cardMenu).toContainText('Déplacer vers')
    await expect(planningPage.cardMenu).not.toContainText('Tout en haut')
    await expect(planningPage.cardMenu).not.toContainText('Tout en bas')
  })

  test('déplace vers une autre colonne sans quitter la grille', async ({ page, planningPage }) => {
    const task = await createTask(page.request, 'Vers En cours', localDate(0, 10))
    const stages = await stageIds(page.request)
    await page.reload()
    await planningPage.open()

    await planningPage.event('Vers En cours').click({ button: 'right' })
    await planningPage.cardMenu.getByText('Déplacer vers').hover()
    await page.getByRole('menuitem', { name: EN_COURS }).click()

    await expect.poll(async () => (await getTask(page.request, task.id)).stageId).toBe(stages[EN_COURS])
    await expect(planningPage.event('Vers En cours')).toBeVisible()
  })
})

test.describe('ouverture depuis l’extérieur', () => {
  test('un résultat de recherche ouvre la tâche, sur la période de sa date', async ({
    page,
    planningPage,
    tagFilter,
  }) => {
    const nextMonth = localDate(40, 10)
    await createTask(page.request, 'Lointaine', nextMonth)
    await page.reload()
    await planningPage.open()
    const title = await planningPage.periodTitle()

    await tagFilter.search('Lointaine')
    await tagFilter.taskOption('Lointaine').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(planningPage.title).not.toHaveText(title)
  })

  test('un clic sur une notification ouvre la tâche', async ({ electronApp, page, planningPage }) => {
    const task = await createTask(page.request, 'Notifiée', localDate(0, 10))
    await page.reload()
    await planningPage.open()

    await desktop(electronApp, 'clickNotification', [task.id])
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('#inputValue')).toHaveValue('Notifiée')
  })
})

test.describe('occurrences à venir', () => {
  test('montre les prochaines dates d’une série, en lecture seule', async ({ page, planningPage }) => {
    const task = await createRecurringTask(page.request, {
      title: 'Quotidienne',
      startDate: localDate(0, 9),
      recurrence: DAILY,
    })
    await page.reload()
    await planningPage.open()

    const next = planningPage.cell(localDate(NEAR)).getByTestId('planning-projection')
    await expect(next).toContainText('Quotidienne')

    // Rien à ouvrir ni à déplacer : aucune carte de tâche, aucun dialogue
    await next.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(planningPage.events).toHaveCount(1)
    await expect(planningPage.event('Quotidienne').first()).toHaveAttribute('data-planning-task-id', String(task.id))
  })

  test('ne montre rien pour une série « après archivage »', async ({ page, planningPage }) => {
    await createRecurringTask(page.request, {
      title: 'Après archivage',
      startDate: localDate(0, 9),
      recurrence: { frequency: 'daily', interval: 1, endType: 'never', skipIfPending: false, anchor: 'completion' },
    })
    await page.reload()
    await planningPage.open()

    await expect(planningPage.event('Après archivage')).toBeVisible()
    await expect(planningPage.projections).toHaveCount(0)
  })

  test('sont masquées par un filtre de tag ou d’état', async ({ page, planningPage, tagFilter }) => {
    await createRecurringTask(page.request, { title: 'Filtrée', startDate: localDate(0, 9), recurrence: DAILY })
    await page.reload()
    await planningPage.open()
    await expect(planningPage.projections.first()).toBeVisible()

    await tagFilter.search('Introuvable')
    await expect(planningPage.projections).toHaveCount(0)
  })
})
