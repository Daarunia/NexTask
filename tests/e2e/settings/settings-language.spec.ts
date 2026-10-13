import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { API } from '../../helpers/api.helper'
import { restoreDialogs, stubOpenDialog } from '../../helpers/dialog.helper'

/**
 * Tests E2E de la langue de l'interface, choisie dans Paramètres › Apparence.
 *
 * En mode test, l'interface démarre en français quelle que soit la langue de
 * la machine (CI en anglais), et le reset de test y revient : les autres
 * fichiers de tests lisent les textes français. Ici, la langue change en
 * direct dans la fenêtre principale, la fenêtre d'ajout rapide et les textes
 * du main (notifications, menu de la zone de notification, refus d'import).
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

const DAY = 24 * 60 * 60 * 1000

/**
 * Langues proposées après « Langue du système », chacune écrite dans sa propre
 * langue, avec le titre de la page Paramètres et le bouton d'ajout de liste
 * attendus une fois choisie.
 */
const LANGUAGES = [
  { name: 'Français', lang: 'fr', settings: 'Paramètres', addStage: 'Ajouter une liste' },
  { name: 'English', lang: 'en', settings: 'Settings', addStage: 'Add a list' },
  { name: 'Español', lang: 'es', settings: 'Ajustes', addStage: 'Añadir una lista' },
  { name: 'Português', lang: 'pt', settings: 'Configurações', addStage: 'Adicionar uma lista' },
  { name: '简体中文', lang: 'zh', settings: '设置', addStage: '添加列表' },
]

/**
 * Passe l'interface en anglais depuis les Paramètres, puis attend la bascule.
 * @param page Fenêtre principale
 * @param settingsPage Objet de la page Paramètres
 * @param header Objet de l'en-tête
 */
async function switchToEnglish(
  page: Page,
  settingsPage: { chooseLanguage: (label: string) => Promise<void> },
  header: { goSettings: () => Promise<void> },
) {
  await header.goSettings()
  await settingsPage.chooseLanguage('English')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
}

/**
 * Ouvre la fenêtre d'ajout rapide, comme le raccourci global.
 * @param electronApp App Electron lancée
 * @param page Fenêtre principale
 */
async function openQuickAdd(electronApp: ElectronApplication, page: Page): Promise<Page> {
  const [win] = await Promise.all([electronApp.waitForEvent('window'), page.request.post(`${API}/test/open-quick-add`)])
  await expect(win.getByTestId('quick-add-title')).toBeVisible()
  return win
}

test('le français est la langue par défaut en test, toutes les langues sont proposées', async ({
  page,
  header,
  settingsPage,
}) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

  await header.goSettings()
  await expect(settingsPage.root.getByRole('heading', { name: 'Paramètres' })).toBeVisible()
  await expect(settingsPage.languageSelect).toContainText('Français')

  await settingsPage.languageSelect.click()
  const options = page.getByRole('option')
  await expect(options).toHaveCount(LANGUAGES.length + 1)
  const names = LANGUAGES.map((language) => language.name)
  await expect(options.nth(0)).toHaveText(new RegExp(String.raw`^Langue du système \((${names.join('|')})\)$`))
  for (const [index, name] of names.entries()) {
    await expect(options.nth(index + 1)).toHaveText(name)
  }
})

for (const language of LANGUAGES.filter((candidate) => candidate.lang !== 'fr')) {
  test(`choisir ${language.name} traduit les Paramètres et le tableau`, async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.chooseLanguage(language.name)
    await expect(page.locator('html')).toHaveAttribute('lang', language.lang)
    await expect(settingsPage.root.getByRole('heading', { name: language.settings })).toBeVisible()

    await header.goHome()
    await expect(page.getByTestId('btn-add-stage')).toHaveText(language.addStage)
  })
}

test("passer en anglais traduit l'interface sans recharger", async ({ page, header, settingsPage, taskBoard }) => {
  await switchToEnglish(page, settingsPage, header)

  // Page Paramètres et sommaire
  await expect(settingsPage.root.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(settingsPage.nav).toContainText('Appearance')
  await expect(settingsPage.languageSelect).toContainText('English')

  // Tableau : colonne et bouton d'ajout
  await header.goHome()
  await expect(page.getByTestId('btn-add-stage')).toHaveText('Add a list')
  await expect(page.getByTestId('btn-add-task').first()).toHaveText('Add a task')

  // Dialogue de tâche, calendrier compris (noms des mois de PrimeVue)
  await taskBoard.openCreateDialog('A faire')
  await expect(page.getByTestId('task-save-btn')).toHaveText('Save')
  await expect(page.getByTestId('task-cancel-btn')).toHaveText('Cancel')
  await page.getByTestId('task-startdate-input').click()
  const month = new Date().toLocaleString('en-US', { month: 'long' })
  await expect(page.locator('.p-datepicker-panel .p-datepicker-select-month')).toHaveText(month)
})

test('le choix est conservé après un rechargement, et revient au français', async ({ page, header, settingsPage }) => {
  await switchToEnglish(page, settingsPage, header)

  // Rechargement sur la page Paramètres, où le sélecteur garde le choix
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(settingsPage.root.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(settingsPage.languageSelect).toContainText('English')

  await settingsPage.chooseLanguage('Français')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(settingsPage.root.getByRole('heading', { name: 'Paramètres' })).toBeVisible()
})

test("la fenêtre d'ajout rapide suit la langue choisie", async ({ page, electronApp, header, settingsPage }) => {
  await switchToEnglish(page, settingsPage, header)

  const win = await openQuickAdd(electronApp, page)
  await expect(win.getByTestId('quick-add-title')).toHaveAttribute('placeholder', 'New task…')
  await expect(win.locator('html')).toHaveAttribute('lang', 'en')
})

test('les textes du main suivent la langue choisie', async ({ page, header, settingsPage }) => {
  expect(await (await page.request.get(`${API}/test/tray-menu`)).json()).toEqual([
    'Ouvrir NexTask',
    'Ajout rapide…',
    'Quitter',
  ])

  await switchToEnglish(page, settingsPage, header)

  // Menu de l'icône de la zone de notification
  expect(await (await page.request.get(`${API}/test/tray-menu`)).json()).toEqual(['Open NexTask', 'Quick add…', 'Quit'])

  // Rappel d'une tâche dont la date de début est passée
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number }[]
  const created = await page.request.post(`${API}/tasks`, {
    data: {
      stageId: stages[0].id,
      position: 0,
      title: 'Overdue',
      version: '1.5.0',
      description: '',
      startDate: new Date(Date.now() - DAY).toISOString(),
    },
  })
  expect(created.ok()).toBeTruthy()
  const res = await page.request.post(`${API}/test/run-notifications`, { data: {} })
  expect(await res.json()).toMatchObject({ count: 1, shown: true, title: 'Task to start (1)' })
})

test.describe('Import refusé', () => {
  test.afterEach(async ({ electronApp }) => {
    await restoreDialogs(electronApp)
  })

  test("le motif est expliqué dans la langue de l'interface", async ({
    page,
    electronApp,
    header,
    settingsPage,
  }, testInfo) => {
    const file = testInfo.outputPath('not-an-export.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ format: 'other', version: 1, stages: [], tags: [], tasks: [] }))
    await stubOpenDialog(electronApp, file)

    await switchToEnglish(page, settingsPage, header)
    await settingsPage.askImport()
    await settingsPage.confirmAcceptButton.click()

    await expect(page.getByText('Import rejected', { exact: true })).toBeVisible()
    await expect(page.getByText('This file is not a NexTask export. No data was changed.')).toBeVisible()
  })
})
