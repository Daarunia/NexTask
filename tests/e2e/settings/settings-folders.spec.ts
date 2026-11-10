import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { ElectronApplication } from 'playwright'
import type { APIRequestContext } from '@playwright/test'
import { API, TEST_INDEX } from '../../helpers/api.helper'
import { desktop } from '../../helpers/desktop.helper'
import { testFileSuffix } from '@core/shared/test.constants'

/**
 * Tests E2E des boutons d'ouverture du dossier des données et du dossier des
 * journaux (page Paramètres).
 *
 * En mode test, le main n'ouvre pas l'explorateur de fichiers : il note le
 * dossier demandé, relu par le pont de test (vidé par le reset).
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Dossiers dont l'ouverture a été demandée depuis le dernier reset. */
function openedFolders(electronApp: ElectronApplication): Promise<{ kind: string; path: string }[]> {
  return desktop(electronApp, 'openedFolders')
}

test('aucun dossier ouvert au départ', async ({ electronApp, page }) => {
  expect(await openedFolders(electronApp)).toEqual([])
})

test('ouvre le dossier des données, qui contient la base', async ({ electronApp, page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openDataFolderButton.click()

  await expect.poll(async () => (await openedFolders(electronApp)).map((f) => f.kind)).toEqual(['data'])
  const [folder] = await openedFolders(electronApp)
  expect(fs.existsSync(path.join(folder.path, `test${testFileSuffix(TEST_INDEX)}.db`))).toBe(true)
})

test('ouvre le dossier des journaux, créé au besoin', async ({ electronApp, page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openLogsFolderButton.click()

  await expect.poll(async () => (await openedFolders(electronApp)).map((f) => f.kind)).toEqual(['logs'])
  const [folder] = await openedFolders(electronApp)
  expect(fs.statSync(folder.path).isDirectory()).toBe(true)
})
