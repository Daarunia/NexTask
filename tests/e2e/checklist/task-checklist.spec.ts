import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { ChecklistItemInput } from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E de la checklist du dialogue de tâche (parcours P1, P2, P3 et P6).
 * Saisie au clavier, coche annulée ou enregistrée, application d'un modèle
 * (copie sans lien), menu ⋯, glisser-déposer d'un point, « Enregistrer comme
 * modèle » avec et sans « Ouvrir », création d'une tâche avec checklist et
 * défilement du dialogue avec 20 points à la taille de la CI.
 *
 * Les tâches et modèles de départ sont créés par l'API, l'état enregistré est
 * relu par l'API.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

interface Task {
  id: number
  title: string
  checklist: { id: number; items: { id: number; text: string; isChecked: boolean; checkedAt: string | null }[] } | null
}

interface Template {
  id: number
  name: string
  items: { text: string; isChecked: boolean }[]
}

/** Id de la colonne `COLUMN`. */
async function columnId(request: APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  return stages.find((stage) => stage.name === COLUMN)!.id
}

/**
 * Crée une tâche dans la colonne `COLUMN`, avec ses points.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param checklistItems Points de la checklist, aucun par défaut
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  checklistItems: ChecklistItemInput[] = [],
): Promise<Task> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId: await columnId(request), position: 0, title, version: '1.0.0', description: '', checklistItems },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/**
 * Tâche relue par l'API.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 */
async function readTask(request: APIRequestContext, id: number): Promise<Task> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/**
 * Textes et états cochés des points d'une tâche enregistrée.
 * @param task Tâche relue
 */
function savedItems(task: Task): [string, boolean][] {
  return (task.checklist?.items ?? []).map((item) => [item.text, item.isChecked])
}

/**
 * Crée un modèle par l'API.
 * @param request Contexte de requête Playwright
 * @param name Nom du modèle
 * @param items Textes des points
 */
async function createTemplate(request: APIRequestContext, name: string, items: string[] = []): Promise<Template> {
  const res = await request.post(`${API}/checklist-templates`, { data: { name, items } })
  expect(res.status()).toBe(201)
  return (await res.json()) as Template
}

/**
 * Modèles en base, dans leur ordre.
 * @param request Contexte de requête Playwright
 */
async function listTemplates(request: APIRequestContext): Promise<Template[]> {
  return (await (await request.get(`${API}/checklist-templates`)).json()) as Template[]
}

/**
 * Points non cochés, puis les `checked` premiers cochés.
 * @param texts Textes des points, dans l'ordre
 * @param checked Nombre de points cochés, en tête de liste
 */
function items(texts: string[], checked = 0): ChecklistItemInput[] {
  return texts.map((text, index) => ({ text, isChecked: index < checked }))
}

/**
 * Recharge la page et attend les cartes du tableau.
 * @param page Page de l'app
 * @param count Nombre de cartes attendues
 */
async function reloadBoard(page: Page, count: number) {
  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(count)
}

