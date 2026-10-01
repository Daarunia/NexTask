import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E des boutons d'ouverture du dossier des données et du dossier des
 * journaux (page Paramètres).
 *
 * En mode test, le main n'ouvre pas l'explorateur de fichiers : il note le
 * dossier demandé, relu via GET /test/opened-folders (vidé par le reset).
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Dossiers dont l'ouverture a été demandée depuis le dernier reset. */
async function openedFolders(request: APIRequestContext): Promise<{ kind: string; path: string }[]> {
  const res = await request.get(`${API}/test/opened-folders`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { kind: string; path: string }[]
}

test('aucun dossier ouvert au départ', async ({ page }) => {
  expect(await openedFolders(page.request)).toEqual([])
})

test('ouvre le dossier des données, qui contient la base', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openDataFolderButton.click()

  await expect.poll(async () => (await openedFolders(page.request)).map((f) => f.kind)).toEqual(['data'])
  const [folder] = await openedFolders(page.request)
  expect(fs.existsSync(path.join(folder.path, 'test.db'))).toBe(true)
})

test('ouvre le dossier des journaux, créé au besoin', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openLogsFolderButton.click()

  await expect.poll(async () => (await openedFolders(page.request)).map((f) => f.kind)).toEqual(['logs'])
  const [folder] = await openedFolders(page.request)
  expect(fs.statSync(folder.path).isDirectory()).toBe(true)
})
