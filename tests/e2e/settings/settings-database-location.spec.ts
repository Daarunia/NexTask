import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { API, TEST_INDEX } from '../../helpers/api.helper'
import { restoreDialogs, stubOpenDialog } from '../../helpers/dialog.helper'
import { testFileSuffix } from '../../../src/main/shared/test.constants'
import { DATABASE_FILE_NAME } from '../../../src/main/shared/database.constants'
import type { SettingsPage } from '../../components/SettingsPage'

/**
 * Tests E2E de l'emplacement de la base (page Paramètres) : chemin affiché,
 * déplacement dans un dossier, ouverture d'une base existante et refus.
 *
 * En mode test, l'app ne redémarre pas après un changement d'emplacement :
 * elle garde sa base de test, et le nouvel emplacement enregistré est relu
 * via GET /test/database-location (oublié par le reset, comme au lancement).
 *
 * Isolation : base, paramètres et emplacement remis à zéro avant chaque test (fixture `cleanState`).
 */

// Base de test du worker, à l'emplacement par défaut (racine du projet en test)
const TEST_DB = path.resolve(`test${testFileSuffix(TEST_INDEX)}.db`)

/** Emplacement enregistré et redémarrage demandé depuis le dernier reset. */
async function storedLocation(
  request: APIRequestContext,
): Promise<{ storedPath: string | null; relaunchRequested: boolean }> {
  const res = await request.get(`${API}/test/database-location`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { storedPath: string | null; relaunchRequested: boolean }
}

/** Vrai si le fichier commence par l'en-tête d'une base SQLite. */
function isSqliteFile(file: string): boolean {
  return fs.readFileSync(file).subarray(0, 16).toString('latin1') === 'SQLite format 3\0'
}

/**
 * Dossier vide propre au test.
 * @param name Nom du dossier dans le dossier de sortie du test
 */
function emptyFolder(name: string): string {
  const folder = test.info().outputPath(name)
  fs.rmSync(folder, { recursive: true, force: true })
  fs.mkdirSync(folder, { recursive: true })
  return folder
}

/**
 * Déplace la base dans un dossier depuis les Paramètres, confirmation comprise.
 */
async function moveDatabaseTo(electronApp: ElectronApplication, settingsPage: SettingsPage, folder: string) {
  await stubOpenDialog(electronApp, folder)
  await settingsPage.askMoveDatabase()
  await settingsPage.confirmAcceptButton.click()
}

/**
 * Ouvre une base depuis les Paramètres, confirmation comprise.
 */
async function openDatabaseFile(electronApp: ElectronApplication, settingsPage: SettingsPage, file: string) {
  await stubOpenDialog(electronApp, file)
  await settingsPage.askOpenDatabase()
  await settingsPage.confirmAcceptButton.click()
}

/** Toast d'erreur affiché pour un emplacement refusé. */
function rejection(page: Page, reason: string) {
  return page.locator('.p-toast-message').filter({ hasText: 'Emplacement refusé' }).filter({ hasText: reason })
}

test.afterEach(async ({ electronApp }) => {
  await restoreDialogs(electronApp)
})

test("affiche l'emplacement par défaut de la base", async ({ header, settingsPage }) => {
  await header.goSettings()

  await expect(settingsPage.databaseLocationRow).toContainText(`${TEST_DB} (emplacement par défaut)`)
  await expect(settingsPage.useDefaultLocationButton).toHaveCount(0)
})

test('ouvre le dossier de la base', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openDatabaseFolderButton.click()

  await expect
    .poll(async () => (await (await page.request.get(`${API}/test/opened-folders`)).json()) as { kind: string }[])
    .toEqual([{ kind: 'database', path: path.dirname(TEST_DB) }])
})