test.describe('Checklist du dialogue de tâche', () => {
  test('saisit trois points au clavier, Entrée ne soumet pas, puis 0/3 sur la carte', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const task = await createTask(page.request, 'Préparer la release')
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Préparer la release')
    await expect(checklist.progress).toHaveCount(0)
    await expect(checklist.bar).toHaveCount(0)

    await checklist.addItems('Changelog', 'Tests')
    // Entrée a validé chaque ligne sans enregistrer la tâche
    await expect(taskBoard.dialog).toBeVisible()
    await expect.poll(() => checklist.itemTexts()).toEqual(['Changelog', 'Tests'])
    await expect(checklist.newItem).toBeFocused()

    // Entrée sur un point existant ouvre une ligne vide, Retour arrière la retire
    await checklist.itemInputs.nth(1).click()
    await checklist.itemInputs.nth(1).press('End')
    await checklist.itemInputs.nth(1).press('Enter')
    await expect(checklist.items).toHaveCount(3)
    await expect(checklist.itemInputs.nth(2)).toBeFocused()
    await checklist.itemInputs.nth(2).press('Backspace')
    await expect(checklist.items).toHaveCount(2)
    await expect(checklist.itemInputs.nth(1)).toBeFocused()

    // Troisième point tapé puis Ctrl+Entrée, sans Entrée, il est gardé
    await checklist.newItem.fill('Tag')
    await checklist.newItem.press('Control+Enter')
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.cardChecklistBadge('Préparer la release')).toHaveText('0/3')
    expect(savedItems(await readTask(page.request, task.id))).toEqual([
      ['Changelog', false],
      ['Tests', false],
      ['Tag', false],
    ])
  })

  test('cocher puis Annuler ne change rien', async ({ page, taskBoard, taskChecklist: checklist }) => {
    const task = await createTask(page.request, 'Revue', items(['Relire', 'Tester']))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Revue')
    await expect(checklist.progress).toHaveText('0/2')
    await checklist.toggle('Relire')
    await checklist.newItem.fill('Brouillon')
    await checklist.newItem.press('Enter')
    await expect(checklist.progress).toHaveText('1/3')

    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(taskBoard.cardChecklistBadge('Revue')).toHaveText('0/2')

    await taskBoard.openEditDialog('Revue')
    await expect.poll(() => checklist.itemTexts()).toEqual(['Relire', 'Tester'])
    await expect.poll(() => checklist.checkedStates()).toEqual([false, false])
    expect(savedItems(await readTask(page.request, task.id))).toEqual([
      ['Relire', false],
      ['Tester', false],
    ])
  })

  test('cocher puis Enregistrer barre le point et met la carte à jour', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const task = await createTask(page.request, 'Revue', items(['Relire', 'Tester']))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Revue')
    await checklist.toggle('Relire')
    await expect(checklist.progress).toHaveText('1/2')
    await expect(checklist.items.first()).toHaveClass(/\bchecked\b/)
    await expect(checklist.bar).toHaveAttribute('value', '1')
    await expect(checklist.bar).toHaveAttribute('max', '2')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.cardChecklistBadge('Revue')).toHaveText('1/2')
    const saved = await readTask(page.request, task.id)
    expect(savedItems(saved)).toEqual([
      ['Relire', true],
      ['Tester', false],
    ])
    // Points existants mis à jour, pas recréés
    expect(saved.checklist!.items.map((item) => item.id)).toEqual(task.checklist!.items.map((item) => item.id))
    expect(saved.checklist!.items[0].checkedAt).not.toBeNull()

    // Dernier point coché, progression et barre en vert
    await taskBoard.openEditDialog('Revue')
    await checklist.toggle('Tester')
    await expect(checklist.progress).toHaveText('2/2')
    await expect(checklist.progress).toHaveClass(/\bdone\b/)
    await expect(checklist.bar).toHaveClass(/\bdone\b/)
    await taskBoard.saveButton.click()
    await expect(taskBoard.cardChecklistBadge('Revue')).toHaveClass(/\bdone\b/)
  })

  test("applique un modèle à la fin d'une checklist qui a déjà un point", async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    await createTemplate(page.request, 'Revue de code', ['Relire la PR', 'Lancer en local', 'Laisser un retour'])
    await createTemplate(page.request, 'Voyage')
    await createTemplate(page.request, 'Courses', ['Pain'])
    const task = await createTask(page.request, 'Release', items(['Déjà là'], 1))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Release')
    await checklist.openTemplates()
    // Ordre de la page Checklists, sans le modèle vide
    await expect.poll(() => checklist.templateNames()).toEqual(['Revue de code', 'Courses'])
    await expect(checklist.templateOption('Revue de code')).toContainText('3 points')
    await expect(checklist.templateOption('Courses')).toContainText('1 point')
    await expect(checklist.manageTemplatesLink).toHaveText('Gérer les modèles')

    // Échap ferme le popover seul
    await page.keyboard.press('Escape')
    await expect(checklist.templates).toBeHidden()
    await expect(taskBoard.dialog).toBeVisible()

    await checklist.applyTemplate('Revue de code')
    await expect
      .poll(() => checklist.itemTexts())
      .toEqual(['Déjà là', 'Relire la PR', 'Lancer en local', 'Laisser un retour'])
    await expect.poll(() => checklist.checkedStates()).toEqual([true, false, false, false])

    // Un autre modèle, puis le même une seconde fois, tout s'ajoute
    await checklist.applyTemplate('Courses')
    await checklist.applyTemplate('Courses')
    await expect(checklist.progress).toHaveText('1/6')

    // Les points copiés se modifient comme les autres
    await checklist.itemInputs.nth(1).fill('Relire la PR #42')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    expect(savedItems(await readTask(page.request, task.id))).toEqual([
      ['Déjà là', true],
      ['Relire la PR #42', false],
      ['Lancer en local', false],
      ['Laisser un retour', false],
      ['Pain', false],
      ['Pain', false],
    ])
    // Le modèle n'a pas bougé
    const template = (await listTemplates(page.request)).find((t) => t.name === 'Revue de code')!
    expect(template.items.map((item) => item.text)).toEqual(['Relire la PR', 'Lancer en local', 'Laisser un retour'])
  })

  test('modifier ou supprimer un modèle ensuite ne change pas la tâche', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const template = await createTemplate(page.request, 'Onboarding', ['Créer les accès', 'Préparer le poste'])
    const task = await createTask(page.request, 'Accueillir Léa')
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Accueillir Léa')
    await checklist.applyTemplate('Onboarding')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    const res = await page.request.patch(`${API}/checklist-templates/${template.id}`, {
      data: { name: 'Onboarding v2', items: ['Autre chose'] },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Accueillir Léa')
    await expect.poll(() => checklist.itemTexts()).toEqual(['Créer les accès', 'Préparer le poste'])

    expect((await page.request.delete(`${API}/checklist-templates/${template.id}`)).ok()).toBeTruthy()
    expect(savedItems(await readTask(page.request, task.id))).toEqual([
      ['Créer les accès', false],
      ['Préparer le poste', false],
    ])
  })

  test('sans modèle, le popover propose de créer un modèle', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
    checklistsPage,
  }) => {
    await createTemplate(page.request, 'Vide')
    await createTask(page.request, 'Seule')
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Seule')
    await checklist.openTemplates()
    await expect(checklist.templateOptions).toHaveCount(0)
    await expect(checklist.templatesEmpty).toBeVisible()
    await expect(checklist.manageTemplatesLink).toHaveText('Créer un modèle')

    // Dialogue sans modification, la page Checklists s'ouvre directement
    await checklist.manageTemplatesLink.click()
    await checklistsPage.expectVisible()
    await expect(page).toHaveURL(/#\/checklists$/)
  })

  test('le lien vers la page Checklists demande confirmation si la tâche est modifiée', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
    checklistsPage,
  }) => {
    await createTemplate(page.request, 'Courses', ['Pain'])
    await createTask(page.request, 'Seule')
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Seule')
    await checklist.addItems('Brouillon')
    await checklist.openTemplates()
    await checklist.manageTemplatesLink.click()

    await expect(taskBoard.confirmPopup).toBeVisible()
    await taskBoard.confirmRejectButton.click()
    await expect(taskBoard.dialog).toBeVisible()
    await expect.poll(() => checklist.itemTexts()).toEqual(['Brouillon'])

    await checklist.openTemplates()
    await checklist.manageTemplatesLink.click()
    await taskBoard.confirmAcceptButton.click()
    await checklistsPage.expectVisible()
  })

  test('le menu ⋯ coche tout, décoche tout, masque les points cochés et vide la checklist', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const task = await createTask(page.request, 'Release', items(['Changelog', 'Version', 'Tag'], 1))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Release')
    await checklist.openMenu()
    const labels = await checklist.menu.getByRole('menuitem').allInnerTexts()
    expect(labels.map((label) => label.trim())).toEqual([
      'Tout cocher',
      'Tout décocher',
      'Masquer les points cochés',
      'Enregistrer comme modèle',
      'Vider la checklist',
    ])
    // Échap ferme le menu seul
    await page.keyboard.press('Escape')
    await expect(checklist.menu).toBeHidden()
    await expect(taskBoard.dialog).toBeVisible()

    await checklist.menuAction('Tout cocher')
    await expect(checklist.progress).toHaveText('3/3')
    await expect(checklist.bar).toHaveClass(/\bdone\b/)

    await checklist.menuAction('Tout décocher')
    await expect(checklist.progress).toHaveText('0/3')

    await checklist.toggle('Version')
    await checklist.toggle('Tag')
    await checklist.menuAction('Masquer les points cochés')
    await expect(checklist.items.filter({ visible: true })).toHaveCount(1)
    await expect(checklist.hiddenNote).toHaveText('2 points cochés masqués · Afficher')
    await checklist.openMenu()
    await expect(checklist.menuItem('Afficher les points cochés')).toBeVisible()
    await page.keyboard.press('Escape')

    await checklist.showCheckedButton.click()
    await expect(checklist.items.filter({ visible: true })).toHaveCount(3)
    await expect(checklist.hiddenNote).toHaveCount(0)

    await checklist.menuAction('Vider la checklist')
    await expect(checklist.items).toHaveCount(0)
    await expect(checklist.progress).toHaveCount(0)
    await checklist.openMenu()
    await expect(checklist.menuItem('Tout cocher')).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(taskBoard.cardChecklistBadge('Release')).toHaveCount(0)
    expect((await readTask(page.request, task.id)).checklist).toBeNull()
  })

  test('réordonne un point par glisser-déposer', async ({ page, taskBoard, taskChecklist: checklist }) => {
    const task = await createTask(page.request, 'Release', items(['Un', 'Deux', 'Trois']))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Release')
    await checklist.dragBefore('Trois', 'Un')
    await expect.poll(() => checklist.itemTexts()).toEqual(['Trois', 'Un', 'Deux'])

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    expect(savedItems(await readTask(page.request, task.id)).map(([text]) => text)).toEqual(['Trois', 'Un', 'Deux'])
  })

  test('enregistre la checklist comme modèle puis ouvre le modèle', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
    checklistsPage,
  }) => {
    await createTemplate(page.request, 'Préparer la release')
    await createTask(page.request, 'Préparer la release', items(['Changelog', 'Tag'], 1))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Préparer la release')
    await checklist.menuAction('Enregistrer comme modèle')
    await expect(checklist.saveDialog).toBeVisible()
    // Titre de la tâche, numéroté car déjà pris
    await expect(checklist.saveNameInput).toHaveValue('Préparer la release 2')
    await expect(checklist.saveNameInput).toBeFocused()
    await expect(checklist.saveHint).toHaveText('2 points, enregistrés sans leur état coché.')

    // Nom déjà pris, sans tenir compte de la casse
    await checklist.saveNameInput.fill('préparer LA release')
    await checklist.saveConfirmButton.click()
    await expect(checklist.saveNameError).toHaveText('Un modèle porte déjà ce nom.')

    // Échap ferme ce dialogue seul
    await page.keyboard.press('Escape')
    await expect(checklist.saveDialog).toBeHidden()
    await expect(taskBoard.dialog).toBeVisible()

    await checklist.menuAction('Enregistrer comme modèle')
    await checklist.saveNameInput.fill('Release mensuelle')
    await checklist.saveNameInput.press('Enter')
    await expect(checklist.saveDialog).toBeHidden()

    await expect(checklist.toast).toContainText('Modèle créé')
    await expect(checklist.toast).toContainText('« Release mensuelle » est dans la page Checklists.')
    const created = (await listTemplates(page.request)).find((template) => template.name === 'Release mensuelle')!
    expect(created.items.map((item) => [item.text, item.isChecked])).toEqual([
      ['Changelog', false],
      ['Tag', false],
    ])

    // Tâche non modifiée, « Ouvrir » quitte le tableau sans rien perdre
    await checklist.toastOpenButton.click()
    await expect(page).toHaveURL(new RegExp(`#/checklists/${created.id}$`))
    await expect(checklistsPage.nameInput).toHaveValue('Release mensuelle')
    await expect.poll(() => checklistsPage.itemTexts()).toEqual(['Changelog', 'Tag'])
  })

  test('sans « Ouvrir » tant que la tâche a des modifications en cours', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const task = await createTask(page.request, 'Revue', items(['Relire']))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Revue')
    await checklist.addItems('Tester')
    await checklist.menuAction('Enregistrer comme modèle')
    await expect(checklist.saveNameInput).toHaveValue('Revue')
    await checklist.saveConfirmButton.click()

    await expect(checklist.toast).toContainText('Modèle créé')
    await expect(checklist.toastOpenButton).toHaveCount(0)
    // Le modèle est créé tout de suite, la tâche reste à enregistrer
    const created = (await listTemplates(page.request)).find((template) => template.name === 'Revue')!
    expect(created.items.map((item) => item.text)).toEqual(['Relire', 'Tester'])
    expect(savedItems(await readTask(page.request, task.id))).toEqual([['Relire', false]])
    await expect(taskBoard.dialog).toBeVisible()
    await expect.poll(() => checklist.itemTexts()).toEqual(['Relire', 'Tester'])

    // Dialogue refermé, plus rien à perdre, « Ouvrir » apparaît. Fermé par la croix,
    // le toast recouvre les boutons du bas à la taille de la CI.
    await page.getByTestId('task-close-btn').click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(checklist.toastOpenButton).toBeVisible()
  })

  test('crée une tâche avec une checklist, modèle compris', async ({ page, taskBoard, taskChecklist: checklist }) => {
    await createTemplate(page.request, 'Courses', ['Pain', 'Lait'])
    await reloadBoard(page, 0)

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Samedi')
    await checklist.addItems('Ménage')
    await checklist.applyTemplate('Courses')
    await checklist.toggle('Pain')
    await expect(checklist.progress).toHaveText('1/3')
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.cardChecklistBadge('Samedi')).toHaveText('1/3')
    const tasks = (await (await page.request.get(`${API}/stages`)).json()) as { tasks?: Task[] }[]
    const created = tasks.flatMap((stage) => stage.tasks ?? []).find((t) => t.title === 'Samedi')!
    expect(savedItems(created)).toEqual([
      ['Ménage', false],
      ['Pain', true],
      ['Lait', false],
    ])
  })

  test('avec 20 points, le dialogue défile à la taille de la CI', async ({
    page,
    taskBoard,
    taskChecklist: checklist,
  }) => {
    const texts = Array.from({ length: 20 }, (_, index) => `Point ${index + 1}`)
    await createTemplate(page.request, 'Courses', ['Pain'])
    const task = await createTask(page.request, 'Longue liste', items(texts))
    await reloadBoard(page, 1)

    await taskBoard.openEditDialog('Longue liste')
    await expect(checklist.items).toHaveCount(20)
    const content = page.locator('.p-dialog-content').filter({ has: taskBoard.dialog })
    expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

    // Dernier point coché tout en bas, puis menu et popover rouverts en haut
    await checklist.itemChecks.last().click()
    await expect(checklist.progress).toHaveText('1/20')
    await checklist.openTemplates()
    await checklist.templateOption('Courses').click()
    await expect(checklist.items).toHaveCount(21)
    await checklist.menuAction('Tout cocher')
    await expect(checklist.progress).toHaveText('21/21')

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(taskBoard.cardChecklistBadge('Longue liste')).toHaveText('21/21')
    expect(savedItems(await readTask(page.request, task.id))).toHaveLength(21)
  })
})