test.describe('Déplacer la base', () => {
  test('copie la base dans le dossier choisi et enregistre son emplacement', async ({
    page,
    electronApp,
    header,
    settingsPage,
  }) => {
    const folder = emptyFolder('cle-usb')
    const target = path.join(folder, DATABASE_FILE_NAME)
    await header.goSettings()

    // Annuler la confirmation ne change rien
    await settingsPage.askMoveDatabase()
    await settingsPage.confirmRejectButton.click()
    await expect(settingsPage.confirmPopup).toBeHidden()
    expect(await storedLocation(page.request)).toEqual({ storedPath: null, relaunchRequested: false })

    await moveDatabaseTo(electronApp, settingsPage, folder)

    await expect(page.getByText('Redémarrage de NexTask…', { exact: true })).toBeVisible()
    await expect(page.getByText(`Ouverture de la base ${target}`, { exact: true })).toBeVisible()
    expect(await storedLocation(page.request)).toEqual({ storedPath: target, relaunchRequested: true })
    expect(isSqliteFile(target)).toBe(true)
    // Base copiée en un seul fichier, sans journal WAL ni copie temporaire
    expect(fs.readdirSync(folder)).toEqual([DATABASE_FILE_NAME])
    // L'ancienne base reste en place
    expect(fs.existsSync(TEST_DB)).toBe(true)
  })

  test('annuler le choix du dossier ne change rien', async ({ page, electronApp, header, settingsPage }) => {
    await header.goSettings()
    await stubOpenDialog(electronApp, null)
    await settingsPage.askMoveDatabase()
    await settingsPage.confirmAcceptButton.click()

    await expect(settingsPage.moveDatabaseButton).toBeEnabled()
    expect(await storedLocation(page.request)).toEqual({ storedPath: null, relaunchRequested: false })
  })

  test("refuse un dossier qui contient déjà une base, sans l'écraser", async ({
    page,
    electronApp,
    header,
    settingsPage,
  }) => {
    const folder = emptyFolder('dossier-occupe')
    const existing = path.join(folder, DATABASE_FILE_NAME)
    fs.writeFileSync(existing, 'base déjà là')
    await header.goSettings()

    await moveDatabaseTo(electronApp, settingsPage, folder)

    await expect(rejection(page, 'Ce dossier contient déjà une base nextask.db')).toBeVisible()
    expect(fs.readFileSync(existing, 'utf8')).toBe('base déjà là')
    expect(await storedLocation(page.request)).toEqual({ storedPath: null, relaunchRequested: false })
  })
})

test.describe('Ouvrir une base', () => {
  test('enregistre une base NexTask existante', async ({ page, electronApp, header, settingsPage }) => {
    // Base NexTask valide : copie de la base de test, faite par un déplacement
    // puis oubliée par le reset
    const folder = emptyFolder('base-existante')
    const file = path.join(folder, DATABASE_FILE_NAME)
    await header.goSettings()
    await moveDatabaseTo(electronApp, settingsPage, folder)
    await expect.poll(async () => (await storedLocation(page.request)).storedPath).toBe(file)
    expect((await page.request.post(`${API}/test/reset`)).ok()).toBeTruthy()
    await page.reload()
    await header.goSettings()

    await openDatabaseFile(electronApp, settingsPage, file)

    await expect(page.getByText(`Ouverture de la base ${file}`, { exact: true })).toBeVisible()
    expect(await storedLocation(page.request)).toEqual({ storedPath: file, relaunchRequested: true })
  })

  test("refuse un fichier qui n'est pas une base de données", async ({ page, electronApp, header, settingsPage }) => {
    const file = path.join(emptyFolder('pas-une-base'), 'notes.db')
    fs.writeFileSync(file, 'Ceci est un fichier texte, pas une base SQLite.')
    await header.goSettings()

    await openDatabaseFile(electronApp, settingsPage, file)

    await expect(rejection(page, "Ce fichier n'est pas une base de données")).toBeVisible()
    expect(await storedLocation(page.request)).toEqual({ storedPath: null, relaunchRequested: false })
  })

  test('refuse la base déjà utilisée par NexTask', async ({ page, electronApp, header, settingsPage }) => {
    await header.goSettings()

    await openDatabaseFile(electronApp, settingsPage, TEST_DB)

    await expect(rejection(page, 'NexTask utilise déjà cette base')).toBeVisible()
    expect(await storedLocation(page.request)).toEqual({ storedPath: null, relaunchRequested: false })
  })
})
